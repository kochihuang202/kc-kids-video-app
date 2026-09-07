import { expect, test } from "@playwright/test";

test("parent selects a category before thumbnails load and sees configured range badges", async ({ page }) => {
  let videoListRequests = 0;
  let savedRange: Record<string, unknown> | null = null;
  await page.route("**/api/parent/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/parent/session") return json({ authenticated: true });
    if (url.pathname === "/api/parent/categories") return json([{
      id: "science", name: "科學", icon: "🚀", tone: "sky", sortOrder: 1, seriesType: "learning",
      videoCount: 259, isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01", archivedAt: null,
    }]);
    if (url.pathname === "/api/parent/today/picks") return json([]);
    if (url.pathname === "/api/parent/videos" && request.method() === "GET") {
      videoListRequests += 1;
      expect(url.searchParams.get("category_id")).toBe("science");
      return json([{
        id: "science-one", source: "self_hosted", youtubeVideoId: null, youtubeUrl: null,
        youtubeTitle: "科學第一集", parentLabel: "科學第一集", thumbnailUrl: "/local-media-placeholder.svg",
        mediaType: "video", mediaPath: "science-one.mp4", mediaUrl: null, thumbnailPath: null,
        durationSeconds: 120, playbackStartSeconds: 0, playbackEndSeconds: null,
        availabilityStatus: "available", healthStatus: "healthy", metadataError: null,
        isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01", archivedAt: null,
        categoryIds: ["science"], categorySortOrders: { science: 1 },
      }]);
    }
    if (url.pathname === "/api/parent/videos/science-one" && request.method() === "PATCH") {
      savedRange = request.postDataJSON();
      return json({ ok: true });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: url.pathname }) });
  });

  await page.goto("/parent/videos");
  await expect(page.getByRole("heading", { name: "影片分類" })).toBeVisible();
  await expect(page.getByText("259 部影片")).toBeVisible();
  expect(videoListRequests).toBe(0);

  await page.getByRole("button", { name: /科學/ }).click();
  await expect(page.getByRole("button", { name: "設定 科學第一集 的播放區間" })).toBeVisible();
  expect(videoListRequests).toBe(1);
  await expect(page.getByText("完整影片", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "設定 科學第一集 的播放區間" }).click();
  const dialog = page.getByRole("dialog", { name: "科學第一集" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("開始時間").fill("00:05");
  await dialog.getByLabel("開始時間").blur();
  await dialog.getByLabel("結束時間").fill("00:25");
  await dialog.getByLabel("結束時間").blur();
  await dialog.getByRole("button", { name: /儲存$/ }).click();
  expect(savedRange).toMatchObject({ playbackStartSeconds: 5, playbackEndSeconds: 25 });
  await expect(page.getByText("✂ 已設定")).toBeVisible();
  await expect(page.getByText("00:05－00:25")).toBeVisible();
});
