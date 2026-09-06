import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test.use({ viewport: { width: 390, height: 844 } });

test("switches the active player between viewing and listening without mixing sessions or losing position", async ({ page }) => {
  const sessionModes: string[] = [];
  const closedSessions: string[] = [];

  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    seriesType: "leisure",
    parentLabel: "休閒模式切換測試",
  });
  await page.route("**/api/view-sessions**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/view-sessions" && request.method() === "POST") {
      const body = request.postDataJSON() as { playbackMode: string };
      sessionModes.push(body.playbackMode);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: `mode-session-${sessionModes.length}`, writeToken: "mode-write-token", startedAt: new Date().toISOString() }),
      });
    }
    if (path.startsWith("/api/view-sessions/") && request.method() === "PATCH") {
      const body = request.postDataJSON() as { status: string };
      if (body.status === "ended") closedSessions.push(path.split("/").pop() || "");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.fallback();
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video`);
  await page.locator(".main-play-btn").click();
  await expect.poll(() => sessionModes).toEqual(["video"]);
  await page.waitForTimeout(350);
  const positionBeforeSwitch = await page.locator("video.native-media-player").evaluate((element: HTMLVideoElement) => element.currentTime);

  const selector = page.getByRole("group", { name: "播放器播放模式" });
  await selector.getByRole("button", { name: "純聽" }).click();
  await expect(selector.getByRole("button", { name: "純聽" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("audio.native-media-player")).toHaveCount(1);
  await expect.poll(() => sessionModes).toEqual(["video", "listen"]);
  await expect.poll(() => closedSessions).toContain("mode-session-1");
  const listeningPosition = await page.locator("audio.native-media-player").evaluate((element: HTMLAudioElement) => element.currentTime);
  expect(listeningPosition).toBeGreaterThanOrEqual(positionBeforeSwitch - 0.5);

  await selector.getByRole("button", { name: "觀看" }).click();
  await expect(selector.getByRole("button", { name: "觀看" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("video.native-media-player")).toHaveCount(1);
  await expect.poll(() => sessionModes).toEqual(["video", "listen", "video"]);
  await expect.poll(() => closedSessions).toContain("mode-session-2");
});

test("offers pure listening when leisure viewing time is already exhausted", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    seriesType: "leisure",
    parentLabel: "額度結束測試",
  });
  await page.route("**/api/child/access-state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      state: "DAILY_LIMIT_REACHED", remainingSeconds: 0, todayPlayedSeconds: 3600, dailyLimitSeconds: 3600,
      bonusSeconds: 0, baseLimitSeconds: 3600, earnedBonusSeconds: 0, learningSeconds: 0,
      leisureUsedSeconds: 3600, listenSeconds: 0, gracePeriodSeconds: 0, nextAllowedAt: null,
      isPaused: false, serverTimeTaipei: "2026-09-06T12:00:00+08:00", todayDate: "2026-09-06",
      message: "今天的休閒時間到了", categoryStates: [],
    }),
  }));

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video`);
  const timeUp = page.getByRole("region", { name: "時間到了" });
  await expect(timeUp).toBeVisible();
  await expect(timeUp.getByRole("button", { name: "再看一次" })).toHaveCount(0);
  await timeUp.getByRole("button", { name: "改成純聽並繼續" }).click();
  await expect(timeUp).toBeHidden();
  await expect(page.getByRole("group", { name: "播放器播放模式" }).getByRole("button", { name: "純聽" })).toHaveAttribute("aria-pressed", "true");
});
