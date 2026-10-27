import { expect, test, type Page } from "@playwright/test";
import { mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

const category = { id: "learning-e2e", name: "下載清單測試", icon: "📚", seriesType: "leisure", sortOrder: 0, tone: "sage" };
function wav() {
  const bytes = Buffer.alloc(24044, 128);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(24036, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28);
  bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write("data", 36); bytes.writeUInt32LE(24000, 40);
  return bytes;
}

async function setup(page: Page) {
  const videos = [TEST_VIDEO_ID, "quota-second"].map((id, index) => ({
    id, categoryId: category.id, categoryIds: [category.id], source: "self_hosted", mediaType: "audio",
    mediaUrl: `/quota-test/${index}.wav`, youtubeVideoId: null, parentLabel: `課程${index + 1}`,
    youtubeTitle: `課程${index + 1}`, thumbnailUrl: "/local-media-placeholder.svg", seriesType: "leisure",
    isSelectable: true, sortOrder: index, durationSeconds: 3,
  }));
  await mockAuthorizedWatchApi(page, undefined, videos[0]);
  await page.route("**/api/parent/session", route => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/parent/categories", route => route.fulfill({ json: [category] }));
  await page.route("**/api/content/categories**", route => route.fulfill({ json: route.request().url().endsWith("/videos") ? videos : [category] }));
  let mediaRequests = 0;
  await page.route("**/quota-test/*.wav", route => {
    mediaRequests++;
    return route.fulfill({ contentType: "audio/wav", body: wav() });
  });
  const diagnostics: Array<{ detail?: Record<string, unknown>; errorCode?: string }> = [];
  await page.route("**/api/diagnostics/sessions**", route => {
    if (route.request().url().endsWith("/events")) diagnostics.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { id: "quota-diagnostic", ok: true } });
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/parent/downloads");
  await page.getByRole("button", { name: "下載整個系列" }).click();
  await expect(page.getByRole("status")).toContainText("整個系列已下載完成");
  await expect(page.getByText("2 / 2 部可離線播放", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "影片管理", exact: true }).click();
  await expect(page).toHaveURL(/parent\/videos/);
  return { videos, diagnostics, mediaRequests: () => mediaRequests };
}

test("REG-071 opens the downloads tab under real localStorage pressure and keeps downloaded files playable", async ({ page, context }) => {
  const state = await setup(page);
  state.videos[0].youtubeTitle = "更新後的影片資訊".repeat(2000);
  const seeded = await page.evaluate(() => {
    localStorage.setItem("kid_series_player_preferences_v1", '{"learning-e2e":{"volume":0.4,"playbackRate":0.8}}');
    localStorage.setItem("kids-offline-video-views-v1", '[{"videoId":"keep-me","playbackMode":"listen","seenAt":"2026-10-27T00:00:00.000Z"}]');
    const pressureKey = "kids-offline-metadata:/api/content/videos/old-online-cache";
    let low = 0; let high = 6_000_000;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      try { localStorage.setItem(pressureKey, "x".repeat(mid)); low = mid; }
      catch (error) { if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") throw error; high = mid - 1; }
    }
    return { padding: low, catalogue: localStorage.getItem("kids-downloads-v1") };
  });
  expect(seeded.padding).toBeGreaterThan(1_000_000);
  await page.getByRole("link", { name: "離線下載", exact: true }).click();
  await expect(page.getByText("2 / 2 部可離線播放", { exact: false })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.mediaRequests()).toBe(2);
  const saved = await page.evaluate(() => ({
    settings: localStorage.getItem("kid_series_player_preferences_v1"),
    views: localStorage.getItem("kids-offline-video-views-v1"),
    catalogue: JSON.parse(localStorage.getItem("kids-downloads-v1") || "[]"),
  }));
  expect(saved.settings).toContain('"volume":0.4');
  expect(saved.views).toContain("keep-me");
  expect(saved.catalogue[0].videos[0].youtubeTitle).toBe(state.videos[0].youtubeTitle);
  expect(saved.catalogue[0].completed).toEqual(JSON.parse(seeded.catalogue!)[0].completed);
  // Real offline file opening after redundant API snapshots have been reclaimed.
  await page.getByRole("link", { name: "孩子首頁", exact: true }).click();
  const categoryLink = page.getByRole("link", { name: new RegExp(category.name) });
  await expect(categoryLink).toBeVisible();
  await context.setOffline(true);
  await page.route("**/api/**", route => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "純聽", exact: true }).click();
  await categoryLink.click();
  await page.getByRole("link", { name: /課程1/ }).first().click();
  const audio = page.locator("audio.native-media-player");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await page.locator(".main-play-btn").click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.2);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume)).toBe(0.4);
  expect(state.mediaRequests()).toBe(2);
});

test("REG-071 a persistent catalogue quota error still leaves the saved series manageable and reports the exact stage", async ({ page }) => {
  const state = await setup(page);
  state.videos[0].youtubeTitle += "（已更新）";
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === "kids-downloads-v1" && value !== "[]") {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("link", { name: "離線下載", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("下載清單");
  await expect(page.getByRole("alert")).not.toContainText("The quota");
  await expect(page.getByText("2 / 2 部可離線播放", { exact: false })).toBeVisible();
  await expect.poll(() => state.diagnostics.some(event => event.errorCode === "DOWNLOAD_CATALOGUE_QUOTA"
    && event.detail?.errorOperation === "catalogue_refresh" && typeof event.detail?.localStorageBytes === "number")).toBe(true);
  expect(state.mediaRequests()).toBe(2);
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  await expect(page.getByText("0 / 2 部可離線播放", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kids-downloads-v1"))).toBe("[]");
});
