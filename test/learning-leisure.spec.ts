import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
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

const jsonBody = (value: unknown) => JSON.stringify(value);
const cookieValue = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];

async function pairDevice(name: string) {
  const token = `test-device-token-${name}-long-enough`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, await tokenHash(token, appEnv), name, now, now).run();
  return { id, cookie: `kid_device=${token}` };
}

async function addParent() {
  const password = "correct horse battery";
  const record = await makePasswordRecord(password, 100_000);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO admin_credentials (id, password_hash, salt, iterations, created_at, updated_at)
    VALUES ('family', ?, ?, ?, ?, ?)
  `).bind(record.hash, record.salt, record.iterations, now, now).run();
  const response = await call("/api/parent/session", { method: "POST", body: jsonBody({ password }) });
  expect(response.status).toBe(200);
  return cookieValue(response);
}

async function addScienceVideos(count: number) {
  const now = new Date().toISOString();
  for (let index = 0; index < count; index += 1) {
    const number = index + 3;
    const id = `science-extra-${number}`;
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO videos (
          id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
          thumbnail_url, duration_seconds, availability_status, health_status,
          is_active, created_at, updated_at
        ) VALUES (?, 'youtube', ?, ?, ?, ?, ?, 600, 'available', 'healthy', 1, ?, ?)
      `).bind(id, `scienceyt${number}`, `https://youtube.test/watch?v=scienceyt${number}`, `科學 ${number}`, `科學 ${number}`, `https://img.test/${id}.jpg`, now, now),
      env.DB.prepare(`
        INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
        VALUES ('science', ?, ?, ?)
      `).bind(id, number, now),
    ]);
  }
}

async function sendHeartbeat(
  cookie: string,
  session: { id: string; writeToken: string },
  seq: number,
  deltaSeconds: number,
  start: Date,
  end: Date,
) {
  return call(`/api/view-sessions/${session.id}`, {
    method: "PATCH",
    headers: { cookie },
    body: jsonBody({
      writeToken: session.writeToken,
      heartbeatSeq: seq,
      deltaSeconds,
      positionSeconds: seq * deltaSeconds,
      intervalStartedAt: start.toISOString(),
      intervalEndedAt: end.toISOString(),
    }),
  });
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM view_heartbeats"),
    env.DB.prepare("DELETE FROM notes"),
    env.DB.prepare("DELETE FROM view_sessions"),
    env.DB.prepare("DELETE FROM video_learned_state"),
    env.DB.prepare("DELETE FROM admin_sessions"),
    env.DB.prepare("DELETE FROM admin_credentials"),
    env.DB.prepare("DELETE FROM child_devices"),
    env.DB.prepare("DELETE FROM rate_limit_buckets"),
    env.DB.prepare("DELETE FROM daily_overrides"),
    env.DB.prepare("DELETE FROM daily_usage_totals"),
    env.DB.prepare("DELETE FROM allowed_windows"),
    env.DB.prepare("DELETE FROM videos WHERE id LIKE 'science-extra-%' OR id = 'listen-local'"),
    env.DB.prepare("DELETE FROM categories WHERE id = 'leisure-test'"),
    env.DB.prepare("UPDATE categories SET series_type = CASE WHEN id = 'science' THEN 'learning' ELSE 'leisure' END, daily_limit_seconds = NULL, is_active = 1, archived_at = NULL"),
    env.DB.prepare("UPDATE videos SET is_active = 1, archived_at = NULL, availability_status = 'available'"),
    env.DB.prepare("UPDATE usage_rules SET daily_limit_seconds = 2400, is_active = 1"),
  ]);
});

describe("learning and leisure rules", () => {
  it("opens only the first five unlearned videos and restores original order when unlearned", async () => {
    const device = await pairDevice("first-five");
    await addScienceVideos(4);

    const list = await (await call("/api/content/categories/science/videos", { headers: { cookie: device.cookie } })).json<any[]>();
    expect(list.map((video) => video.id)).toEqual([
      "why-sky-blue", "big-story-dinosaurs", "science-extra-3", "science-extra-4", "science-extra-5", "science-extra-6",
    ]);
    expect(list.map((video) => video.isSelectable)).toEqual([true, true, true, true, true, false]);
    const locked = await call("/api/content/videos/science-extra-6", { headers: { cookie: device.cookie } });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: "LEARNING_VIDEO_LOCKED" });

    const learned = await call("/api/child/videos/why-sky-blue/learned", {
      method: "PUT", headers: { cookie: device.cookie }, body: jsonBody({ learned: true }),
    });
    expect(learned.status).toBe(200);
    const afterLearned = await (await call("/api/content/categories/science/videos", { headers: { cookie: device.cookie } })).json<any[]>();
    expect(afterLearned.at(-1)).toMatchObject({ id: "why-sky-blue", isLearned: true });
    expect(afterLearned.find((video) => video.id === "science-extra-6")?.isSelectable).toBe(true);
    expect((await call("/api/content/videos/science-extra-6", { headers: { cookie: device.cookie } })).status).toBe(200);

    const unlearned = await call("/api/child/videos/why-sky-blue/learned", {
      method: "PUT", headers: { cookie: device.cookie }, body: jsonBody({ learned: false }),
    });
    expect(unlearned.status).toBe(200);
    const restored = await (await call("/api/content/categories/science/videos", { headers: { cookie: device.cookie } })).json<any[]>();
    expect(restored.map((video) => video.id)).toEqual(list.map((video) => video.id));
    expect(restored.at(-1)?.isSelectable).toBe(false);
  });

  it("rejects assigning one video to both learning and leisure categories", async () => {
    const parentCookie = await addParent();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO categories (id, name, icon, tone, sort_order, is_active, series_type, created_at, updated_at)
      VALUES ('leisure-test', '休閒測試', '🎈', 'apricot', 99, 1, 'leisure', ?, ?)
    `).bind(now, now).run();

    const response = await call("/api/parent/videos/why-sky-blue", {
      method: "PATCH",
      headers: { cookie: parentCookie },
      body: jsonBody({ categoryIds: ["science", "leisure-test"] }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SERIES_TYPE_CONFLICT" });
  });

  it("turns 120 seconds of learning into 60 seconds of shared leisure allowance", async () => {
    const device = await pairDevice("learning-reward");
    const started = await call("/api/view-sessions", {
      method: "POST", headers: { cookie: device.cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID(), playbackMode: "video" }),
    });
    expect(started.status).toBe(201);
    const session = await started.json<{ id: string; writeToken: string }>();
    const end = new Date();
    const middle = new Date(end.getTime() - 60_000);
    const start = new Date(end.getTime() - 120_000);
    await env.DB.prepare("UPDATE view_sessions SET started_at = ? WHERE id = ?").bind(start.toISOString(), session.id).run();
    expect((await sendHeartbeat(device.cookie, session, 1, 60, start, middle)).status).toBe(200);
    expect((await sendHeartbeat(device.cookie, session, 2, 60, middle, end)).status).toBe(200);

    const access = await (await call("/api/child/access-state")).json<any>();
    expect(access.learningSeconds).toBe(120);
    expect(access.earnedBonusSeconds).toBe(60);
    expect(access.leisureUsedSeconds).toBe(0);
    expect(access.remainingSeconds).toBe(access.baseLimitSeconds + 60);
  });

  it("records pure listening without spending leisure or earning a learning reward", async () => {
    const device = await pairDevice("listen-mode");
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO videos (
          id, source, youtube_title, parent_label, thumbnail_url, availability_status,
          health_status, media_type, media_path, is_active, created_at, updated_at
        ) VALUES ('listen-local', 'self_hosted', '純聽測試', '純聽測試', '', 'available',
          'healthy', 'audio', '/media/listen.mp3', 1, ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
        VALUES ('english', 'listen-local', 99, ?)
      `).bind(now),
    ]);
    const started = await call("/api/view-sessions", {
      method: "POST", headers: { cookie: device.cookie },
      body: jsonBody({ videoId: "listen-local", clientSessionId: crypto.randomUUID(), playbackMode: "listen" }),
    });
    expect(started.status).toBe(201);
    const session = await started.json<{ id: string; writeToken: string }>();
    const end = new Date();
    const start = new Date(end.getTime() - 60_000);
    await env.DB.prepare("UPDATE view_sessions SET started_at = ? WHERE id = ?").bind(start.toISOString(), session.id).run();
    expect((await sendHeartbeat(device.cookie, session, 1, 60, start, end)).status).toBe(200);

    const access = await (await call("/api/child/access-state")).json<any>();
    expect(access.listenSeconds).toBe(60);
    expect(access.learningSeconds).toBe(0);
    expect(access.leisureUsedSeconds).toBe(0);
    expect(access.earnedBonusSeconds).toBe(0);
    expect(access.remainingSeconds).toBe(access.baseLimitSeconds);
  });

  it("deduplicates overlapping devices with leisure taking precedence", async () => {
    const learningDevice = await pairDevice("overlap-learning");
    const leisureDevice = await pairDevice("overlap-leisure");
    const end = new Date();
    const start = new Date(end.getTime() - 60_000);
    const learningSession = crypto.randomUUID();
    const leisureSession = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO view_sessions (
          id, client_session_id, video_id, child_device_id, played_seconds, last_position_seconds,
          started_at, updated_at, status, playback_mode, series_type_snapshot
        ) VALUES (?, ?, 'why-sky-blue', ?, 60, 60, ?, ?, 'active', 'video', 'learning')
      `).bind(learningSession, crypto.randomUUID(), learningDevice.id, start.toISOString(), end.toISOString()),
      env.DB.prepare(`
        INSERT INTO view_sessions (
          id, client_session_id, video_id, child_device_id, played_seconds, last_position_seconds,
          started_at, updated_at, status, playback_mode, series_type_snapshot
        ) VALUES (?, ?, 'elmo-alphabet', ?, 60, 60, ?, ?, 'active', 'video', 'leisure')
      `).bind(leisureSession, crypto.randomUUID(), leisureDevice.id, start.toISOString(), end.toISOString()),
      env.DB.prepare(`
        INSERT INTO view_heartbeats (
          id, view_session_id, heartbeat_seq, delta_seconds, position_seconds,
          interval_started_at, interval_ended_at, received_at
        ) VALUES (?, ?, 1, 60, 60, ?, ?, ?)
      `).bind(crypto.randomUUID(), learningSession, start.toISOString(), end.toISOString(), end.toISOString()),
      env.DB.prepare(`
        INSERT INTO view_heartbeats (
          id, view_session_id, heartbeat_seq, delta_seconds, position_seconds,
          interval_started_at, interval_ended_at, received_at
        ) VALUES (?, ?, 1, 60, 60, ?, ?, ?)
      `).bind(crypto.randomUUID(), leisureSession, start.toISOString(), end.toISOString(), end.toISOString()),
    ]);

    const access = await (await call("/api/child/access-state")).json<any>();
    expect(access.todayPlayedSeconds).toBe(60);
    expect(access.leisureUsedSeconds).toBe(60);
    expect(access.learningSeconds).toBe(0);
    expect(access.earnedBonusSeconds).toBe(0);
  });

  it("updates the daily rollup idempotently when a leisure heartbeat overlaps learning", async () => {
    const learningDevice = await pairDevice("rollup-learning");
    const leisureDevice = await pairDevice("rollup-leisure");
    const learningStarted = await call("/api/view-sessions", {
      method: "POST", headers: { cookie: learningDevice.cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID(), playbackMode: "video" }),
    });
    const leisureStarted = await call("/api/view-sessions", {
      method: "POST", headers: { cookie: leisureDevice.cookie },
      body: jsonBody({ videoId: "elmo-alphabet", clientSessionId: crypto.randomUUID(), playbackMode: "video" }),
    });
    expect(learningStarted.status).toBe(201);
    expect(leisureStarted.status).toBe(201);
    const learningSession = await learningStarted.json<{ id: string; writeToken: string }>();
    const leisureSession = await leisureStarted.json<{ id: string; writeToken: string }>();
    const end = new Date();
    const start = new Date(end.getTime() - 60_000);

    expect((await sendHeartbeat(learningDevice.cookie, learningSession, 1, 60, start, end)).status).toBe(200);
    let access = await (await call("/api/child/access-state")).json<any>();
    expect(access).toMatchObject({ learningSeconds: 60, leisureUsedSeconds: 0, todayPlayedSeconds: 60 });

    expect((await sendHeartbeat(leisureDevice.cookie, leisureSession, 1, 60, start, end)).status).toBe(200);
    access = await (await call("/api/child/access-state")).json<any>();
    expect(access).toMatchObject({ learningSeconds: 0, leisureUsedSeconds: 60, todayPlayedSeconds: 60 });

    const duplicate = await sendHeartbeat(leisureDevice.cookie, leisureSession, 1, 60, start, end);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });
    access = await (await call("/api/child/access-state")).json<any>();
    expect(access).toMatchObject({ learningSeconds: 0, leisureUsedSeconds: 60, todayPlayedSeconds: 60 });
  });

  it("shares resume position across authorized devices for the single child", async () => {
    const first = await pairDevice("resume-source");
    const second = await pairDevice("resume-target");
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO view_sessions (
        id, client_session_id, video_id, child_device_id, played_seconds, last_position_seconds,
        started_at, updated_at, status, playback_mode, series_type_snapshot
      ) VALUES (?, ?, 'why-sky-blue', ?, 100, 123, ?, ?, 'active', 'video', 'learning')
    `).bind(crypto.randomUUID(), crypto.randomUUID(), first.id, now, now).run();

    const response = await call("/api/content/videos/why-sky-blue", { headers: { cookie: second.cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lastPositionSeconds: 123 });
  });
});
