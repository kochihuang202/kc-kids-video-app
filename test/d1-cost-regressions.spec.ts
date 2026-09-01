import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getTaipeiDateParts } from "../worker/rules";
import { tokenHash } from "../worker/security";
import type { AppEnv } from "../worker/types";
import worker from "../worker";

const appEnv = env as unknown as AppEnv;
const origin = "https://app.test";

async function call(path: string, init: RequestInit = {}) {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request(`${origin}${path}`, init), appEnv, context);
  await waitOnExecutionContext(context);
  return response;
}

async function pairFreshDevice() {
  const token = "d1-cost-regression-device-token-long-enough";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at) VALUES (?, ?, '成本測試', ?, ?)",
  ).bind(id, await tokenHash(token, appEnv), now, now).run();
  return { id, cookie: `kid_device=${token}`, lastUsedAt: now };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM view_heartbeats"),
    env.DB.prepare("DELETE FROM view_sessions"),
    env.DB.prepare("DELETE FROM child_devices"),
    env.DB.prepare("DELETE FROM daily_usage_totals"),
    env.DB.prepare("DELETE FROM daily_overrides"),
    env.DB.prepare("DELETE FROM allowed_windows"),
  ]);
});

describe("REG-004 D1 request cost guardrails", () => {
  it("uses the video-first category index instead of scanning every category mapping", async () => {
    const plan = await env.DB.prepare(`
      EXPLAIN QUERY PLAN
      SELECT category_id FROM category_videos WHERE video_id = ? ORDER BY sort_order
    `).bind("why-sky-blue").all<{ detail: string }>();
    const details = (plan.results || []).map((row) => row.detail).join("\n");

    expect(details).toContain("idx_category_videos_video_order");
    expect(details).not.toMatch(/SCAN category_videos/i);
  });

  it("reads the compact daily rollup instead of rebuilding today's heartbeat history", async () => {
    const { dateStr } = getTaipeiDateParts();
    await env.DB.prepare(`
      INSERT INTO daily_usage_totals (
        usage_date, leisure_seconds, learning_seconds, listen_seconds, total_seconds, updated_at
      ) VALUES (?, 30, 120, 15, 165, ?)
    `).bind(dateStr, new Date().toISOString()).run();

    const response = await call("/api/child/access-state");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      leisureUsedSeconds: 30,
      learningSeconds: 120,
      listenSeconds: 15,
      todayPlayedSeconds: 165,
      earnedBonusSeconds: 60,
    });
    const lookup = await env.DB.prepare(
      "SELECT leisure_seconds, learning_seconds, listen_seconds, total_seconds FROM daily_usage_totals WHERE usage_date = ?",
    ).bind(dateStr).all();
    expect(lookup.meta.rows_read).toBeLessThanOrEqual(1);
  });

  it("does not write child_devices.last_used_at again while the touch is still fresh", async () => {
    const device = await pairFreshDevice();
    const response = await call("/api/device/status", { headers: { cookie: device.cookie } });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare("SELECT last_used_at FROM child_devices WHERE id = ?")
      .bind(device.id).first<{ last_used_at: string }>();

    expect(row?.last_used_at).toBe(device.lastUsedAt);
  });
});
