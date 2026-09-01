import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { evaluateChildAccessState } from "../worker/rules";
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
  const token = "test-device-token-phase3";
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
    env.DB.prepare("DELETE FROM notes"),
    env.DB.prepare("DELETE FROM view_sessions"),
    env.DB.prepare("DELETE FROM admin_sessions"),
    env.DB.prepare("DELETE FROM admin_credentials"),
    env.DB.prepare("DELETE FROM child_devices"),
    env.DB.prepare("DELETE FROM rate_limit_buckets"),
    env.DB.prepare("DELETE FROM daily_overrides"),
    env.DB.prepare("DELETE FROM allowed_windows"),
    env.DB.prepare("DELETE FROM daily_video_picks"),
    env.DB.prepare("DELETE FROM usage_rules"),
    env.DB.prepare("INSERT INTO usage_rules (id, day_type, daily_limit_seconds, grace_period_seconds, is_active) VALUES ('weekday', 'weekday', 2400, 300, 1), ('weekend', 'weekend', 3600, 300, 1)"),
    env.DB.prepare("UPDATE videos SET is_active = 1, archived_at = NULL, availability_status = 'available', health_status = 'healthy', duration_seconds = 1200, metadata_error = NULL"),
    env.DB.prepare("UPDATE categories SET is_active = 1, archived_at = NULL"),
  ]);
});

describe("Phase 3: Family Usage Rules & Time Management Suite", () => {
  // Test 01: Child Access State API
  it("E2E 01: Child access state returns AVAILABLE and remaining seconds", async () => {
    const res = await call("/api/child/access-state");
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.state).toBe("AVAILABLE");
    expect(data.dailyLimitSeconds).toBeGreaterThan(0);
    expect(data.remainingSeconds).toBeGreaterThan(0);
    expect(data.isPaused).toBe(false);
  });

  // Test 02: Parent Rules API - GET & UPDATE
  it("E2E 02: Parent can view and update usage rules and time windows", async () => {
    const parentCookie = await addParent();

    const getRes = await call("/api/parent/rules", { headers: { cookie: parentCookie } });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json<any>();
    expect(getData.rules).toBeDefined();
    expect(getData.rules.length).toBe(2);

    // Update weekday rule to 50 mins (3000s) and add allowed window
    const updateRes = await call("/api/parent/rules", {
      method: "PUT",
      headers: { cookie: parentCookie },
      body: jsonBody({
        rules: [
          {
            id: "weekday",
            dailyLimitSeconds: 3000,
            gracePeriodSeconds: 300,
            allowedWindows: [
              { id: "win-1", startTime: "17:00", endTime: "19:30", sortOrder: 1 },
            ],
          },
          {
            id: "weekend",
            dailyLimitSeconds: 3600,
            gracePeriodSeconds: 300,
            allowedWindows: [],
          },
        ],
      }),
    });
    expect(updateRes.status).toBe(200);

    // Verify persisted
    const verifyRes = await call("/api/parent/rules", { headers: { cookie: parentCookie } });
    const verifyData = await verifyRes.json<any>();
    const weekdayRule = verifyData.rules.find((r: any) => r.id === "weekday");
    expect(weekdayRule.dailyLimitSeconds).toBe(3000);
    expect(weekdayRule.allowedWindows.length).toBe(1);
    expect(weekdayRule.allowedWindows[0].startTime).toBe("17:00");
  });

  // Test 03: Parent Temporary Bonus API
  it("E2E 03: Parent can add +10 / +20 minutes bonus for today", async () => {
    const parentCookie = await addParent();

    const bonusRes = await call("/api/parent/today/bonus", {
      method: "POST",
      headers: { cookie: parentCookie },
      body: jsonBody({ minutes: 10 }),
    });
    expect(bonusRes.status).toBe(200);

    const checkRes = await call("/api/child/access-state");
    const checkData = await checkRes.json<any>();
    expect(checkData.bonusSeconds).toBe(600); // 10 minutes in seconds
  });

  // Test 04: Parent Pause and Resume API
  it("E2E 04: Parent can pause and resume watching today", async () => {
    const parentCookie = await addParent();

    // 1. Pause
    const pauseRes = await call("/api/parent/today/pause", {
      method: "POST",
      headers: { cookie: parentCookie },
    });
    expect(pauseRes.status).toBe(200);

    const childPausedRes = await call("/api/child/access-state");
    const childPausedData = await childPausedRes.json<any>();
    expect(childPausedData.state).toBe("PAUSED_BY_PARENT");
    expect(childPausedData.isPaused).toBe(true);
    expect(childPausedData.message).toContain("今天先休息一下");

    // 2. Resume
    const resumeRes = await call("/api/parent/today/resume", {
      method: "POST",
      headers: { cookie: parentCookie },
    });
    expect(resumeRes.status).toBe(200);

    const childResumedRes = await call("/api/child/access-state");
    const childResumedData = await childResumedRes.json<any>();
    expect(childResumedData.state).toBe("AVAILABLE");
    expect(childResumedData.isPaused).toBe(false);
  });

  // Test 05: Today Picks API
  it("E2E 05: Parent can toggle today's video recommendation picks and kid can fetch them", async () => {
    const parentCookie = await addParent();

    // Toggle video 'why-sky-blue' into today's picks
    const toggleRes = await call("/api/parent/today/picks/why-sky-blue/toggle", {
      method: "POST",
      headers: { cookie: parentCookie },
    });
    expect(toggleRes.status).toBe(200);
    const toggleData = await toggleRes.json<any[]>();
    expect(toggleData.length).toBe(1);
    expect(toggleData[0].videoId).toBe("why-sky-blue");

    // Fetch as kid
    const kidPicksRes = await call("/api/child/today-picks");
    expect(kidPicksRes.status).toBe(200);
    const kidPicks = await kidPicksRes.json<any[]>();
    expect(kidPicks.length).toBe(1);
    expect(kidPicks[0].videoId).toBe("why-sky-blue");

    // Untoggle video
    const untoggleRes = await call("/api/parent/today/picks/why-sky-blue/toggle", {
      method: "POST",
      headers: { cookie: parentCookie },
    });
    expect(untoggleRes.status).toBe(200);
    const untoggleData = await untoggleRes.json<any[]>();
    expect(untoggleData.length).toBe(0);
  });

  // Test 06: Rule Enforcement on startViewSession
  it("E2E 06: Reject startViewSession with 403 when parent has paused today", async () => {
    const parentCookie = await addParent();
    const device = await pairDevice();

    await call("/api/parent/today/pause", { method: "POST", headers: { cookie: parentCookie } });

    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie: device.cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }),
    });
    expect(sessionRes.status).toBe(403);
    const sessionErr = await sessionRes.json<any>();
    expect(sessionErr.code).toBe("PAUSED_BY_PARENT");
  });

  // Test 07: Category-specific limit evaluation & configuration
  it("E2E 07: Set category daily limit and verify categoryStates in access-state", async () => {
    const parentCookie = await addParent();
    const categories = await (await call("/api/parent/categories", { headers: { cookie: parentCookie } })).json<any[]>();
    const natureCat = categories.find((c) => c.id === "nature") || categories[0];

    // Set 15 minutes limit (900 seconds) on nature category
    const updateRes = await call(`/api/parent/categories/${natureCat.id}`, {
      method: "PUT",
      headers: { cookie: parentCookie },
      body: jsonBody({ dailyLimitSeconds: 900 }),
    });
    expect(updateRes.status).toBe(200);

    // Evaluate child access state
    const accessRes = await call("/api/child/access-state");
    expect(accessRes.status).toBe(200);
    const access = await accessRes.json<any>();
    expect(access.categoryStates).toBeDefined();

    const catState = access.categoryStates.find((cs: any) => cs.categoryId === natureCat.id);
    expect(catState).toBeDefined();
    expect(catState.dailyLimitSeconds).toBe(900);
    expect(catState.isReached).toBe(false);
    expect(catState.remainingSeconds).toBe(900);
  });

  // Test 08: Phase 2 limits are global; legacy per-category values are not enforced.
  it("E2E 08: Uses the shared allowance instead of a legacy category limit", async () => {
    const parentCookie = await addParent();
    const device = await pairDevice();
    const categories = await (await call("/api/parent/categories", { headers: { cookie: parentCookie } })).json<any[]>();
    const natureCat = categories.find((c) => c.id === "nature") || categories[0];

    // Set 10 minutes limit (600 seconds) on nature category
    await call(`/api/parent/categories/${natureCat.id}`, {
      method: "PUT",
      headers: { cookie: parentCookie },
      body: jsonBody({ dailyLimitSeconds: 600 }),
    });

    // Create a completed session of 600 seconds on video 'why-sky-blue' (which belongs to 'nature')
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO view_sessions (id, client_session_id, video_id, child_device_id, played_seconds, last_position_seconds, started_at, updated_at, ended_at)
      VALUES (?, ?, 'why-sky-blue', ?, 600, 600, ?, ?, ?)
    `).bind(sessionId, crypto.randomUUID(), device.id, now, now, now).run();

    // Now start a new session for 'why-sky-blue'
    const sessionRes = await call("/api/view-sessions", {
      method: "POST",
      headers: { cookie: device.cookie },
      body: jsonBody({ videoId: "why-sky-blue", clientSessionId: crypto.randomUUID() }),
    });
    expect(sessionRes.status).toBe(201);
  });
});
