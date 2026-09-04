import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { makePasswordRecord, tokenHash } from "../worker/security";
import type { AppEnv } from "../worker/types";
import worker from "../worker";

const appEnv = env as unknown as AppEnv;
const origin = "https://app.test";

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") headers.set("origin", origin);
  const context = createExecutionContext();
  const response = await worker.fetch(new Request(`${origin}${path}`, { ...init, headers }), appEnv, context);
  await waitOnExecutionContext(context);
  return response;
}

async function pairedDevice() {
  const token = "diagnostic-device-token";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at) VALUES (?, ?, '客廳 iPad', ?, ?)")
    .bind(id, await tokenHash(token, appEnv), now, now).run();
  return { id, cookie: `kid_device=${token}` };
}

async function parentCookie() {
  const password = "diagnostic parent password";
  const record = await makePasswordRecord(password, 100_000);
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO admin_credentials (id, password_hash, salt, iterations, created_at, updated_at) VALUES ('family', ?, ?, ?, ?, ?)")
    .bind(record.hash, record.salt, record.iterations, now, now).run();
  const response = await call("/api/parent/session", { method: "POST", body: JSON.stringify({ password }) });
  return response.headers.get("set-cookie")!.split(";")[0];
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM diagnostic_events"),
    env.DB.prepare("DELETE FROM diagnostic_sessions"),
    env.DB.prepare("DELETE FROM diagnostic_error_rollups"),
    env.DB.prepare("UPDATE diagnostic_maintenance SET last_run_at = '1970-01-01T00:00:00.000Z' WHERE id = 'retention'"),
    env.DB.prepare("DELETE FROM admin_sessions"),
    env.DB.prepare("DELETE FROM admin_credentials"),
    env.DB.prepare("DELETE FROM child_devices"),
  ]);
});

describe("playback diagnostics", () => {
  it("keeps an idempotent device timeline and marks retry success as recovered", async () => {
    const device = await pairedDevice();
    const start = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), videoId: "why-sky-blue", videoLabel: "天空為什麼是藍色？",
        categoryId: "science", source: "youtube", playbackMode: "video", userAgent: "iPad Safari",
        platform: "iPad", browserName: "Safari", osName: "iPadOS", viewportWidth: 834, viewportHeight: 1194,
      }),
    });
    expect(start.status).toBe(201);
    const id = (await start.json() as { id: string }).id;
    const events = { events: [
      { seq: 1, type: "play_requested", occurredAt: "2026-09-04T10:00:00.000Z" },
      { seq: 2, type: "retry_started", occurredAt: "2026-09-04T10:00:01.000Z", detail: { retryNumber: 1 } },
      { seq: 3, type: "youtube_error", occurredAt: "2026-09-04T10:00:02.000Z", errorCode: "YT_ERROR_5" },
      { seq: 4, type: "playing", occurredAt: "2026-09-04T10:00:03.000Z" },
    ] };
    for (let repeat = 0; repeat < 2; repeat += 1) {
      expect((await call(`/api/diagnostics/sessions/${id}/events`, {
        method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify(events),
      })).status).toBe(200);
    }
    expect((await call(`/api/diagnostics/sessions/${id}`, {
      method: "PATCH", headers: { cookie: device.cookie }, body: JSON.stringify({ outcome: "success" }),
    })).status).toBe(200);
    const row = await env.DB.prepare("SELECT retry_count, error_count, outcome FROM diagnostic_sessions WHERE id = ?")
      .bind(id).first<{ retry_count: number; error_count: number; outcome: string }>();
    expect(row).toEqual({ retry_count: 1, error_count: 1, outcome: "recovered" });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM diagnostic_events WHERE diagnostic_session_id = ?")
      .bind(id).first<{ count: number }>();
    expect(count?.count).toBe(4);
  });

  it("protects parent diagnostics and supports the read-only export token", async () => {
    expect((await call("/api/parent/diagnostics/summary")).status).toBe(401);
    const cookie = await parentCookie();
    const summary = await call("/api/parent/diagnostics/summary", { headers: { cookie } });
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({ devices: [], errors: [] });
    expect((await call("/api/diagnostics/export")).status).toBe(401);
    const exported = await call("/api/diagnostics/export", {
      headers: { authorization: "Bearer test-read-only-diagnostics-token" },
    });
    expect(exported.status).toBe(200);
    expect(await exported.json()).toMatchObject({ sessions: [] });
  });

  it("rolls old errors into summaries and keeps only 100 successful sessions per device", async () => {
    const device = await pairedDevice();
    const oldStarted = new Date(Date.now() - 40 * 86400000).toISOString();
    await env.DB.prepare(`
      INSERT INTO diagnostic_sessions (
        id, client_session_id, device_id, device_name_snapshot, source, playback_mode,
        outcome, error_count, last_error_code, user_agent, started_at, ended_at, updated_at
      ) VALUES ('old-error', 'old-error-client', ?, '客廳 iPad', 'self_hosted', 'video',
        'error', 1, 'MEDIA_PROBE_FAILED', 'Safari', ?, ?, ?)
    `).bind(device.id, oldStarted, oldStarted, oldStarted).run();
    await env.DB.prepare(`
      INSERT INTO diagnostic_events (
        diagnostic_session_id, event_seq, event_type, occurred_at, received_at, error_code
      ) VALUES ('old-error', 1, 'media_probe', ?, ?, 'MEDIA_PROBE_FAILED')
    `).bind(oldStarted, oldStarted).run();

    const statements = Array.from({ length: 101 }, (_, index) => {
      const at = new Date(Date.now() - index * 1000).toISOString();
      return env.DB.prepare(`
        INSERT INTO diagnostic_sessions (
          id, client_session_id, device_id, device_name_snapshot, source, playback_mode,
          outcome, user_agent, started_at, ended_at, updated_at
        ) VALUES (?, ?, ?, '客廳 iPad', 'youtube', 'video', 'success', 'Safari', ?, ?, ?)
      `).bind(`success-${index}`, `success-client-${index}`, device.id, at, at, at);
    });
    for (let index = 0; index < statements.length; index += 40) {
      await env.DB.batch(statements.slice(index, index + 40));
    }
    await env.DB.prepare("UPDATE diagnostic_maintenance SET last_run_at = '1970-01-01T00:00:00.000Z'").run();

    const trigger = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "youtube", playbackMode: "video", userAgent: "Safari",
      }),
    });
    expect(trigger.status).toBe(201);

    const oldSession = await env.DB.prepare("SELECT id FROM diagnostic_sessions WHERE id = 'old-error'").first();
    expect(oldSession).toBeNull();
    const rollup = await env.DB.prepare(`
      SELECT occurrence_count, session_count FROM diagnostic_error_rollups
      WHERE device_id = ? AND error_code = 'MEDIA_PROBE_FAILED'
    `).bind(device.id).first<{ occurrence_count: number; session_count: number }>();
    expect(rollup).toEqual({ occurrence_count: 1, session_count: 1 });
    const successes = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM diagnostic_sessions WHERE device_id = ? AND outcome = 'success'",
    ).bind(device.id).first<{ count: number }>();
    expect(successes?.count).toBe(100);
  });
});
