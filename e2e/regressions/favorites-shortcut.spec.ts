import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1194, height: 834 } });

test("each learning video can be added to and removed from favorites with its heart button", async ({ page }) => {
  let favorite = false;
  const categories = [
    { id: "wowenglish", name: "WowEnglish", icon: "✨", tone: "sky", sortOrder: 1, dailyLimitSeconds: null, seriesType: "learning" },
    { id: "learning-favorites", name: "我最喜歡", icon: "❤️", tone: "sage", sortOrder: 2, dailyLimitSeconds: null, seriesType: "learning" },
  ];
  const lesson = () => ({
    id: "wow-blue-002", categoryId: "wowenglish", categoryIds: ["wowenglish"],
    source: "self_hosted", youtubeVideoId: null, mediaType: "video", mediaPath: "/media/wow-blue-002.mp4",
    mediaUrl: "https://media.test/wow-blue-002.mp4", thumbnailPath: null, youtubeTitle: "Wow Blue 002",
    parentLabel: "002.Wow!Blue - Unit 1 song1", thumbnailUrl: "/local-media-placeholder.svg",
    durationSeconds: 72, sortOrder: 1, lastPositionSeconds: 0, isWatched: false,
    isLearned: true, learnedAt: "2026-09-20T01:00:00.000Z", isSelectable: true, isFavorite: favorite, seriesType: "learning",
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/content/categories") return fulfill(categories);
    if (path === "/api/content/categories/wowenglish/videos") return fulfill([lesson()]);
    if (path === "/api/content/categories/learning-favorites/videos") return fulfill(favorite ? [lesson()] : []);
    if (path === "/api/child/access-state") return fulfill(null);
    if (path === "/api/device/status") return fulfill({ authorized: true, device: { id: "device-1", name: "家庭電腦" } });
    if (path === "/api/child/videos/wow-blue-002/favorite" && request.method() === "PUT") {
      favorite = (await request.postDataJSON()).favorite;
      return fulfill({ ok: true, videoId: "wow-blue-002", isFavorite: favorite });
    }
    return fulfill({ error: `Unexpected ${request.method()} ${path}` }, 404);
  });

  await page.goto("/category/wowenglish?mode=video");
  const addHeart = page.getByRole("button", { name: "加入我最喜歡：002.Wow!Blue - Unit 1 song1" });
  await expect(addHeart).toBeVisible();
  await addHeart.click();
  await expect(page.getByRole("button", { name: "移出我最喜歡：002.Wow!Blue - Unit 1 song1" })).toBeVisible();

  await page.goto("/category/learning-favorites?mode=video");
  await expect(page.getByRole("region", { name: "今天的學習開始囉，好好動動大腦吧!!" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "已學會" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消學會" })).toHaveCount(0);
  await expect(page.locator(".learned-status-badge")).toHaveCount(0);
  const removeHeart = page.getByRole("button", { name: "移出我最喜歡：002.Wow!Blue - Unit 1 song1" });
  await expect(removeHeart).toBeVisible();
  await removeHeart.click();
  await expect(page.locator(".video-card")).toHaveCount(0);
});
