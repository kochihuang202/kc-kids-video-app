import { expect, test } from "@playwright/test";
import { getMediaSourceRemovalCount, installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test("REG-012 uses a real audio element for self-hosted pure listening", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    mediaUrl: "/e2e-media/regression-media.wav",
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);

  await expect(page.getByLabel("純聽模式")).toBeVisible();
  await expect(page.locator("audio.native-media-player")).toHaveCount(1);
  await expect(page.locator("video.native-media-player")).toHaveCount(0);
});

test("REG-012 continues a leisure listening playlist with native autoplay", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    mediaUrl: "/e2e-media/regression-media.wav",
    seriesType: "leisure",
  });

  const nextVideo = {
    id: "regression-next-media",
    categoryId: "learning-e2e",
    categoryIds: ["learning-e2e"],
    youtubeTitle: "Next regression media",
    parentLabel: "下一集",
    thumbnailUrl: "/local-media-placeholder.svg",
    sortOrder: 2,
    durationSeconds: 120,
    lastPositionSeconds: 0,
    isWatched: false,
    isLearned: false,
    isSelectable: true,
    seriesType: "leisure",
    source: "self_hosted",
    youtubeVideoId: null,
    mediaType: "video",
    mediaPath: "regression-media.wav",
    mediaUrl: "/e2e-media/regression-media.wav?episode=2",
    thumbnailPath: null,
  };
  const firstVideo = { ...nextVideo, id: TEST_VIDEO_ID, parentLabel: "第一集", sortOrder: 1 };
  const sessionModes: string[] = [];

  await page.route("**/api/content/categories/learning-e2e/videos", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([firstVideo, nextVideo]),
  }));
  await page.route("**/api/content/videos/regression-next-media", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(nextVideo),
  }));
  await page.route("**/api/child/access-state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      state: "DAILY_LIMIT_REACHED",
      remainingSeconds: 0,
      todayPlayedSeconds: 3600,
      dailyLimitSeconds: 3600,
      bonusSeconds: 0,
      baseLimitSeconds: 3600,
      earnedBonusSeconds: 0,
      learningSeconds: 0,
      leisureUsedSeconds: 3600,
      listenSeconds: 0,
      gracePeriodSeconds: 0,
      nextAllowedAt: null,
      isPaused: false,
      serverTimeTaipei: "2026-09-02T12:00:00+08:00",
      todayDate: "2026-09-02",
      message: "今天的休閒時間到了",
      categoryStates: [],
    }),
  }));
  await page.route("**/api/view-sessions", async (route) => {
    const body = route.request().postDataJSON() as { playbackMode: string };
    sessionModes.push(body.playbackMode);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: `listen-session-${sessionModes.length}`, writeToken: "listen-token", startedAt: new Date().toISOString() }),
    });
  });
  await page.route("**/api/view-sessions/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);
  await expect(page.locator("audio.native-media-player")).toHaveCount(1);
  const originalPlayer = page.locator("audio.native-media-player");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => sessionModes).toEqual(["listen"]);
  const sourceRemovalsBeforeAdvance = await getMediaSourceRemovalCount(page);
  await originalPlayer.evaluate((element) => element.setAttribute("data-playlist-player", "same-session"));
  await page.locator("audio.native-media-player").dispatchEvent("ended");

  await expect(page).toHaveURL(/\/watch\/regression-next-media\?mode=listen&autoplay=1/);
  await expect(page.locator('audio.native-media-player[data-playlist-player="same-session"]')).toHaveCount(1);
  await expect(page.locator("audio.native-media-player")).toHaveJSProperty("autoplay", true);
  await expect.poll(() => getMediaSourceRemovalCount(page)).toBe(sourceRemovalsBeforeAdvance);
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await expect(page.getByLabel("純聽模式")).toBeVisible();
  await expect(page.getByText("今天的休閒時間到了", { exact: true })).toBeHidden();
  await expect.poll(() => sessionModes).toEqual(["listen", "listen"]);
});
