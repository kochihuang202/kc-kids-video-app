import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { tokenHash } from "../worker/security";
import { getDayRangeInTimeZone } from "../worker/rules";
import type { AppEnv } from "../worker/types";
import worker from "../worker";

const appEnv = env as unknown as AppEnv;
const origin = "https://app.test";
type Session = { id: string; writeToken: string };

async function call(path: string, init: RequestInit = {}, runtime = appEnv) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") headers.set("origin", origin);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${origin}${path}`, { ...init, headers }), runtime, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function start(mode: "video" | "listen" = "video", videoId = "why-sky-blue") {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at) VALUES (?, ?, 'heartbeat regression', ?, ?)")
    .bind(id, await tokenHash(token, appEnv), now, now).run();
  const cookie = `kid_device=${token}; kid_profile_id=child_ayun`;
  const response = await call("/api/view-sessions", {
    method: "POST", headers: { cookie },
    body: JSON.stringify({ videoId, clientSessionId: crypto.randomUUID(), playbackMode: mode }),
  });
  expect(response.status).toBe(201);
  return { cookie, session: await response.json<Session>() };
}

function send(cookie: string, session: Session, seq: number, delta: number, position: number, status = "active", runtime = appEnv) {
  const end = new Date();
  return call(`/api/view-sessions/${session.id}`, {
    method: "PATCH", headers: { cookie },
    body: JSON.stringify({ writeToken: session.writeToken, heartbeatSeq: seq, deltaSeconds: delta,
      positionSeconds: position, status, intervalStartedAt: new Date(end.getTime() - Math.max(delta, 1) * 1000).toISOString(),
      intervalEndedAt: end.toISOString() }),
  }, runtime);
}

beforeEach(async () => {
  await env.DB.batch([
    ...["view_heartbeats", "notes", "view_sessions", "child_devices", "daily_usage_totals", "child_daily_usage",
      "child_category_daily_usage", "daily_category_usage_totals", "daily_overrides", "allowed_windows", "rate_limit_buckets"]
      .map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("UPDATE categories SET daily_limit_seconds = NULL, is_active = 1, archived_at = NULL"),
  ]);
});

describe("REG-073 heartbeat cost and retained history", () => {
  it("acknowledges legacy zero-second polling without growing history or changing the saved position", async () => {
    const { cookie, session } = await start();
    expect((await send(cookie, session, 1, 30, 197)).status).toBe(200);
    const before = await env.DB.prepare("SELECT played_seconds, updated_at FROM view_sessions WHERE id = ?").bind(session.id).first();
    for (let seq = 2; seq <= 7; seq++) expect((await send(cookie, session, seq, 0, 197)).status).toBe(200);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM view_heartbeats WHERE view_session_id = ?").bind(session.id).first<{ n: number }>();
    expect(count?.n).toBe(1);
    expect(await env.DB.prepare("SELECT played_seconds, updated_at FROM view_sessions WHERE id = ?").bind(session.id).first()).toEqual(before);

    // A real zero-second seek and a terminal update must still be saved.
    expect((await send(cookie, session, 8, 0, 210)).status).toBe(200);
    expect((await send(cookie, session, 9, 0, 210, "ended")).status).toBe(200);
    const closed = await env.DB.prepare("SELECT played_seconds, last_position_seconds, status, ended_at FROM view_sessions WHERE id = ?")
      .bind(session.id).first<any>();
    expect(closed).toMatchObject({ played_seconds: 30, last_position_seconds: 210, status: "ended" });
    expect(closed.ended_at).toBeTruthy();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM view_heartbeats WHERE view_session_id = ?").bind(session.id).first<{ n: number }>())?.n).toBe(1);
  });

  it("updates a 3,326-heartbeat session at bounded row-read cost while preserving the existing 242 seconds", async () => {
    const { cookie, session } = await start();
    const old = new Date(Date.now() - 2 * 86400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<3326)
        INSERT INTO view_heartbeats (id, view_session_id, heartbeat_seq, delta_seconds, position_seconds, interval_started_at, interval_ended_at, received_at)
        SELECT ? || '-' || x, ?, x, CASE WHEN x<=8 THEN 30 WHEN x=9 THEN 2 ELSE 0 END, 197, ?, ?, ? FROM n`)
        .bind(session.id, session.id, old, old, old),
      env.DB.prepare("UPDATE view_sessions SET played_seconds=242, last_position_seconds=197, last_heartbeat_seq=3326, started_at=?, updated_at=? WHERE id=?")
        .bind(old, old, session.id),
    ]);
    let batchRowsRead = 0;
    const database = new Proxy(env.DB, {
      get(target, key) {
        if (key === "batch") return async (statements: D1PreparedStatement[]) => {
          const results = await target.batch(statements);
          batchRowsRead += results.reduce((sum, r) => sum + (r.meta.rows_read || 0), 0);
          return results;
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await send(cookie, session, 3327, 30, 227, "active", { ...appEnv, DB: database });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ aggregate: { played_seconds: 272, last_position_seconds: 227, last_heartbeat_seq: 3327 } });
    // The real Worker batch must read a bounded number of indexed rows, not
    // the 3,326 historical rows. This measures D1 meta, not SQL string shape.
    expect(batchRowsRead).toBeLessThan(80);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM view_heartbeats WHERE view_session_id=?").bind(session.id).first<{ n: number }>())?.n).toBe(3327);
  });

  it.each(["video", "listen"] as const)("counts concurrent duplicate %s heartbeats once in sessions and every daily rollup", async (mode) => {
    await env.DB.prepare("UPDATE categories SET daily_limit_seconds=90 WHERE id='english'").run();
    const { cookie, session } = await start(mode, "elmo-alphabet");
    // Hold both requests at the final D1 transaction, after both have observed
    // an absent sequence and calculated the same rollup delta.
    const waiting: Array<() => void> = [];
    const database = new Proxy(env.DB, {
      get(target, key) {
        if (key === "batch") return async (statements: D1PreparedStatement[]) => {
          await new Promise<void>((resolve) => {
            waiting.push(resolve);
            if (waiting.length === 2) waiting.forEach((release) => release());
          });
          return target.batch(statements);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const runtime = { ...appEnv, DB: database };
    const responses = await Promise.all([send(cookie, session, 1, 30, 30, "active", runtime), send(cookie, session, 1, 30, 30, "active", runtime)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const replay = await send(cookie, session, 1, 30, 30);
    expect(await replay.json()).toMatchObject({ duplicate: true, aggregate: { played_seconds: 30 } });
    const access = await (await call("/api/child/access-state", { headers: { cookie } })).json<any>();
    expect(access.todayPlayedSeconds).toBe(30);
    expect(access.leisureUsedSeconds).toBe(mode === "video" ? 30 : 0);
    expect(access.listenSeconds).toBe(mode === "listen" ? 30 : 0);
    const category = access.categoryStates.find((item: any) => item.categoryId === "english");
    // Category display includes listening; only viewing consumes its cap.
    expect(category.todayPlayedSeconds).toBe(30);
    expect(category.remainingSeconds).toBe(mode === "video" ? 60 : 90);
    const rollup = await env.DB.prepare("SELECT video_seconds, listen_seconds FROM child_category_daily_usage WHERE child_id='child_ayun' AND category_id='english'").first();
    expect(rollup).toEqual({ video_seconds: mode === "video" ? 30 : 0, listen_seconds: mode === "listen" ? 30 : 0 });
    const account = await env.DB.prepare("SELECT total_seconds, leisure_seconds, listen_seconds FROM daily_usage_totals").first();
    expect(account).toEqual({ total_seconds: 30, leisure_seconds: mode === "video" ? 30 : 0, listen_seconds: mode === "listen" ? 30 : 0 });
    const accountCategory = await env.DB.prepare("SELECT video_seconds, listen_seconds FROM daily_category_usage_totals WHERE category_id='english'").first();
    expect(accountCategory).toEqual(rollup);
  });

  it("accepts late unique playback without moving a newer resume position backwards", async () => {
    const { cookie, session } = await start();
    expect((await send(cookie, session, 3, 30, 90)).status).toBe(200);
    expect((await send(cookie, session, 4, 0, 197)).status).toBe(200);
    expect((await send(cookie, session, 2, 20, 60)).status).toBe(200);
    const response = await send(cookie, session, 2, 20, 60);
    expect(await response.json()).toMatchObject({ duplicate: true, aggregate: {
      played_seconds: 50, last_position_seconds: 197, last_heartbeat_seq: 4,
    } });
  });

  it("keeps learning/listening totals split across Taipei midnight without consuming leisure quota", async () => {
    const { cookie, session } = await start("listen");
    const midnight = Date.parse(getDayRangeInTimeZone("Asia/Taipei").start);
    const body = JSON.stringify({ writeToken: session.writeToken, heartbeatSeq: 1, deltaSeconds: 20,
      positionSeconds: 20, intervalStartedAt: new Date(midnight - 10_000).toISOString(),
      intervalEndedAt: new Date(midnight + 10_000).toISOString() });
    const path = `/api/view-sessions/${session.id}`;
    expect((await call(path, { method: "PATCH", headers: { cookie }, body })).status).toBe(200);
    expect(await (await call(path, { method: "PATCH", headers: { cookie }, body })).json()).toMatchObject({ duplicate: true });
    const totals = await env.DB.prepare(`SELECT total_played_seconds, learning_seconds, listen_seconds, leisure_seconds
      FROM child_daily_usage WHERE child_id='child_ayun' ORDER BY usage_date`).all();
    expect(totals.results).toEqual([
      { total_played_seconds: 10, learning_seconds: 10, listen_seconds: 10, leisure_seconds: 0 },
      { total_played_seconds: 10, learning_seconds: 10, listen_seconds: 10, leisure_seconds: 0 },
    ]);
  });
});
