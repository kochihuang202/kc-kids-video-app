import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test("records a real playback flow as one batched device diagnostic", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video", mediaUrl: "/e2e-media/regression-media.wav", source: "self_hosted",
  });
  await page.route("**/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ mediaRootReadable: true, tailscale: { running: true, selfOnline: true } }),
  }));
  const eventTypes: string[] = [];
  const eventErrors: Array<string | undefined> = [];
  const outcomes: string[] = [];
  await page.route("**/api/diagnostics/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/diagnostics/sessions" && request.method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "diagnostic-e2e" }) });
      return;
    }
    if (path.endsWith("/events")) {
      const body = request.postDataJSON() as { events: Array<{ type: string; errorCode?: string }> };
      eventTypes.push(...body.events.map((event) => event.type));
      eventErrors.push(...body.events.map((event) => event.errorCode));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    const body = request.postDataJSON() as { outcome: string };
    outcomes.push(body.outcome);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}`);
  await page.locator(".main-play-btn").click();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await expect.poll(() => eventTypes).toEqual(expect.arrayContaining([
    "page_opened", "player_created", "player_ready", "play_requested", "playing",
  ]));
  await page.locator(".player-back").click();

  await expect.poll(() => eventTypes).toEqual(expect.arrayContaining([
    "page_opened", "player_created", "player_ready", "play_requested", "playing", "route_left",
  ]));
  expect(eventErrors.filter(Boolean)).toEqual([]);
  await expect.poll(() => outcomes).toEqual(["success"]);
});

test("parent diagnostics shows named devices and problem sessions", async ({ page }) => {
  await page.route("**/api/parent/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path === "/api/parent/session" ? { authenticated: true }
      : path === "/api/parent/diagnostics/summary" ? {
        devices: [{ deviceId: "iphone-13", deviceName: "小孩 iPhone 13", sessionCount: 8, successCount: 7, problemCount: 1, lastSeenAt: "2026-09-04T10:00:00Z" }],
        errors: [{ errorCode: "MEDIA_PROBE_FAILED", source: "self_hosted", sessionCount: 1, lastSeenAt: "2026-09-04T10:00:00Z" }],
      } : path === "/api/parent/diagnostics/sessions" ? { sessions: [{
        id: "diag-1", deviceId: "iphone-13", deviceName: "小孩 iPhone 13", videoId: "wow-1", videoLabel: "Wow English 01",
        categoryId: "wowenglish", source: "self_hosted", playbackMode: "video", outcome: "recovered",
        retryCount: 2, errorCount: 1, lastErrorCode: "MEDIA_PROBE_FAILED", firstPlayMs: 3200,
        browserName: "Safari", browserVersion: "26.1", osName: "iOS", osVersion: "26.1",
        viewportWidth: 390, viewportHeight: 844, isStandalone: 0, networkType: null, ipPrefix: "203.0.113.x",
        country: "TW", colo: "TPE", httpProtocol: "HTTP/3", tlsVersion: "TLSv1.3",
        startedAt: "2026-09-04T10:00:00Z", endedAt: "2026-09-04T10:10:00Z",
      }] } : { session: {}, events: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/parent/diagnostics");
  await expect(page.getByRole("heading", { name: "裝置診斷" })).toBeVisible();
  await expect(page.getByText("小孩 iPhone 13", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("重試後成功", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("MEDIA_PROBE_FAILED", { exact: true })).toBeVisible();
});

test("identifies an iPad using Safari desktop-mode user agent", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.1 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
  });
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page);
  let startBody: Record<string, unknown> | null = null;
  await page.route("**/api/diagnostics/sessions", async (route) => {
    startBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "ipad-diagnostic" }) });
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}`);
  await expect.poll(() => startBody).toMatchObject({ osName: "iPadOS", osVersion: "unknown" });
});
