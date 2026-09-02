import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 834, height: 1194 } });

test("local-video placeholder uses the current category name", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/content/categories") return fulfill([
      { id: "deepeng", name: "DeepEng", icon: "📘", tone: "sky", sortOrder: 1, dailyLimitSeconds: null, seriesType: "learning" },
    ]);
    if (path === "/api/content/categories/deepeng/videos") return fulfill([
      {
        id: "deepeng-001", categoryId: "deepeng", categoryIds: ["deepeng"], source: "self_hosted",
        youtubeVideoId: null, mediaType: "video", mediaPath: "/media/07_DeepEng/001_L2.mp4",
        mediaUrl: "https://media.test/media/07_DeepEng/001_L2.mp4", thumbnailPath: null,
        youtubeTitle: "001_L2", parentLabel: "001_L2", thumbnailUrl: "/local-media-placeholder.svg",
        durationSeconds: null, sortOrder: 1, lastPositionSeconds: 0, isWatched: false,
        isLearned: false, learnedAt: null, isSelectable: true, seriesType: "learning",
      },
    ]);
    if (path === "/api/child/access-state") return fulfill({
      state: "AVAILABLE", remainingSeconds: 900, todayPlayedSeconds: 0, dailyLimitSeconds: 1800,
      bonusSeconds: 0, earnedBonusSeconds: 0, learningSeconds: 0, leisureUsedSeconds: 0,
      listenSeconds: 0, gracePeriodSeconds: 0, nextAllowedAt: null, isPaused: false,
      serverTimeTaipei: "12:00", todayDate: "2026-09-02", message: "", categoryStates: [],
    });
    if (path === "/api/device/status") return fulfill({ authorized: true, device: { id: "e2e-device", name: "iPad" } });
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/category/deepeng");
  const thumbnail = page.locator(".video-thumb-container").first();
  await expect(thumbnail.getByText("DeepEng", { exact: true })).toBeVisible();
  await expect(thumbnail).not.toContainText("泉靈的語文課");
});
