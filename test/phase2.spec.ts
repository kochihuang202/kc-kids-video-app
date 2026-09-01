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
  const token = "test-device-token-phase2";
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
    env.DB.prepare("UPDATE videos SET is_active = 1, archived_at = NULL, availability_status = 'available', health_status = 'healthy', duration_seconds = 1200, metadata_error = NULL"),
    env.DB.prepare("UPDATE categories SET is_active = 1, archived_at = NULL"),
  ]);
});

describe("Phase 2 End-to-End Suite", () => {
  // Test E2E 01: Resume
  it("E2E 01: Shows resume card when playback position > 0 and not finished", async () => {
    const { cookie } = await pairDevice();
    const startRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: "session-resume-1" }),
    });
    const { id: sessionId, writeToken } = await startRes.json<{ id: string; writeToken: string }>();

    // Play to position 512s of 1200s video (42% completion < 90%)
    const patchRes = await call(`/api/view-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { cookie },
      body: jsonBody({
        writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 10,
        positionSeconds: 512,
      }),
    });
    expect(patchRes.status).toBe(200);

    const resumeRes = await call("/api/content/resume", { headers: { cookie } });
    expect(resumeRes.status).toBe(200);
    const data = await resumeRes.json<{ resume: any }>();
    expect(data.resume).not.toBeNull();
    expect(data.resume.videoId).toBe("why-sky-blue");
    expect(data.resume.lastPositionSeconds).toBe(512);
  });

  // Test E2E 02: Watched & Completion
  it("E2E 02: Marks video as watched when position >= 90% and removes from resume", async () => {
    const { cookie } = await pairDevice();
    const startRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: "session-complete-1" }),
    });
    const { id: sessionId, writeToken } = await startRes.json<{ id: string; writeToken: string }>();

    // Play to 1100s of 1200s video (91.6% >= 90%)
    await call(`/api/view-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { cookie },
      body: jsonBody({
        writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 10,
        positionSeconds: 1100,
      }),
    });

    // Resume should be null because video is finished
    const resumeRes = await call("/api/content/resume", { headers: { cookie } });
    const resumeData = await resumeRes.json<{ resume: any }>();
    expect(resumeData.resume).toBeNull();

    // Category listing should show isWatched = true
    const catRes = await call("/api/content/categories/science/videos", { headers: { cookie } });
    const videos = await catRes.json<any[]>();
    const whySky = videos.find((v) => v.id === "why-sky-blue");
    expect(whySky.isWatched).toBe(true);
  });

  // Test E2E 03: Replay watched video creates new session
  it("E2E 03: Replaying a completed video creates a new ViewSession and preserves history", async () => {
    const { cookie } = await pairDevice();

    // First session: completed
    const s1 = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: "client-sess-1" }),
    });
    const { id: id1, writeToken: wt1 } = await s1.json<{ id: string; writeToken: string }>();
    await call(`/api/view-sessions/${id1}`, {
      method: "PATCH",
      headers: { cookie },
      body: jsonBody({ writeToken: wt1, heartbeatSeq: 1, deltaSeconds: 10, positionSeconds: 1200, status: "ended" }),
    });

    // Replay session
    const s2 = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: "client-sess-2" }),
    });
    const { id: id2, writeToken: wt2 } = await s2.json<{ id: string; writeToken: string }>();
    expect(id2).not.toBe(id1);

    await call(`/api/view-sessions/${id2}`, {
      method: "PATCH",
      headers: { cookie },
      body: jsonBody({ writeToken: wt2, heartbeatSeq: 1, deltaSeconds: 10, positionSeconds: 60 }),
    });

    // Both sessions exist in database
    const rows = await env.DB.prepare("SELECT count(*) as count FROM view_sessions WHERE video_id = 'why-sky-blue'").first<{ count: number }>();
    expect(rows?.count).toBe(2);
  });

  // Test E2E 04: History date query
  it("E2E 04: History endpoint filters strictly by requested date", async () => {
    const parentCookie = await addParent();
    const { cookie: kidCookie } = await pairDevice();

    // Insert note on 2026-08-21 (Taiwan time: 2026-08-21 14:00 -> UTC 2026-08-21T06:00:00Z)
    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie: kidCookie },
      body: jsonBody({ videoId: "big-story-dinosaurs", clientSessionId: "sess-dino-1" }),
    });
    const { id: sid, writeToken } = await sessionRes.json<{ id: string; writeToken: string }>();

    await env.DB.prepare(`
      INSERT INTO notes (id, video_id, view_session_id, content, video_position_seconds, created_at, updated_at)
      VALUES ('note-821', 'big-story-dinosaurs', ?, '恐龍是被石頭砸死的', 120, '2026-08-21T06:00:00.000Z', '2026-08-21T06:00:00.000Z')
    `).bind(sid).run();

    // Insert note on 2026-08-22
    await env.DB.prepare(`
      INSERT INTO notes (id, video_id, view_session_id, content, video_position_seconds, created_at, updated_at)
      VALUES ('note-822', 'big-story-dinosaurs', ?, '是不是天空黑掉了', 300, '2026-08-22T06:00:00.000Z', '2026-08-22T06:00:00.000Z')
    `).bind(sid).run();

    // Query 2026-08-21
    const res821 = await call("/api/parent/history?start=2026-08-20T16:00:00.000Z&end=2026-08-21T16:00:00.000Z", {
      headers: { cookie: parentCookie },
    });
    const data821 = await res821.json<{ notes: any[] }>();
    expect(data821.notes.length).toBe(1);
    expect(data821.notes[0].id).toBe("note-821");
    expect(data821.notes[0].content).toBe("恐龍是被石頭砸死的");
  });

  // Test E2E 05: 7-Day summary
  it("E2E 05: 7-day summary returns daily aggregation and chronological thinking notes", async () => {
    const parentCookie = await addParent();
    const sumRes = await call("/api/parent/summary?range=7d", { headers: { cookie: parentCookie } });
    expect(sumRes.status).toBe(200);
    const data = await sumRes.json<{ range: string; summary: any; dailyBars: any[]; notes: any[] }>();
    expect(data.range).toBe("7d");
    expect(data.dailyBars.length).toBe(7);
  });

  // Test E2E 06: Note search remains disabled
  it("E2E 06: Keeps parent note search disabled", async () => {
    const parentCookie = await addParent();
    await env.DB.prepare(`
      INSERT INTO notes (id, video_id, content, video_position_seconds, created_at, updated_at)
      VALUES ('note-search-1', 'big-story-dinosaurs', '植物死掉以後恐龍就沒有東西吃了', 200, '2026-08-29T10:00:00Z', '2026-08-29T10:00:00Z')
    `).run();

    const searchRes = await call("/api/parent/notes/search?q=植物", { headers: { cookie: parentCookie } });
    expect(searchRes.status).toBe(410);
    expect(await searchRes.json()).toMatchObject({ code: "NOTES_DISABLED" });
  });

  // Test E2E 07: Video health check and auto deactivation
  it("E2E 07: Marks unavailable video as inactive while keeping historical notes intact", async () => {
    const parentCookie = await addParent();

    // Attach a historical note to cheetah
    await env.DB.prepare(`
      INSERT INTO notes (id, video_id, content, video_position_seconds, created_at, updated_at)
      VALUES ('cheetah-note', 'cheetah', '獵豹跑得好快', 50, '2026-08-25T10:00:00Z', '2026-08-25T10:00:00Z')
    `).run();

    // Set cheetah to unavailable in DB directly (simulating failed health check)
    await env.DB.prepare("UPDATE videos SET availability_status = 'unavailable', health_status = 'unavailable', is_active = 0 WHERE id = 'cheetah'").run();

    // Check kid side does not show cheetah
    const kidCatRes = await call("/api/content/categories/animals/videos");
    const kidVideos = await kidCatRes.json<any[]>();
    expect(kidVideos.some((v) => v.id === "cheetah")).toBe(false);

    // Parent history for cheetah still has historical notes
    const detailRes = await call("/api/parent/videos/cheetah/history", { headers: { cookie: parentCookie } });
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json<{ notes: any[]; stats: any }>();
    expect(detailData.notes.length).toBe(1);
    expect(detailData.notes[0].content).toBe("獵豹跑得好快");
  });

  // Test E2E 08: Batch operations
  it("E2E 08: Batch updates multiple videos (hide/show/archive)", async () => {
    const parentCookie = await addParent();

    const res = await call("/api/parent/videos/batch", {
      method: "POST",
      headers: { cookie: parentCookie },
      body: jsonBody({ videoIds: ["why-sky-blue", "big-story-dinosaurs"], action: "hide" }),
    });
    expect(res.status).toBe(200);

    const rows = await env.DB.prepare("SELECT count(*) as count FROM videos WHERE id IN ('why-sky-blue', 'big-story-dinosaurs') AND is_active = 0").first<{ count: number }>();
    expect(rows?.count).toBe(2);
  });

  // Test E2E 09: Note exports remain disabled
  it("E2E 09: Keeps note exports disabled", async () => {
    const parentCookie = await addParent();
    await env.DB.prepare(`
      INSERT INTO notes (id, video_id, content, video_position_seconds, created_at, updated_at)
      VALUES ('export-note-1', 'why-sky-blue', '因為陽光散亂散射', 60, '2026-08-29T10:00:00Z', '2026-08-29T10:00:00Z')
    `).run();

    // Export Markdown
    const mdRes = await call("/api/parent/export/notes?format=md&range=all", { headers: { cookie: parentCookie } });
    expect(mdRes.status).toBe(410);
    expect(await mdRes.json()).toMatchObject({ code: "NOTES_DISABLED" });

    // Export CSV
    const csvRes = await call("/api/parent/export/notes?format=csv&range=all", { headers: { cookie: parentCookie } });
    expect(csvRes.status).toBe(410);
    expect(await csvRes.json()).toMatchObject({ code: "NOTES_DISABLED" });
  });

  // Test E2E 10: Category time statistics
  it("E2E 10: Computes category time statistics and percentage for daily and summary dashboards", async () => {
    const parentCookie = await addParent();
    const { cookie: deviceCookie } = await pairDevice();

    // Start a session for why-sky-blue (category: science)
    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie: deviceCookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: "sess-cat-test-1" }),
    });
    const { id: sid, writeToken } = await sessionRes.json<{ id: string; writeToken: string }>();

    // Send heartbeat 60 seconds (max delta per heartbeat is 60)
    const intervalEnd = new Date();
    const nowIso = intervalEnd.toISOString();
    const intervalStartIso = new Date(intervalEnd.getTime() - 60_000).toISOString();
    await call(`/api/view-sessions/${sid}`, {
      method: "PATCH",
      headers: { cookie: deviceCookie },
      body: jsonBody({
        writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 60,
        positionSeconds: 60,
        intervalStartedAt: intervalStartIso,
        intervalEndedAt: nowIso,
        status: "active",
      }),
    });

    const dashRes = await call("/api/parent/dashboard/today", { headers: { cookie: parentCookie } });
    expect(dashRes.status).toBe(200);
    const dashData = await dashRes.json<{ categoryStats: any[] }>();
    expect(dashData.categoryStats).toBeDefined();
    expect(dashData.categoryStats.length).toBeGreaterThan(0);
    const scienceStat = dashData.categoryStats.find((cs) => cs.name.includes("科學"));
    expect(scienceStat).toBeDefined();
    expect(scienceStat.playedSeconds).toBe(60);
    expect(scienceStat.percentage).toBe(100);

    const sumRes = await call("/api/parent/summary?range=7d", { headers: { cookie: parentCookie } });
    expect(sumRes.status).toBe(200);
    const sumData = await sumRes.json<{ categoryStats: any[] }>();
    expect(sumData.categoryStats).toBeDefined();
    const sumScienceStat = sumData.categoryStats.find((cs) => cs.name.includes("科學"));
    expect(sumScienceStat).toBeDefined();
    expect(sumScienceStat.playedSeconds).toBe(60);
  });
});
