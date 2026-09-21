import { expect, test } from "@playwright/test";
import { installDeterministicMedia, TEST_MEDIA_URL } from "../support/watch-page";

test.use({ viewport: { width: 1280, height: 800 } });

test("keeps volume and playback speed per series on the current device", async ({ page }) => {
  const category = {
    id: "series-a",
    name: "系列 A",
    icon: "📘",
    tone: "sky",
    sortOrder: 1,
    dailyLimitSeconds: null,
    seriesType: "learning",
  };
  const otherCategory = {
    ...category,
    id: "series-b",
    name: "系列 B",
    sortOrder: 2,
  };
  const videos = [1, 2].map((index) => ({
    id: `series-a-${index}`,
    categoryId: category.id,
    categoryIds: [category.id],
    source: "self_hosted",
    youtubeVideoId: null,
    mediaType: "video",
    mediaPath: `series-a-${index}.mp4`,
    mediaUrl: TEST_MEDIA_URL,
    thumbnailPath: null,
    youtubeTitle: `系列 A 第 ${index} 集`,
    parentLabel: `第 ${index} 集`,
    thumbnailUrl: "/local-media-placeholder.svg",
    durationSeconds: 120,
    sortOrder: index,
    lastPositionSeconds: 0,
    isWatched: false,
    isLearned: false,
    learnedAt: null,
    isSelectable: true,
    seriesType: "learning",
  }));
  const otherVideos = [{
    ...videos[0],
    id: "series-b-1",
    categoryId: otherCategory.id,
    categoryIds: [otherCategory.id],
    mediaPath: "series-b-1.mp4",
    youtubeTitle: "系列 B 第 1 集",
    parentLabel: "系列 B 第一集",
  }];
  const allVideos = [...videos, ...otherVideos];
  const access = {
    state: "AVAILABLE",
    remainingSeconds: 3600,
    todayPlayedSeconds: 0,
    dailyLimitSeconds: 3600,
    bonusSeconds: 0,
    baseLimitSeconds: 3600,
    earnedBonusSeconds: 0,
    learningSeconds: 0,
    leisureUsedSeconds: 0,
    listenSeconds: 0,
    gracePeriodSeconds: 0,
    nextAllowedAt: null,
    isPaused: false,
    serverTimeTaipei: "2026-09-21T12:00:00+08:00",
    todayDate: "2026-09-21",
    message: "",
    categoryStates: [],
  };

  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (path === "/api/content/categories") return json([category, otherCategory]);
    if (path === `/api/content/categories/${category.id}/videos`) return json(videos);
    if (path === `/api/content/categories/${otherCategory.id}/videos`) return json(otherVideos);
    if (path.startsWith("/api/content/videos/")) {
      const video = allVideos.find((item) => path.endsWith(`/${item.id}`));
      return video ? json(video) : json({ error: "not found" }, 404);
    }
    if (path === "/api/child/access-state") return json(access);
    if (path === "/api/device/status") return json({ authorized: true, device: { id: "device-a", name: "測試裝置" } });
    if (path === "/api/view-sessions" && request.method() === "POST") {
      return json({ id: crypto.randomUUID(), writeToken: "write-token", startedAt: new Date().toISOString() }, 201);
    }
    if (path.startsWith("/api/view-sessions/") && request.method() === "PATCH") return json({ ok: true });
    return json({ ok: true });
  });

  await page.goto(`/category/${category.id}?mode=video`);
  await page.locator(".video-card-main").first().click();
  await expect(page).toHaveURL(/\/watch\/series-a-1/);

  await page.getByLabel("播放速度").selectOption("0.8");
  await page.getByLabel("音量").fill("0.35");
  await expect(page.getByLabel("播放速度")).toHaveValue("0.8");
  await expect(page.getByLabel("音量")).toHaveValue("0.35");

  await page.locator(".player-back").click();
  await expect(page).toHaveURL(/\/category\/series-a/);
  await page.locator(".video-card-main").nth(1).click();

  await expect(page).toHaveURL(/\/watch\/series-a-2/);
  await expect(page.getByLabel("播放速度")).toHaveValue("0.8");
  await expect(page.getByLabel("音量")).toHaveValue("0.35");

  await page.goto(`/category/${otherCategory.id}?mode=video`);
  await page.locator(".video-card-main").click();
  await expect(page).toHaveURL(/\/watch\/series-b-1/);
  await expect(page.getByLabel("播放速度")).toHaveValue("1");
  await expect(page.getByLabel("音量")).toHaveValue("1");

  await page.getByLabel("播放速度").selectOption("0.6");
  await page.getByLabel("音量").fill("0.75");
  await page.goto(`/watch/${videos[0].id}?mode=video`);
  await expect(page.getByLabel("播放速度")).toHaveValue("0.8");
  await expect(page.getByLabel("音量")).toHaveValue("0.35");
});
