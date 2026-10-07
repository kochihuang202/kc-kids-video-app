import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { makePasswordRecord, tokenHash } from "../worker/security";
import { getDayRangeInTimeZone } from "../worker/rules";
import type { AppEnv, ChildProfile } from "../worker/types";
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

async function pairDevice(name = "家庭裝置") {
  const token = `test-device-token-${crypto.randomUUID()}`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, await tokenHash(token, appEnv), name, now, now).run();
  return { id, cookie: `kid_device=${token}` };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM view_heartbeats"),
    env.DB.prepare("DELETE FROM daily_usage_totals"),
    env.DB.prepare("DELETE FROM child_daily_usage"),
    env.DB.prepare("DELETE FROM child_video_learned"),
    env.DB.prepare("DELETE FROM child_favorites"),
    env.DB.prepare("DELETE FROM child_category_daily_usage"),
    env.DB.prepare("DELETE FROM daily_category_usage_totals"),
    env.DB.prepare("DELETE FROM notes"),
    env.DB.prepare("DELETE FROM view_sessions"),
    env.DB.prepare("DELETE FROM admin_sessions"),
    env.DB.prepare("DELETE FROM admin_credentials"),
    env.DB.prepare("DELETE FROM child_devices"),
    env.DB.prepare("DELETE FROM rate_limit_buckets"),
    env.DB.prepare("DELETE FROM daily_overrides"),
    env.DB.prepare("DELETE FROM allowed_windows"),
    env.DB.prepare("UPDATE categories SET daily_limit_seconds = NULL"),
  ]);
});

describe("Multi-Child Profiles and Independent Quotas Suite", () => {
  it("MC 01: Has default profiles for 阿云 and 阿涵 seeded", async () => {
    const res = await call("/api/child/profiles");
    expect(res.status).toBe(200);
    const body = await res.json<{ activeChild: ChildProfile | null; children: ChildProfile[] }>();
    const children = body.children;
    expect(children.length).toBeGreaterThanOrEqual(2);
    const ayun = children.find((c) => c.name === "阿云");
    const ahan = children.find((c) => c.name === "阿涵");
    expect(ayun).toBeDefined();
    expect(ayun?.avatar).toBe("🦁");
    expect(ayun?.tone).toBe("sky");
    expect(ayun?.weekdayLimitSeconds).toBe(2400); // 40 mins
    expect(ahan).toBeDefined();
    expect(ahan?.avatar).toBe("🐰");
    expect(ahan?.tone).toBe("apricot");
    expect(ahan?.weekdayLimitSeconds).toBe(1500); // 25 mins
  });

  it("MC 02: Parent can switch active child profile and receive persistent cookie", async () => {
    const parentCookie = await addParent();
    const switchRes = await call("/api/parent/children/child_ahan/switch", {
      method: "POST",
      headers: { cookie: parentCookie },
    });
    expect(switchRes.status).toBe(200);
    const switchBody = await switchRes.json<{ ok: boolean; activeChild: ChildProfile }>();
    expect(switchBody.ok).toBe(true);
    expect(switchBody.activeChild.name).toBe("阿涵");

    const kidCookie = cookieValue(switchRes);
    expect(kidCookie).toContain("kid_profile_id=child_ahan");

    // When accessing access-state with this cookie, returns 阿涵
    const accessRes = await call("/api/child/access-state", {
      headers: { cookie: kidCookie },
    });
    expect(accessRes.status).toBe(200);
    const access = await accessRes.json<any>();
    expect(access.activeChild).toMatchObject({
      id: "child_ahan",
      name: "阿涵",
      avatar: "🐰",
    });
  });

  it("MC 03: Completely independent daily quotas (阿云 watching does NOT consume 阿涵 quota)", async () => {
    const device = await pairDevice("測試 iPad");

    // 1. 阿云 starts a leisure session and sends heartbeats for 300 seconds
    const ayunSessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: {
        cookie: `${device.cookie}; kid_profile_id=child_ayun`,
      },
      body: jsonBody({
        videoId: "elmo-alphabet",
        clientSessionId: crypto.randomUUID(),
        playbackMode: "video",
      }),
    });
    expect(ayunSessionRes.status).toBe(201);
    const ayunSession = await ayunSessionRes.json<{ id: string; writeToken: string }>();

    const now = new Date();
    const start = new Date(now.getTime() - 60_000);
    const heartbeatRes = await call(`/api/view-sessions/${ayunSession.id}`, {
      method: "PATCH",
      headers: {
        cookie: `${device.cookie}; kid_profile_id=child_ayun`,
      },
      body: jsonBody({
        writeToken: ayunSession.writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 60,
        positionSeconds: 60,
        intervalStartedAt: start.toISOString(),
        intervalEndedAt: now.toISOString(),
      }),
    });
    expect(heartbeatRes.status).toBe(200);

    // 2. Check 阿云's access state -> leisureUsedSeconds should be 60
    const ayunAccess = await (await call("/api/child/access-state", {
      headers: { cookie: "kid_profile_id=child_ayun" },
    })).json<any>();
    expect(ayunAccess.activeChild.name).toBe("阿云");
    expect(ayunAccess.leisureUsedSeconds).toBe(60);

    // 3. Check 阿涵's access state -> leisureUsedSeconds MUST BE 0! Quota is completely untouched!
    const ahanAccess = await (await call("/api/child/access-state", {
      headers: { cookie: "kid_profile_id=child_ahan" },
    })).json<any>();
    expect(ahanAccess.activeChild.name).toBe("阿涵");
    expect(ahanAccess.leisureUsedSeconds).toBe(0);
    expect(ahanAccess.remainingSeconds).toBe(ahanAccess.dailyLimitSeconds);
  });

  it("MC 04: Independent learned state and favorites per child", async () => {
    const device = await pairDevice("客廳電視");

    // 阿云 marks why-sky-blue as learned and favorites it
    await call("/api/child/videos/why-sky-blue/learned", {
      method: "PUT",
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
      body: jsonBody({ learned: true }),
    });
    await call("/api/child/videos/why-sky-blue/favorite", {
      method: "PUT",
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
      body: jsonBody({ favorite: true }),
    });

    // Check 阿云's video view: learned=true, favorite=true
    const ayunVideo = await (await call("/api/content/videos/why-sky-blue", {
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
    })).json<any>();
    expect(ayunVideo.isLearned).toBe(true);
    expect(ayunVideo.isFavorite).toBe(true);

    // Check 阿涵's video view: learned=false, favorite=false!
    const ahanVideo = await (await call("/api/content/videos/why-sky-blue", {
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ahan` },
    })).json<any>();
    expect(ahanVideo.isLearned).toBe(false);
    expect(ahanVideo.isFavorite).toBe(false);
  });

  it("MC 05: Parent can create and update child profiles (name, avatar, tone, limits)", async () => {
    const parentCookie = await addParent();

    // 1. Create a 3rd child
    const createRes = await call("/api/parent/children", {
      method: "POST",
      headers: { cookie: parentCookie },
      body: jsonBody({
        name: "小寶",
        avatar: "🐯",
        tone: "sage",
        weekdayLimitSeconds: 1800, // 30 mins
        weekendLimitSeconds: 2700, // 45 mins
      }),
    });
    expect(createRes.status).toBe(201);
    const newChild = await createRes.json<ChildProfile>();
    expect(newChild.name).toBe("小寶");
    expect(newChild.avatar).toBe("🐯");
    expect(newChild.weekdayLimitSeconds).toBe(1800);

    // 2. Update 阿云's settings (e.g. increase quota and change tone)
    const updateRes = await call(`/api/parent/children/child_ayun`, {
      method: "PATCH",
      headers: { cookie: parentCookie },
      body: jsonBody({
        name: "阿云 (哥哥)",
        avatar: "🦁",
        tone: "sky",
        weekdayLimitSeconds: 3000, // 50 mins
        weekendLimitSeconds: 4200, // 70 mins
      }),
    });
    expect(updateRes.status).toBe(200);
    const updatedAyun = await updateRes.json<ChildProfile>();
    expect(updatedAyun.name).toBe("阿云 (哥哥)");
    expect(updatedAyun.weekdayLimitSeconds).toBe(3000);

    // 3. Verify in public profile list
    const listRes = await call("/api/child/profiles");
    const body = await listRes.json<{ activeChild: ChildProfile | null; children: ChildProfile[] }>();
    const all = body.children;
    expect(all.some((c) => c.name === "小寶")).toBe(true);
    expect(all.find((c) => c.id === "child_ayun")?.name).toBe("阿云 (哥哥)");
  });

  it("MC 06: Parent dashboard filters statistics, summary, and ruleState strictly per child", async () => {
    const parentCookie = await addParent();
    const device = await pairDevice("客廳 TV");

    // Start and complete a 120s session for 阿云
    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: {
        cookie: `${device.cookie}; kid_profile_id=child_ayun`,
      },
      body: jsonBody({
        videoId: "why-sky-blue",
        clientSessionId: crypto.randomUUID(),
        playbackMode: "video",
      }),
    });
    const session = await sessionRes.json<{ id: string; writeToken: string }>();
    const now = new Date();
    const prev = new Date(now.getTime() - 60_000);
    const patchRes = await call(`/api/view-sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        cookie: `${device.cookie}; kid_profile_id=child_ayun`,
      },
      body: jsonBody({
        writeToken: session.writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 60,
        positionSeconds: 60,
        intervalStartedAt: prev.toISOString(),
        intervalEndedAt: now.toISOString(),
      }),
    });
    expect(patchRes.status).toBe(200);

    const start = new Date(now.getTime() - 86400_000).toISOString();
    const end = new Date(now.getTime() + 86400_000).toISOString();

    // Query for 阿涵: should have 0 played seconds and ruleState for 阿涵
    const ahanRes = await call(`/api/parent/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&child_id=child_ahan`, {
      headers: { cookie: parentCookie },
    });
    expect(ahanRes.status).toBe(200);
    const ahanData = await ahanRes.json<any>();
    expect(ahanData.summary.totalPlayedSeconds).toBe(0);
    expect(ahanData.ruleState.activeChild.id).toBe("child_ahan");
    expect(ahanData.ruleState.activeChild.name).toBe("阿涵");

    // Query for 阿云: should have 60 played seconds and ruleState for 阿云
    const ayunRes = await call(`/api/parent/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&child_id=child_ayun`, {
      headers: { cookie: parentCookie },
    });
    expect(ayunRes.status).toBe(200);
    const ayunData = await ayunRes.json<any>();
    expect(ayunData.summary.totalPlayedSeconds).toBe(60);
    expect(ayunData.ruleState.activeChild.id).toBe("child_ayun");
  });

  it("MC 07: Rebuilds a missing child rollup so dashboard totals and quota state agree", async () => {
    const parentCookie = await addParent();
    const device = await pairDevice("阿云的 iPad");
    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
      body: jsonBody({
        videoId: "elmo-alphabet",
        clientSessionId: crypto.randomUUID(),
        playbackMode: "video",
      }),
    });
    expect(sessionRes.status).toBe(201);
    const session = await sessionRes.json<{ id: string; writeToken: string }>();
    const now = new Date();
    const startAt = new Date(now.getTime() - 60_000);
    expect((await call(`/api/view-sessions/${session.id}`, {
      method: "PATCH",
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
      body: jsonBody({
        writeToken: session.writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 60,
        positionSeconds: 60,
        intervalStartedAt: startAt.toISOString(),
        intervalEndedAt: now.toISOString(),
      }),
    })).status).toBe(200);

    // Reproduce the deployed migration gap: detailed history exists, but the
    // new per-child daily rollup was never backfilled.
    await env.DB.prepare("DELETE FROM child_daily_usage WHERE child_id = 'child_ayun'").run();

    const { start: rangeStart, end: rangeEnd } = getDayRangeInTimeZone("Asia/Taipei", now);
    const response = await call(
      `/api/parent/history?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&child_id=child_ayun`,
      { headers: { cookie: parentCookie } },
    );
    expect(response.status).toBe(200);
    const dashboard = await response.json<any>();
    expect(dashboard.summary.leisureSeconds).toBe(60);
    expect(dashboard.ruleState.leisureUsedSeconds).toBe(60);
    expect(dashboard.ruleState.remainingSeconds).toBe(dashboard.ruleState.dailyLimitSeconds - 60);
  });

  it("MC 08: Category viewing limits are independent for each child", async () => {
    const device = await pairDevice("共用 iPad");
    await env.DB.prepare("UPDATE categories SET daily_limit_seconds = 60 WHERE id = 'english'").run();
    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
      body: jsonBody({
        videoId: "elmo-alphabet",
        clientSessionId: crypto.randomUUID(),
        playbackMode: "video",
      }),
    });
    expect(sessionRes.status).toBe(201);
    const session = await sessionRes.json<{ id: string; writeToken: string }>();
    const now = new Date();
    expect((await call(`/api/view-sessions/${session.id}`, {
      method: "PATCH",
      headers: { cookie: `${device.cookie}; kid_profile_id=child_ayun` },
      body: jsonBody({
        writeToken: session.writeToken,
        heartbeatSeq: 1,
        deltaSeconds: 60,
        positionSeconds: 60,
        intervalStartedAt: new Date(now.getTime() - 60_000).toISOString(),
        intervalEndedAt: now.toISOString(),
      }),
    })).status).toBe(200);

    // Migration 0016 discards derived rows and rebuilds them from the preserved
    // session history on the first access for each child.
    await env.DB.prepare("DELETE FROM child_daily_usage").run();
    await env.DB.prepare("DELETE FROM child_category_daily_usage").run();

    const ayun = await (await call("/api/child/access-state", {
      headers: { cookie: "kid_profile_id=child_ayun" },
    })).json<any>();
    const ahan = await (await call("/api/child/access-state", {
      headers: { cookie: "kid_profile_id=child_ahan" },
    })).json<any>();
    const ayunEnglish = ayun.categoryStates.find((item: any) => item.categoryId === "english");
    const ahanEnglish = ahan.categoryStates.find((item: any) => item.categoryId === "english");
    expect(ayunEnglish.todayPlayedSeconds).toBe(60);
    expect(ayunEnglish.isReached).toBe(true);
    expect(ahanEnglish.todayPlayedSeconds).toBe(0);
    expect(ahanEnglish.isReached).toBe(false);
  });

  it("MC 09: Simultaneous playback by different children counts for both quotas", async () => {
    const parentCookie = await addParent();
    const device = await pairDevice("家庭共用裝置");
    const intervalEnd = new Date();
    const intervalStart = new Date(intervalEnd.getTime() - 60_000);

    const playFor = async (childId: string) => {
      const started = await call("/api/view-sessions", {
        method: "POST",
        headers: { cookie: `${device.cookie}; kid_profile_id=${childId}` },
        body: jsonBody({
          videoId: "elmo-alphabet",
          clientSessionId: crypto.randomUUID(),
          playbackMode: "video",
        }),
      });
      expect(started.status).toBe(201);
      const session = await started.json<{ id: string; writeToken: string }>();
      expect((await call(`/api/view-sessions/${session.id}`, {
        method: "PATCH",
        headers: { cookie: `${device.cookie}; kid_profile_id=${childId}` },
        body: jsonBody({
          writeToken: session.writeToken,
          heartbeatSeq: 1,
          deltaSeconds: 60,
          positionSeconds: 60,
          intervalStartedAt: intervalStart.toISOString(),
          intervalEndedAt: intervalEnd.toISOString(),
        }),
      })).status).toBe(200);
    };

    await playFor("child_ayun");
    await playFor("child_ahan");

    const ayun = await (await call("/api/child/access-state", {
      headers: { cookie: "kid_profile_id=child_ayun" },
    })).json<any>();
    const ahan = await (await call("/api/child/access-state", {
      headers: { cookie: "kid_profile_id=child_ahan" },
    })).json<any>();
    expect(ayun.leisureUsedSeconds).toBe(60);
    expect(ahan.leisureUsedSeconds).toBe(60);

    const { start, end } = getDayRangeInTimeZone("Asia/Taipei", intervalEnd);
    const dashboard = await (await call(
      `/api/parent/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&child_id=all`,
      { headers: { cookie: parentCookie } },
    )).json<any>();
    expect(dashboard.summary.leisureSeconds).toBe(120);
    expect(dashboard.summary.totalPlayedSeconds).toBe(120);
  });

  it("MC 10: Backfills legacy learned rows created after the multi-child migration", async () => {
    const legacyLearnedAt = "2026-10-06T01:34:47.771Z";
    const currentLearnedAt = "2026-10-07T00:15:00.000Z";
    await env.DB.batch([
      env.DB.prepare("DELETE FROM child_video_learned WHERE child_id = 'child_ayun' AND video_id IN ('why-sky-blue', 'elmo-alphabet')"),
      env.DB.prepare("DELETE FROM video_learned_state WHERE video_id IN ('why-sky-blue', 'elmo-alphabet')"),
      env.DB.prepare(`
        INSERT INTO video_learned_state (video_id, is_learned, learned_at, updated_at)
        VALUES ('why-sky-blue', 1, ?, ?), ('elmo-alphabet', 1, ?, ?)
      `).bind(legacyLearnedAt, legacyLearnedAt, legacyLearnedAt, legacyLearnedAt),
      env.DB.prepare(`
        INSERT INTO child_video_learned (child_id, video_id, is_learned, learned_at, updated_at)
        VALUES ('child_ayun', 'elmo-alphabet', 1, ?, ?)
      `).bind(currentLearnedAt, currentLearnedAt),
    ]);

    const repairMigration = env.TEST_MIGRATIONS.find(
      (migration) => migration.name === "0018_backfill_legacy_learned_states.sql",
    );
    expect(repairMigration).toBeDefined();
    await env.DB.batch(repairMigration!.queries.map((query) => env.DB.prepare(query)));

    const repaired = await env.DB.prepare(`
      SELECT child_id, video_id, learned_at
      FROM child_video_learned
      WHERE video_id IN ('why-sky-blue', 'elmo-alphabet')
      ORDER BY child_id, video_id
    `).all<{ child_id: string; video_id: string; learned_at: string | null }>();
    expect(repaired.results).toEqual([
      { child_id: "child_ayun", video_id: "elmo-alphabet", learned_at: currentLearnedAt },
      { child_id: "child_ayun", video_id: "why-sky-blue", learned_at: legacyLearnedAt },
    ]);
  });
});

