import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 834, height: 1194 } });

test("groups learning and leisure and unlocks the next lesson after marking one learned", async ({ page }) => {
  let firstLearned = false;
  const categories = [
    { id: "science", name: "科學", icon: "🚀", tone: "sky", sortOrder: 1, dailyLimitSeconds: null, seriesType: "learning" },
    { id: "cartoons", name: "卡通", icon: "🎈", tone: "apricot", sortOrder: 2, dailyLimitSeconds: null, seriesType: "leisure" },
  ];
  const access = {
    state: "AVAILABLE", remainingSeconds: 900, todayPlayedSeconds: 340, dailyLimitSeconds: 2400,
    bonusSeconds: 0, baseLimitSeconds: 2400, earnedBonusSeconds: 120, learningSeconds: 240,
    leisureUsedSeconds: 100, listenSeconds: 0, gracePeriodSeconds: 0, nextAllowedAt: null,
    isPaused: false, serverTimeTaipei: "12:00", todayDate: "2026-09-02", message: "今天還有約 15 分鐘休閒時間",
    categoryStates: [],
  };
  const videos = () => {
    const original = Array.from({ length: 6 }, (_, index) => ({
      id: `science-${index + 1}`,
      categoryId: "science",
      categoryIds: ["science"],
      source: "youtube",
      youtubeVideoId: `youtube-${index + 1}`,
      mediaType: null,
      mediaPath: null,
      mediaUrl: null,
      thumbnailPath: null,
      youtubeTitle: `科學原標題 ${index + 1}`,
      parentLabel: `科學 ${index + 1}`,
      thumbnailUrl: "/local-media-placeholder.svg",
      durationSeconds: 600,
      sortOrder: index + 1,
      lastPositionSeconds: 0,
      isWatched: false,
      isLearned: firstLearned && index === 0,
      learnedAt: firstLearned && index === 0 ? "2026-09-02T00:30:00.000Z" : null,
      isSelectable: index < 5,
      seriesType: "learning",
    }));
    if (!firstLearned) return original;
    return [
      ...original.slice(1).map((video) => ({ ...video, isSelectable: true })),
      { ...original[0], isSelectable: true },
    ];
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/content/categories") return fulfill(categories);
    if (path === "/api/content/categories/science/videos") return fulfill(videos());
    if (path === "/api/child/access-state") return fulfill(access);
    if (path === "/api/child/today-picks") return fulfill([]);
    if (path === "/api/content/resume") return fulfill({ resume: null });
    if (path === "/api/content/recents") return fulfill([]);
    if (path === "/api/device/status") return fulfill({ authorized: true, device: { id: "e2e-device", name: "iPad" } });
    if (path === "/api/child/videos/science-1/learned" && request.method() === "PUT") {
      firstLearned = true;
      return fulfill({ ok: true, videoId: "science-1", isLearned: true });
    }
    return fulfill({ error: `Unexpected request: ${request.method()} ${path}` }, 404);
  });

  await page.goto("/");
  await expect(page.getByRole("region", { name: "📚 學習系列" })).toContainText("科學");
  await expect(page.getByRole("region", { name: "🎈 休閒系列" })).toContainText("卡通");
  await expect(page.getByRole("region", { name: "今日休閒時間" })).toContainText("15 分鐘");

  await page.getByRole("link", { name: /科學/ }).click();
  await expect(page.getByText("🔒 先從前五部選擇")).toBeVisible();
  await page.locator(".video-card").first().getByRole("button", { name: "標記學會了" }).click();

  await expect(page.locator(".video-card h2").first()).toHaveText("科學 2");
  await expect(page.locator(".video-card h2").last()).toHaveText("科學 1");
  const learnedGroup = page.getByRole("region", { name: "已學會" });
  await expect(learnedGroup).toBeVisible();
  await expect(learnedGroup).toContainText("2026/09/02 08:30 學會");
  await expect(page.getByText("🔒 先從前五部選擇")).toBeHidden();
  await expect(page.getByRole("link", { name: /科學 6/ })).toBeVisible();
});
