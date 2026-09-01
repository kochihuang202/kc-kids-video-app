import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { formatPosition, getDayRangeInTimeZone } from "../src/lib/utils";
import { consumeRateLimit, makePasswordRecord, parsePasswordSecret, tokenHash, verifyPassword } from "../worker/security";
import type { AppEnv } from "../worker/types";
import { parseIsoDuration, parseYouTubeVideoId } from "../worker/youtube";
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

function jsonBody(value: unknown) { return JSON.stringify(value); }
function cookieValue(response: Response) { return response.headers.get("set-cookie")!.split(";")[0]; }

async function addParent(password = "correct horse battery") {
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

async function pairDevice(name = "測試 iPad") {
  const token = "test-device-token-that-is-long-enough";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, await tokenHash(token, appEnv), name, now, now).run();
  return { id, cookie: `kid_device=${token}` };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM view_heartbeats"),
    env.DB.prepare("DELETE FROM notes"),
    env.DB.prepare("DELETE FROM view_sessions"),
    env.DB.prepare("DELETE FROM admin_sessions"),
    env.DB.prepare("DELETE FROM admin_credentials"),
    env.DB.prepare("DELETE FROM child_devices"),
    env.DB.prepare("DELETE FROM rate_limit_buckets"),
    env.DB.prepare("DELETE FROM videos WHERE source = 'self_hosted'"),
    env.DB.prepare("DELETE FROM categories WHERE id NOT IN ('science', 'english', 'animals')"),
    env.DB.prepare("UPDATE videos SET is_active = 1, archived_at = NULL, availability_status = 'available', metadata_error = NULL"),
    env.DB.prepare("UPDATE categories SET is_active = 1, archived_at = NULL"),
  ]);
});

describe("Phase 1B units", () => {
  it("serves a private R2 thumbnail through the Worker with cache headers", async () => {
    const bucket = appEnv.MEDIA_ASSETS;
    expect(bucket).toBeDefined();
    await bucket!.put("thumbnails/test.webp", new Uint8Array([82, 73, 70, 70]), {
      httpMetadata: { contentType: "image/webp" },
    });

    const response = await call("/api/media/thumbnails/test.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("max-age=31536000");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([82, 73, 70, 70]);
  });

  it("accepts supported YouTube URLs and rejects non-video pages", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=bcVr13Fw7w8&list=PL123")).toBe("bcVr13Fw7w8");
    expect(parseYouTubeVideoId("https://youtu.be/bcVr13Fw7w8?t=3")).toBe("bcVr13Fw7w8");
    expect(parseYouTubeVideoId("https://youtube.com/shorts/bcVr13Fw7w8")).toBe("bcVr13Fw7w8");
    expect(() => parseYouTubeVideoId("https://youtube.com/playlist?list=PL123")).toThrow(/單支影片/);
    expect(() => parseYouTubeVideoId("https://youtube.com/@example")).toThrow(/單支影片/);
  });

  it("parses ISO durations and Taiwan day boundaries", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("P1DT1M")).toBe(86460);
    expect(formatPosition(512)).toBe("08:32");
    const range = getDayRangeInTimeZone("Asia/Taipei", new Date("2026-08-29T12:00:00+08:00"));
    expect(range).toEqual({ start: "2026-08-28T16:00:00.000Z", end: "2026-08-29T16:00:00.000Z" });
  });

  it("hashes passwords with PBKDF2 and compares safely", async () => {
    const record = await makePasswordRecord("a secure family password", 100_000);
    expect(await verifyPassword("a secure family password", record.hash, record.salt, record.iterations)).toBe(true);
    expect(await verifyPassword("wrong family password", record.hash, record.salt, record.iterations)).toBe(false);
  });

  it("keeps PBKDF2 credentials within the Cloudflare production limit", async () => {
    const record = await makePasswordRecord("a secure family password");
    expect(record.iterations).toBe(100_000);
    expect(parsePasswordSecret(`pbkdf2_sha256$310000$salt$hash`)).toBeNull();
  });

  it("enforces a persisted rate-limit window", async () => {
    await consumeRateLimit(appEnv, "test:bucket", 2, 60);
    await consumeRateLimit(appEnv, "test:bucket", 2, 60);
    await expect(consumeRateLimit(appEnv, "test:bucket", 2, 60)).rejects.toMatchObject({ status: 429 });
  });
});

describe("migration and public whitelist", () => {
  it("shows an active empty category on the child home", async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO categories (id, name, icon, tone, sort_order, is_active, created_at, updated_at)
      VALUES ('empty-category', '空分類', '✨', 'sky', 4, 1, ?, ?)
    `).bind(now, now).run();
    const response = await call("/api/content/categories");
    const payload = await response.json() as Array<{ id: string }>;
    expect(payload.map((item) => item.id)).toContain("empty-category");
  });

  it("seeds three sorted categories and six videos from D1", async () => {
    const categories = await call("/api/content/categories");
    const payload = await categories.json() as Array<{ id: string }>;
    expect(payload.map((item) => item.id)).toEqual(["science", "english", "animals"]);
    const science = await call("/api/content/categories/science/videos");
    expect((await science.json() as Array<{ id: string }>).map((item) => item.id)).toEqual(["why-sky-blue", "big-story-dinosaurs"]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM videos").first<{ count: number }>();
    expect(count?.count).toBe(6);
  });

  it("filters hidden and archived records in SQL", async () => {
    await env.DB.prepare("UPDATE videos SET is_active = 0 WHERE id = 'why-sky-blue'").run();
    const response = await call("/api/content/categories/science/videos");
    expect((await response.json() as Array<{ id: string }>).map((item) => item.id)).toEqual(["big-story-dinosaurs"]);
    expect((await call("/api/content/videos/why-sky-blue")).status).toBe(404);
  });

  it("returns a playable Tailscale URL for a self-hosted video", async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO categories (id, name, icon, tone, sort_order, is_active, created_at, updated_at)
        VALUES ('local-course', '家庭課程', '📚', 'sage', 4, 1, ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO videos (
          id, source, youtube_title, parent_label, thumbnail_url, availability_status,
          health_status, media_type, media_path, thumbnail_path, is_active, created_at, updated_at
        ) VALUES (
          'local-lesson-01', 'self_hosted', '第一課', '第一課', '', 'available',
          'healthy', 'video', '/media/課程/第一課.mp4', '/thumbnails/課程/第一課.jpg', 1, ?, ?
        )
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
        VALUES ('local-course', 'local-lesson-01', 1, ?)
      `).bind(now),
    ]);

    const response = await call("/api/content/categories/local-course/videos");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({
        id: "local-lesson-01",
        source: "self_hosted",
        youtubeVideoId: null,
        mediaType: "video",
        mediaPath: "/media/課程/第一課.mp4",
        mediaUrl: "https://media.test/media/%E8%AA%B2%E7%A8%8B/%E7%AC%AC%E4%B8%80%E8%AA%B2.mp4",
        thumbnailUrl: "https://media.test/thumbnails/%E8%AA%B2%E7%A8%8B/%E7%AC%AC%E4%B8%80%E8%AA%B2.jpg",
      }),
    ]);
  });
});

describe("device capability and heartbeat", () => {
  it("allows public reading but rejects unpaired writes", async () => {
    expect((await call("/api/content/videos/why-sky-blue")).status).toBe(200);
    const start = await call("/api/view-sessions", { method: "POST", body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }) });
    expect(start.status).toBe(403);
    expect(await start.json()).toMatchObject({ code: "DEVICE_AUTH_REQUIRED" });
  });

  it("counts repeated heartbeat sequences once and checks capability tokens", async () => {
    const device = await pairDevice();
    const started = await call("/api/view-sessions", { method: "POST", headers: { cookie: device.cookie }, body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }) });
    expect(started.status).toBe(201);
    const session = await started.json() as { id: string; writeToken: string };
    const heartbeat = (seq: number, delta: number, token = session.writeToken) => call(`/api/view-sessions/${session.id}`, {
      method: "PATCH", headers: { cookie: device.cookie }, body: jsonBody({
        writeToken: token, heartbeatSeq: seq, deltaSeconds: delta, positionSeconds: 42,
        intervalStartedAt: "2026-08-29T01:00:00.000Z", intervalEndedAt: "2026-08-29T01:00:10.000Z",
      }),
    });
    expect((await heartbeat(1, 30)).status).toBe(200);
    expect((await heartbeat(1, 30)).status).toBe(200);
    expect((await heartbeat(2, 20)).status).toBe(200);
    expect((await heartbeat(3, 10, "wrong-capability-token-that-is-long")).status).toBe(403);
    const row = await env.DB.prepare("SELECT played_seconds, last_heartbeat_seq FROM view_sessions WHERE id = ?").bind(session.id).first<{ played_seconds: number; last_heartbeat_seq: number }>();
    expect(row).toEqual({ played_seconds: 50, last_heartbeat_seq: 2 });
  });

  it("records Play 120, Pause, then Play 180 as 300 seconds", async () => {
    const device = await pairDevice();
    const started = await call("/api/view-sessions", { method: "POST", headers: { cookie: device.cookie }, body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }) });
    const session = await started.json() as { id: string; writeToken: string };
    let seq = 0;
    const send = (deltaSeconds: number) => call(`/api/view-sessions/${session.id}`, {
      method: "PATCH", headers: { cookie: device.cookie }, body: jsonBody({
        writeToken: session.writeToken, heartbeatSeq: ++seq, deltaSeconds, positionSeconds: seq * 10,
        intervalStartedAt: "2026-08-29T01:00:00.000Z", intervalEndedAt: "2026-08-29T01:00:10.000Z",
      }),
    });
    for (let index = 0; index < 12; index += 1) expect((await send(10)).status).toBe(200);
    expect((await send(0)).status).toBe(200);
    await env.DB.prepare("UPDATE rate_limit_buckets SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    for (let index = 0; index < 18; index += 1) expect((await send(10)).status).toBe(200);
    const row = await env.DB.prepare("SELECT played_seconds FROM view_sessions WHERE id = ?").bind(session.id).first<{ played_seconds: number }>();
    expect(row?.played_seconds).toBe(300);
  });

  it("keeps child note writes disabled while preserving the matching session", async () => {
    const device = await pairDevice();
    const started = await call("/api/view-sessions", { method: "POST", headers: { cookie: device.cookie }, body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }) });
    const session = await started.json() as { id: string; writeToken: string };
    const note = await call("/api/notes", { method: "POST", headers: { cookie: device.cookie }, body: jsonBody({
      videoId: "why-sky-blue", viewSessionId: session.id, writeToken: session.writeToken,
      content: "<b>我發現天空的顏色和光有關。</b>", videoPositionSeconds: 42,
    }) });
    expect(note.status).toBe(410);
    expect(await note.json()).toMatchObject({ code: "NOTES_DISABLED" });
    const row = await env.DB.prepare("SELECT content FROM notes").first<{ content: string }>();
    expect(row).toBeNull();
  });
});

describe("parent auth and administration", () => {
  it("creates a category with the selected tone and numeric sort order", async () => {
    const parentCookie = await addParent();
    const response = await call("/api/parent/categories", {
      method: "POST",
      headers: { cookie: parentCookie },
      body: jsonBody({ name: "可愛巧虎島", icon: "✨" }),
    });
    expect(response.status).toBe(201);
    const row = await env.DB.prepare("SELECT tone, sort_order FROM categories WHERE name = ?")
      .bind("可愛巧虎島").first<{ tone: string; sort_order: number }>();
    expect(row).toEqual({ tone: "sky", sort_order: 4 });
  });

  it("accepts an eight-character family password and rejects shorter input", async () => {
    await addParent("eight888");
    const accepted = await call("/api/parent/session", { method: "POST", body: jsonBody({ password: "eight888" }) });
    expect(accepted.status).toBe(200);
    const rejected = await call("/api/parent/session", { method: "POST", body: jsonBody({ password: "short77" }) });
    expect(rejected.status).toBe(400);
  });

  it("returns 401 without a session and creates a secure 12-hour cookie on login", async () => {
    expect((await call("/api/parent/categories")).status).toBe(401);
    await addParent();
    const response = await call("/api/parent/session", { method: "POST", body: jsonBody({ password: "correct horse battery" }) });
    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=43200");
  });

  it("requires same-origin JSON for parent mutations", async () => {
    const parentCookie = await addParent();
    const response = await worker.fetch(new Request(`${origin}/api/parent/categories`, {
      method: "POST", headers: { cookie: parentCookie, "content-type": "application/json", origin: "https://evil.example" },
      body: jsonBody({ name: "音樂", icon: "🎵" }),
    }), appEnv, createExecutionContext());
    expect(response.status).toBe(403);
  });

  it("requires a complete unique sorting scope", async () => {
    const parentCookie = await addParent();
    const response = await call("/api/parent/categories/order", { method: "PUT", headers: { cookie: parentCookie }, body: jsonBody({ ids: ["science", "english"] }) });
    expect(response.status).toBe(409);
    const success = await call("/api/parent/categories/order", { method: "PUT", headers: { cookie: parentCookie }, body: jsonBody({ ids: ["animals", "english", "science"] }) });
    expect(success.status).toBe(200);
  });

  it("authorizes and revokes the current child device", async () => {
    const parentCookie = await addParent();
    const authorized = await call("/api/parent/devices", { method: "POST", headers: { cookie: parentCookie }, body: jsonBody({ name: "客廳 iPad" }) });
    expect(authorized.status).toBe(201);
    const childCookie = cookieValue(authorized);
    const device = await authorized.json() as { id: string };
    expect(await (await call("/api/device/status", { headers: { cookie: childCookie } })).json()).toMatchObject({ authorized: true });
    expect((await call(`/api/parent/devices/${device.id}`, { method: "DELETE", headers: { cookie: `${parentCookie}; ${childCookie}` }, body: jsonBody({}) })).status).toBe(200);
    expect((await call("/api/view-sessions", { method: "POST", headers: { cookie: childCookie }, body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }) })).status).toBe(403);
  });

  it("logs out by revoking the server session", async () => {
    const parentCookie = await addParent();
    expect((await call("/api/parent/categories", { headers: { cookie: parentCookie } })).status).toBe(200);
    const logout = await call("/api/parent/session", { method: "DELETE", headers: { cookie: parentCookie }, body: jsonBody({}) });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await call("/api/parent/categories", { headers: { cookie: parentCookie } })).status).toBe(401);
  });

  it("changes the password and revokes other parent sessions", async () => {
    const firstCookie = await addParent();
    const secondLogin = await call("/api/parent/session", { method: "POST", body: jsonBody({ password: "correct horse battery" }) });
    const secondCookie = cookieValue(secondLogin);
    const changed = await call("/api/parent/password", { method: "POST", headers: { cookie: firstCookie }, body: jsonBody({ currentPassword: "correct horse battery", newPassword: "a brand new family password" }) });
    expect(changed.status).toBe(200);
    expect((await call("/api/parent/categories", { headers: { cookie: firstCookie } })).status).toBe(200);
    expect((await call("/api/parent/categories", { headers: { cookie: secondCookie } })).status).toBe(401);
  });

  it("previews a duplicate video without creating a second row", async () => {
    const parentCookie = await addParent();
    const preview = await call("/api/parent/videos/preview", { method: "POST", headers: { cookie: parentCookie }, body: jsonBody({ url: "https://youtu.be/bcVr13Fw7w8" }) });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ duplicate: { id: "why-sky-blue" }, youtubeVideoId: "bcVr13Fw7w8" });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE youtube_video_id = 'bcVr13Fw7w8'").first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});

describe("dashboard history and day splitting", () => {
  it("splits a heartbeat crossing Taipei midnight and keeps archived video labels", async () => {
    const parentCookie = await addParent();
    await env.DB.prepare(`
      INSERT INTO view_sessions (id, video_id, played_seconds, last_position_seconds, started_at, updated_at, ended_at, status)
      VALUES ('cross-midnight', 'why-sky-blue', 20, 10, '2026-08-29T15:59:50.000Z', '2026-08-29T16:00:10.000Z', '2026-08-29T16:00:10.000Z', 'ended')
    `).run();
    await env.DB.prepare(`
      INSERT INTO view_heartbeats (id, view_session_id, heartbeat_seq, delta_seconds, position_seconds, interval_started_at, interval_ended_at, received_at)
      VALUES ('heartbeat-midnight', 'cross-midnight', 1, 20, 10, '2026-08-29T15:59:50.000Z', '2026-08-29T16:00:10.000Z', '2026-08-29T16:00:10.000Z')
    `).run();
    await env.DB.prepare("UPDATE videos SET archived_at = '2026-08-29T16:00:20.000Z', is_active = 0 WHERE id = 'why-sky-blue'").run();
    const response = await call("/api/parent/dashboard/today?start=2026-08-29T16%3A00%3A00.000Z&end=2026-08-30T16%3A00%3A00.000Z", { headers: { cookie: parentCookie } });
    const dashboard = await response.json() as TodayDashboard;
    expect(dashboard.summary.totalPlayedSeconds).toBe(10);
    expect(dashboard.timeline).toHaveLength(1);
    expect(dashboard.timeline[0]).toMatchObject({ videoLabel: "天空為什麼是藍色？", playedSeconds: 10 });
  });
});

describe("production recording switch", () => {
  async function callWithRecordingDisabled(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const context = createExecutionContext();
    const response = await worker.fetch(
      new Request(`${origin}${path}`, { ...init, headers }),
      { ...appEnv, RECORDING_ENABLED: "false" },
      context,
    );
    await waitOnExecutionContext(context);
    return response;
  }

  it("returns no resume data and refuses new session or note writes", async () => {
    const resume = await callWithRecordingDisabled("/api/content/resume");
    expect(resume.status).toBe(200);
    expect(await resume.json()).toEqual({ resume: null });

    const session = await callWithRecordingDisabled("/api/view-sessions", {
      method: "POST",
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }),
    });
    expect(session.status).toBe(410);
    expect(await session.json()).toMatchObject({ code: "RECORDING_DISABLED" });

    const note = await callWithRecordingDisabled("/api/notes", {
      method: "POST",
      body: jsonBody({ content: "不應保存" }),
    });
    expect(note.status).toBe(410);
    expect(await note.json()).toMatchObject({ code: "NOTES_DISABLED" });
  });
});
