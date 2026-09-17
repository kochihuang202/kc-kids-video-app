import { expect, test } from "@playwright/test";
import { installDeterministicMedia, TEST_MEDIA_URL } from "../support/watch-page";

const categoryId = "learning-next-lock";

function lesson(index: number, selectable: boolean) {
  return {
    id: `learning-${index}`,
    categoryId,
    categoryIds: [categoryId],
    source: "self_hosted",
    youtubeVideoId: null,
    mediaType: "video",
    mediaPath: `learning-${index}.mp4`,
    mediaUrl: TEST_MEDIA_URL,
    thumbnailPath: null,
    thumbnailUrl: "/local-media-placeholder.svg",
    youtubeTitle: `學習第 ${index} 集`,
    parentLabel: `學習第 ${index} 集`,
    durationSeconds: 120,
    playbackStartSeconds: 0,
    playbackEndSeconds: null,
    sortOrder: index,
    lastPositionSeconds: 0,
    isWatched: false,
    isLearned: false,
    learnedAt: null,
    isSelectable: selectable,
    seriesType: "learning",
  };
}

test("the fifth learning lesson never sends the child into the locked sixth lesson", async ({ page }) => {
  let sixthSelectable = false;
  const videos = () => Array.from({ length: 6 }, (_, index) => lesson(index + 1, index < 5 || sixthSelectable));
  await installDeterministicMedia(page, 0, { abortNetwork: false });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (path === "/api/device/status") return json({ authorized: true, device: { id: "learning-device", name: "孩子的 iPad" } });
    if (path === "/api/child/access-state") return json({
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
      serverTimeTaipei: "2026-09-17T12:00:00+08:00",
      todayDate: "2026-09-17",
      message: "",
      categoryStates: [],
    });
    if (path === `/api/content/categories/${categoryId}/videos`) return json(videos());
    if (path === "/api/content/videos/learning-5") return json(videos()[4]);
    if (path === "/api/content/videos/learning-6") return sixthSelectable
      ? json(videos()[5])
      : json({ error: "請先從前五部學習影片中選擇。", code: "LEARNING_VIDEO_LOCKED" }, 403);
    return json({ error: `Unexpected request: ${request.method()} ${path}` }, 404);
  });

  await page.goto("/watch/learning-5?mode=video&fresh=1");
  await expect(page.getByRole("button", { name: "播放" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "下一集" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/watch\/learning-5/);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("kid_playback_queue_v1") || "null")?.videoIds || []))
    .not.toContain("learning-6");

  await page.goto("/watch/learning-6?mode=video&fresh=1");
  await expect(page.getByRole("alert")).toContainText("請先從前五部學習影片中選擇");
  await expect(page.getByRole("button", { name: "再試一次" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "回上一頁" })).toBeVisible();
  await expect(page.getByRole("link", { name: "孩子首頁" })).toBeVisible();

  sixthSelectable = true;
  await page.goto("/watch/learning-5?mode=video&fresh=1");
  await expect(page.getByRole("button", { name: "下一集" })).toBeVisible();
});
