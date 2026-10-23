// Retired experiment, 2026-10-23: user approved restoring d1e3d2a playback.
// Keep the original comparison assertions for an explicit future baseline run.
// This is not a current regression spec; modern playback regressions remain active.
import { expect, test, type Page } from "@playwright/test";
import { finishMediaForTest, getMediaLoadCount, getMediaSourceRemovalCount, installDeterministicMedia, invokeMediaSessionAction, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

async function baselineSeries(page: Page, seriesType: "learning" | "leisure" = "leisure") {
  await installDeterministicMedia(page, 0, { deferPlayUntilReady: true, readyDelayMs: 150 });
  await page.addInitScript(() => {
    let locked = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => locked });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => locked ? "hidden" : "visible" });
    (window as Window & { __baselineLock?: (value: boolean) => void }).__baselineLock = (value) => {
      locked = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  const first = {
    id: TEST_VIDEO_ID, categoryId: "learning-e2e", categoryIds: ["learning-e2e"],
    parentLabel: "第一集", youtubeTitle: "First baseline episode", sortOrder: 1,
    thumbnailUrl: "/local-media-placeholder.svg", durationSeconds: 120,
    lastPositionSeconds: 0, isWatched: false, isLearned: false, isSelectable: true,
    seriesType, listenRepeatCount: 1, source: "self_hosted", mediaType: "video",
    mediaPath: "first.wav", mediaUrl: "/e2e-media/regression-media.wav?baseline=first",
    youtubeVideoId: null, thumbnailPath: null,
  };
  const second = {
    ...first, id: "baseline-second", parentLabel: "第二集", sortOrder: 2,
    mediaPath: "second.wav", mediaUrl: "/e2e-media/regression-media.wav?baseline=second",
  };
  await mockAuthorizedWatchApi(page, undefined, first);
  await page.route("**/api/content/categories/learning-e2e/videos", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([first, second]),
  }));
  await page.route("**/api/content/videos/baseline-second", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(second),
  }));
  const sessions: Array<{ videoId: string; playbackMode: string }> = [];
  await page.route("**/api/view-sessions", async (route) => {
    const body = route.request().postDataJSON();
    sessions.push({ videoId: body.videoId, playbackMode: body.playbackMode });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: "session-e2e", writeToken: "write-token-e2e", startedAt: new Date().toISOString(),
    }) });
  });
  const events: Array<{ type: string; detail?: Record<string, unknown> }> = [];
  await page.route("**/api/diagnostics/**", async (route) => {
    const body = route.request().postDataJSON();
    if (Array.isArray(body.events)) events.push(...body.events);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "baseline-diagnostic", ok: true }) });
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&fresh=1`);
  await expect(page.locator("main.watch-page")).toHaveAttribute("data-playback-baseline", "2026-09-06@59bcc15");
  await expect(page.getByTestId("playback-baseline-label")).toHaveText("9/6 驗證版 · 59bcc15");
  await expect(page.locator(".time-text").last()).toHaveText("02:00");
  const audio = page.locator("audio.native-media-player");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
  await audio.evaluate((element) => element.setAttribute("data-baseline-player", "original"));
  return { audio, first, second, sessions, events };
}

test("September 6 baseline continues leisure listening while hidden and wraps on the same audio element", async ({ page }) => {
  const { audio, first, second, sessions, events } = await baselineSeries(page);
  const removals = await getMediaSourceRemovalCount(page);
  await page.evaluate(() => (window as Window & { __baselineLock?: (value: boolean) => void }).__baselineLock?.(true));
  for (const video of [second, first]) {
    await finishMediaForTest(page);
    await expect(page).toHaveURL(new RegExp(`/watch/${video.id}\\?mode=listen&autoplay=1&fresh=1`));
    await expect(audio).toHaveAttribute("src", video.mediaUrl);
    await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
    await expect(audio).toHaveAttribute("data-baseline-player", "original");
    await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
    await expect(page.getByTestId("playback-baseline-label")).toBeVisible();
  }
  expect(await getMediaSourceRemovalCount(page)).toBe(removals);
  await expect.poll(() => sessions).toEqual([
    { videoId: first.id, playbackMode: "listen" },
    { videoId: second.id, playbackMode: "listen" },
    { videoId: first.id, playbackMode: "listen" },
  ]);
  await expect.poll(() => events.some((event) => event.type === "playback_baseline"
    && event.detail?.state === "2026-09-06@59bcc15")).toBe(true);
  await expect.poll(() => events.some((event) => event.type === "playback_confirmed"
    && event.detail?.documentHidden === true)).toBe(true);
});

test("September 6 learning baseline loops the current lesson instead of applying later repeat-count rules", async ({ page }) => {
  const { audio } = await baselineSeries(page, "learning");
  await page.evaluate(() => (window as Window & { __baselineLock?: (value: boolean) => void }).__baselineLock?.(true));
  for (let repeat = 0; repeat < 3; repeat += 1) {
    await expect(audio).toHaveJSProperty("loop", true);
    await finishMediaForTest(page);
    await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
    await expect(page).toHaveURL(new RegExp(`/watch/${TEST_VIDEO_ID}\\?mode=listen&fresh=1`));
    await expect(audio).toHaveAttribute("data-baseline-player", "original");
  }
});

test("September 6 system controls rebind the loaded source on lock-screen resume", async ({ page }) => {
  const { audio } = await baselineSeries(page);
  await page.evaluate(() => (window as Window & { __baselineLock?: (value: boolean) => void }).__baselineLock?.(true));
  await invokeMediaSessionAction(page, "pause");
  const pausedAt = await audio.evaluate((element) => (element as HTMLMediaElement).currentTime);
  const loads = await getMediaLoadCount(page);
  await invokeMediaSessionAction(page, "play");
  await expect.poll(() => getMediaLoadCount(page)).toBe(loads + 1);
  await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(pausedAt + 0.3);
  await expect(audio).toHaveAttribute("data-baseline-player", "original");
});

test("baseline safety bounds legacy failure reloads without renewing the retry budget at metadata", async ({ page }) => {
  await page.clock.install();
  await installDeterministicMedia(page, 0, { errorAfterMetadata: true });
  await mockAuthorizedWatchApi(page);
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&fresh=1`);
  await expect(page.getByText(/正在重新連線|目前連不到家裡的影片/)).toBeVisible();
  await page.clock.runFor(61_000);
  const loads = await getMediaLoadCount(page);
  expect(loads).toBeLessThanOrEqual(32);
  await page.clock.runFor(12_000);
  expect(await getMediaLoadCount(page)).toBe(loads);
});
