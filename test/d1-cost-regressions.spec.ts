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
    env.DB.prepare("DELETE FROM daily_category_usage_totals"),
    env.DB.prepare("DELETE FROM daily_overrides"),
    env.DB.prepare("DELETE FROM allowed_windows"),
    env.DB.prepare("UPDATE categories SET daily_limit_seconds = NULL"),
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

  it("uses an interval-end index for the narrow heartbeat overlap lookup", async () => {
    const plan = await env.DB.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id FROM view_heartbeats INDEXED BY idx_view_heartbeats_overlap_end
      WHERE interval_ended_at > ? AND interval_started_at < ?
    `).bind("2026-09-02T00:00:00.000Z", "2026-09-02T00:01:00.000Z")
      .all<{ detail: string }>();
    const details = (plan.results || []).map((row) => row.detail).join("\n");

    expect(details).toContain("idx_view_heartbeats_overlap_end");
    expect(details).toMatch(/interval_ended_at>\?/);
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

  it("reads category limits from the compact daily category rollup", async () => {
    const { dateStr } = getTaipeiDateParts();
    const category = await env.DB.prepare(
      "SELECT id FROM categories WHERE is_active = 1 AND archived_at IS NULL ORDER BY sort_order LIMIT 1",
    ).first<{ id: string }>();
    expect(category).toBeTruthy();
    await env.DB.batch([
      env.DB.prepare("UPDATE categories SET daily_limit_seconds = 600 WHERE id = ?").bind(category!.id),
      env.DB.prepare(`
        INSERT INTO daily_category_usage_totals (usage_date, category_id, video_seconds, updated_at)
        VALUES (?, ?, 420, ?)
      `).bind(dateStr, category!.id, new Date().toISOString()),
    ]);

    const response = await call("/api/child/access-state");
    expect(response.status).toBe(200);
    const body = await response.json<any>();
    expect(body.categoryStates.find((item: any) => item.categoryId === category!.id)).toMatchObject({
      dailyLimitSeconds: 600,
      todayPlayedSeconds: 420,
      remainingSeconds: 180,
      isReached: false,
    });

    const lookup = await env.DB.prepare(
      "SELECT video_seconds FROM daily_category_usage_totals WHERE usage_date = ? AND category_id = ?",
    ).bind(dateStr, category!.id).all();
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
