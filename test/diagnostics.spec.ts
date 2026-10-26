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
  it("REG-070 stores the exact loop decision and seek evidence without losing replayed batches", async () => {
    const device = await pairedDevice();
    const response = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "self_hosted", playbackMode: "listen", userAgent: "iPhone Safari",
      }),
    });
    expect(response.status).toBe(201);
    const { id } = await response.json<{ id: string }>();
    const occurredAt = new Date().toISOString();
    const events = [
      { seq: 1, type: "native_media_event", occurredAt, detail: { state: "source_changed", initialStartAt: 268, previousTime: 0, loopArmed: false, sourceGeneration: 1 } },
      { seq: 2, type: "native_media_event", occurredAt, detail: { state: "loop_seek_requested", previousTime: 267.6, currentTime: 0, loopReason: "explicit_seek", loopSeekPending: true } },
      { seq: 3, type: "native_media_event", occurredAt, detail: { state: "loop_boundary_ignored", previousTime: 267.6, currentTime: 0, loopReason: "not_armed" } },
      { seq: 4, type: "native_media_event", occurredAt, detail: {
        state: "loop_boundary_accepted", previousTime: 267.6, currentTime: 0.1, duration: 267.84,
        loopStartLimit: 2, loopEndThreshold: 265.84, loopReason: "end_to_start", loopArmed: false,
      } },
      { seq: 5, type: "native_media_event", occurredAt, detail: { state: "learning_listen_loop", repeatCount: 1, loopReason: "end_to_start" } },
      { seq: 6, type: "native_media_event", occurredAt, detail: { state: "learning_listen_completion", repeatCount: 5, loopReason: "media_ended" } },
    ];
    for (let replay = 0; replay < 2; replay++) {
      expect((await call(`/api/diagnostics/sessions/${id}/events`, {
        method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({ events }),
      })).status).toBe(200);
    }
    const exported = await call(`/api/diagnostics/export?sessionId=${id}`, {
      headers: { authorization: "Bearer test-read-only-diagnostics-token" },
    });
    expect(exported.status).toBe(200);
    const payload = await exported.json<{ events: Array<{ seq: number; detailJson: string }> }>();
    expect(payload.events.map((event) => ({ seq: event.seq, detail: JSON.parse(event.detailJson) })))
      .toEqual(events.map(({ seq, detail }) => ({ seq, detail })));
  });

  it("REG-069 preserves prepared-next and repeat evidence without treating readiness as recovery", async () => {
    const device = await pairedDevice();
    const started = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "self_hosted", playbackMode: "listen", userAgent: "iPad Safari",
      }),
    });
    expect(started.status).toBe(201);
    const { id } = await started.json<{ id: string }>();
    const occurredAt = new Date().toISOString();
    const events = [
      { seq: 1, type: "autoplay_blocked", occurredAt, errorCode: "AUTOPLAY_NOT_STARTED" },
      { seq: 2, type: "native_media_event", occurredAt, detail: { state: "next_source_preparing", transition: "next-lesson" } },
      { seq: 3, type: "native_media_event", occurredAt, detail: { state: "next_source_prepared", sourceKind: "blob", documentHidden: false } },
      { seq: 4, type: "native_media_event", occurredAt, detail: { state: "learning_listen_loop", repeatCount: 4 } },
      { seq: 5, type: "native_media_event", occurredAt, detail: { state: "next_source_claimed", transition: "next-lesson", documentHidden: true } },
      { seq: 6, type: "next_requested", occurredAt, detail: { transition: "learning_repeat_complete", repeatCount: 5 } },
    ];
    const write = (batch: unknown[]) => call(`/api/diagnostics/sessions/${id}/events`, {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({ events: batch }),
    });
    expect((await write(events)).status).toBe(200);
    expect((await write(events)).status).toBe(200);
    const rows = await env.DB.prepare("SELECT event_seq, detail_json FROM diagnostic_events WHERE diagnostic_session_id = ? ORDER BY event_seq")
      .bind(id).all<{ event_seq: number; detail_json: string | null }>();
    expect(rows.results.map((row) => row.event_seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(JSON.parse(rows.results[4].detail_json!)).toMatchObject({ state: "next_source_claimed", transition: "next-lesson", documentHidden: true });
    const outcome = async () => (await env.DB.prepare("SELECT outcome FROM diagnostic_sessions WHERE id = ?")
      .bind(id).first<{ outcome: string }>())?.outcome;
    expect(await outcome()).toBe("error");
    expect((await write([{ seq: 7, type: "playback_confirmed", occurredAt, positionSeconds: 1 }])).status).toBe(200);
    expect(await outcome()).toBe("recovered");
  });

  it("REG-068 accepts YouTube initialization phases and retains the error until real progress", async () => {
    const device = await pairedDevice();
    const response = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "youtube", playbackMode: "video", userAgent: "Safari",
      }),
    });
    expect(response.status).toBe(201);
    const { id } = await response.json<{ id: string }>();
    const occurredAt = new Date().toISOString();
    const events = [
      { seq: 1, type: "player_created", occurredAt, detail: { state: "youtube_api_requested", errorOperation: "youtube_initialization" } },
      { seq: 2, type: "youtube_error", occurredAt, errorCode: "YT_API_TIMEOUT", detail: { state: "youtube_initialization_failed", retryRemainingMs: 50000 } },
      { seq: 3, type: "retry_started", occurredAt, detail: { state: "youtube_api_requested", retryNumber: 1 } },
      { seq: 4, type: "player_created", occurredAt, detail: { state: "youtube_api_ready" } },
      { seq: 5, type: "player_created", occurredAt, detail: { state: "youtube_iframe_requested" } },
      { seq: 6, type: "player_created", occurredAt, detail: { state: "youtube_iframe_ready" } },
      { seq: 7, type: "player_ready", occurredAt },
    ];
    const write = (batch: unknown[]) => call(`/api/diagnostics/sessions/${id}/events`, {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({ events: batch }),
    });
    expect((await write(events)).status).toBe(200);
    expect((await write(events)).status).toBe(200);
    const outcome = async () => (await env.DB.prepare("SELECT outcome FROM diagnostic_sessions WHERE id = ?")
      .bind(id).first<{ outcome: string }>())?.outcome;
    expect(await outcome()).toBe("error");
    const exported = await call(`/api/diagnostics/export?sessionId=${id}`, {
      headers: { authorization: "Bearer test-read-only-diagnostics-token" },
    });
    expect(exported.status).toBe(200);
    const payload = await exported.json<{ events: Array<{ seq: number; type: string; detailJson: string | null }> }>();
    expect(payload.events.map(({ seq, type }) => ({ seq, type }))).toEqual(events.map(({ seq, type }) => ({ seq, type })));
    expect(JSON.parse(payload.events[1].detailJson!)).toMatchObject({ state: "youtube_initialization_failed", retryRemainingMs: 50000 });
    expect((await write([{ seq: 8, type: "playback_confirmed", occurredAt, positionSeconds: 1 }])).status).toBe(200);
    expect(await outcome()).toBe("recovered");
  });

  it("REG-066 accepts and replays complete baseline batches without losing startup or failure evidence", async () => {
    const device = await pairedDevice();
    const response = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "self_hosted", playbackMode: "listen", userAgent: "iPhone Safari",
      }),
    });
    expect(response.status).toBe(201);
    const { id } = await response.json<{ id: string }>();
    const occurredAt = new Date().toISOString();
    const startup = [
      { seq: 1, type: "page_opened", occurredAt, detail: { diagnosticVersion: "playback-v2" } },
      { seq: 2, type: "player_created", occurredAt },
      { seq: 3, type: "playback_baseline", occurredAt, detail: { state: "2026-09-06@59bcc15" } },
      { seq: 4, type: "player_ready", occurredAt },
      { seq: 5, type: "baseline_metadata_ready", occurredAt, detail: { retryNumber: 1 } },
      { seq: 6, type: "play_requested", occurredAt },
      { seq: 7, type: "playing", occurredAt },
      { seq: 8, type: "native_media_event", occurredAt, errorCode: "NATIVE_RESUME_STALLED", detail: {
        state: "system_resume_stalled", sourceKind: "blob", documentHidden: true, currentTime: 12,
      } },
    ];
    const write = (events: unknown[]) => call(`/api/diagnostics/sessions/${id}/events`, {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({ events }),
    });
    // A pending batch from an older PWA must be accepted as a whole and stay idempotent.
    expect((await write(startup)).status).toBe(200);
    expect((await write(startup)).status).toBe(200);
    const exported = await call(`/api/diagnostics/export?sessionId=${id}`, {
      headers: { authorization: "Bearer test-read-only-diagnostics-token" },
    });
    expect(exported.status).toBe(200);
    const payload = await exported.json<{ events: Array<{ seq: number; type: string; errorCode: string | null }> }>();
    expect(payload.events.map(({ seq, type }) => ({ seq, type })))
      .toEqual(startup.map(({ seq, type }) => ({ seq, type })));
    expect(payload.events[7].errorCode).toBe("NATIVE_RESUME_STALLED");
    const outcome = async () => (await env.DB.prepare("SELECT outcome FROM diagnostic_sessions WHERE id = ?")
      .bind(id).first<{ outcome: string }>())?.outcome;
    expect(await outcome()).toBe("error");
    expect((await write([{ seq: 9, type: "baseline_metadata_ready", occurredAt }])).status).toBe(200);
    expect(await outcome()).toBe("error");
    expect((await write([{ seq: 10, type: "playback_confirmed", occurredAt, positionSeconds: 13 }])).status).toBe(200);
    expect(await outcome()).toBe("recovered");
    expect((await write([{ seq: 11, type: "unsupported_event_typo", occurredAt }])).status).toBe(400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM diagnostic_events WHERE diagnostic_session_id = ?")
      .bind(id).first<{ count: number }>())?.count).toBe(10);
    expect((await call(`/api/diagnostics/sessions/${id}`, {
      method: "PATCH", headers: { cookie: device.cookie }, body: JSON.stringify({ outcome: "success" }),
    })).status).toBe(200);
    expect(await outcome()).toBe("recovered");
  });

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

  it("preserves background playback evidence and does not label metadata-only failures recovered", async () => {
    const device = await pairedDevice();
    const started = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "self_hosted", playbackMode: "listen", userAgent: "iPad Safari",
      }),
    });
    const { id } = await started.json<{ id: string }>();
    const write = async (events: unknown[]) => {
      expect((await call(`/api/diagnostics/sessions/${id}/events`, {
        method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({ events }),
      })).status).toBe(200);
    };
    await write([
      { seq: 1, type: "page_opened", occurredAt: new Date().toISOString(), detail: { diagnosticVersion: "playback-v2" } },
      { seq: 2, type: "media_error", occurredAt: new Date().toISOString(), errorCode: "PLAY_NOT_ALLOWED", detail: {
        errorName: "NotAllowedError", errorOperation: "play", sourceKind: "blob", documentHidden: true,
        readyState: 1, networkState: 2, bufferedAheadSeconds: 0, playIntent: true,
        message: "Rejected https://private.example/video.mp4?secret=hidden",
      } },
      { seq: 3, type: "player_ready", occurredAt: new Date().toISOString() },
      { seq: 4, type: "playing", occurredAt: new Date().toISOString() },
    ]);
    expect((await env.DB.prepare("SELECT outcome FROM diagnostic_sessions WHERE id = ?").bind(id).first<{ outcome: string }>())?.outcome).toBe("error");
    const detail = await env.DB.prepare("SELECT detail_json FROM diagnostic_events WHERE diagnostic_session_id = ? AND event_seq = 2")
      .bind(id).first<{ detail_json: string }>();
    expect(JSON.parse(detail!.detail_json)).toMatchObject({
      errorName: "NotAllowedError", errorOperation: "play", sourceKind: "blob", documentHidden: true,
      readyState: 1, networkState: 2, bufferedAheadSeconds: 0, playIntent: true,
    });
    expect(detail!.detail_json).not.toContain("private.example");
    await write([{ seq: 5, type: "playback_confirmed", occurredAt: new Date().toISOString(), positionSeconds: 1 }]);
    expect((await env.DB.prepare("SELECT outcome FROM diagnostic_sessions WHERE id = ?").bind(id).first<{ outcome: string }>())?.outcome).toBe("recovered");
    await write([{ seq: 6, type: "media_error", occurredAt: new Date().toISOString(), errorCode: "MEDIA_ERROR_2" }]);
    expect((await env.DB.prepare("SELECT outcome FROM diagnostic_sessions WHERE id = ?").bind(id).first<{ outcome: string }>())?.outcome).toBe("error");
  });

  it("retains false-playing resume failures and optional audio-session evidence", async () => {
    const device = await pairedDevice();
    const response = await call("/api/diagnostics/sessions", {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({
        clientSessionId: crypto.randomUUID(), source: "self_hosted", playbackMode: "listen", userAgent: "iPad Safari",
      }),
    });
    const { id } = await response.json<{ id: string }>();
    expect((await call(`/api/diagnostics/sessions/${id}/events`, {
      method: "POST", headers: { cookie: device.cookie }, body: JSON.stringify({ events: [
        { seq: 1, type: "page_opened", occurredAt: new Date().toISOString(), detail: { diagnosticVersion: "playback-v2" } },
        { seq: 2, type: "native_media_event", occurredAt: new Date().toISOString(), errorCode: "NATIVE_RESUME_STALLED", detail: {
          state: "system_resume_stalled", audioSessionState: "inactive", audioSessionType: "auto",
          systemPlaybackState: "playing", userActivationActive: false, currentTime: 215.77,
          mediaPaused: false, bufferedAheadSeconds: 661,
        } },
        { seq: 3, type: "playing", occurredAt: new Date().toISOString() },
      ] }),
    })).status).toBe(200);
    const row = await env.DB.prepare("SELECT outcome, last_error_code FROM diagnostic_sessions WHERE id = ?")
      .bind(id).first<{ outcome: string; last_error_code: string }>();
    expect(row).toEqual({ outcome: "error", last_error_code: "NATIVE_RESUME_STALLED" });
    const event = await env.DB.prepare("SELECT detail_json FROM diagnostic_events WHERE diagnostic_session_id = ? AND event_seq = 2")
      .bind(id).first<{ detail_json: string }>();
    expect(JSON.parse(event!.detail_json)).toMatchObject({
      audioSessionState: "inactive", audioSessionType: "auto", systemPlaybackState: "playing", userActivationActive: false,
    });
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
