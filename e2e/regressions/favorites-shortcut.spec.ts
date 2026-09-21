import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1194, height: 834 } });

test("category header keeps the favorites shortcut visible and opens favorites", async ({ page }) => {
  const categories = [
    { id: "wowenglish", name: "WowEnglish", icon: "✨", tone: "sky", sortOrder: 1, dailyLimitSeconds: null, seriesType: "learning" },
    { id: "learning-favorites", name: "我最喜歡", icon: "❤️", tone: "sage", sortOrder: 2, dailyLimitSeconds: null, seriesType: "learning" },
  ];
  const lesson = {
    id: "wow-blue-002", categoryId: "wowenglish", categoryIds: ["wowenglish"],
    source: "self_hosted", youtubeVideoId: null, mediaType: "video", mediaPath: "/media/wow-blue-002.mp4",
    mediaUrl: "https://media.test/wow-blue-002.mp4", thumbnailPath: null, youtubeTitle: "Wow Blue 002",
    parentLabel: "002.Wow!Blue - Unit 1 song1", thumbnailUrl: "/local-media-placeholder.svg",
    durationSeconds: 72, sortOrder: 1, lastPositionSeconds: 0, isWatched: false,
    isLearned: false, learnedAt: null, isSelectable: true, seriesType: "learning",
  };

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/content/categories") return fulfill(categories);
    if (path === "/api/content/categories/wowenglish/videos") return fulfill([lesson]);
    if (path === "/api/content/categories/learning-favorites/videos") return fulfill([]);
    if (path === "/api/child/access-state") return fulfill(null);
    if (path === "/api/device/status") return fulfill({ authorized: true, device: { id: "device-1", name: "家庭電腦" } });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: `Unexpected ${path}` }) });
  });

  await page.goto("/category/wowenglish?mode=video");
  const favorites = page.getByRole("link", { name: "我最喜歡" });
  await expect(favorites).toBeVisible();
  await expect(favorites).toHaveAttribute("href", "/category/learning-favorites?mode=video");

  await favorites.click();
  await expect(page).toHaveURL(/\/category\/learning-favorites\?mode=video$/);
  await expect(page.getByRole("heading", { name: "我最喜歡", exact: true })).toBeVisible();
});
