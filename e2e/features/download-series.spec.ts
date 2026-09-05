import { expect, test } from "@playwright/test";
import { mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

function wav() {
  const buffer = Buffer.alloc(24044, 128);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(24036, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(8000, 28);
  buffer.writeUInt16LE(1, 32); buffer.writeUInt16LE(8, 34); buffer.write("data", 36); buffer.writeUInt32LE(24000, 40);
  return buffer;
}

test("downloads a series, resumes after failure, plays local audio without media traffic, and deletes it", async ({ page, context }) => {
  const category = { id: "learning-e2e", name: "下載測試", icon: "📚", seriesType: "leisure", sortOrder: 0, tone: "sage" };
  const videos = [TEST_VIDEO_ID, "download-second"].map((id, i) => ({
    id, categoryId: category.id, categoryIds: [category.id], source: "self_hosted", mediaType: "audio",
    mediaUrl: `/download-test/${i}.wav`, mediaPath: `/media/${i}.wav`, youtubeVideoId: null,
    parentLabel: `下載課程${i + 1}`, youtubeTitle: `下載課程${i + 1}`, thumbnailUrl: `/download-test/${i}.png`,
    thumbnailPath: null, seriesType: "leisure", isSelectable: true, sortOrder: i, durationSeconds: 3,
  }));
  await mockAuthorizedWatchApi(page, undefined, videos[0]);
  const offlineViewSyncs: Array<{ items: Array<{ videoId: string; playbackMode: string; seenAt: string }> }> = [];
  await page.route("**/api/offline-video-views/sync", async route => {
    offlineViewSyncs.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, synced: route.request().postDataJSON().items.length } });
  });
  await page.route("**/api/parent/session", route => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/content/categories**", route => route.fulfill({ json: route.request().url().endsWith("/videos") ? videos : [category] }));
  let failSecond = true;
  const requests = [0, 0];
  await page.route("**/download-test/*.wav", route => {
    const i = route.request().url().includes("0.wav") ? 0 : 1;
    requests[i]++;
    return failSecond && i === 1 ? route.fulfill({ status: 503 }) : route.fulfill({ contentType: "audio/wav", body: wav() });
  });
  await page.route("**/download-test/*.png", route => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  }));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`/category/${category.id}`);
  await expect(page.getByRole("button", { name: "下載／繼續下載整個系列" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "已下載", exact: true })).toHaveCount(0);
  await page.goto("/parent/downloads");
  await expect(page.getByRole("heading", { name: "離線下載", exact: true })).toBeVisible();
  await expect(page.getByText("Regression iPad", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下載整個系列" }).click();
  await expect(page.getByRole("status")).toContainText("下載失敗");
  expect(requests).toEqual([1, 1]);
  failSecond = false;
  await page.getByRole("button", { name: "繼續下載" }).click();
  await expect(page.getByRole("status")).toContainText("整個系列已下載完成");
  expect(requests).toEqual([1, 2]);
  await expect.poll(() => page.evaluate(async () => !!await caches.match("/download-test/0.png"))).toBe(true);
  await expect.poll(() => page.evaluate(async () => !!await caches.match("/download-test/1.png"))).toBe(true);
  await expect(page.getByText("2 / 2 部可離線播放", { exact: false })).toBeVisible();
  // iOS may report navigator.onLine=true while the Worker request never
  // settles (for example Wi-Fi without an Internet route). Cached metadata
  // must still open the already-downloaded file instead of hanging forever.
  const releaseRequests: Array<() => void> = [];
  const hangApi = async (route: import("@playwright/test").Route) => {
    await new Promise<void>(resolve => releaseRequests.push(resolve));
    await route.abort("timedout").catch(() => {});
  };
  await page.route("**/api/**", hangApi);
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);
  await expect(page.locator("audio.native-media-player")).toHaveAttribute("src", /^blob:/, { timeout: 6_000 });
  releaseRequests.splice(0).forEach(release => release());
  await page.unroute("**/api/**", hangApi);
  if (process.env.PLAYWRIGHT_TEST_OFFLINE_SHELL === "1") {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.waitForFunction(async () => {
      const script = document.querySelector<HTMLScriptElement>('script[type="module"]')?.src;
      if (!script) return false;
      const cached = await caches.match(script);
      return !!cached && (await cached.clone().blob()).size > 1000;
    });
  }
  await page.goto(`/category/${category.id}`);
  await page.getByRole("button", { name: "純聽", exact: true }).click();
  await context.setOffline(true);
  const offlineApi = (route: import("@playwright/test").Route) => route.abort("internetdisconnected");
  await page.route("**/api/**", offlineApi);
  if (process.env.PLAYWRIGHT_TEST_OFFLINE_SHELL === "1") {
    await page.reload();
    const offlineThumbnail = page.getByRole("img", { name: "下載課程1影片縮圖" });
    await expect(offlineThumbnail).toBeVisible();
    await expect.poll(() => offlineThumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole("link", { name: /下載課程1/ }).first().click();
  const audio = page.locator("audio.native-media-player");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await page.locator(".main-play-btn").click();
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(.2);
  await expect(page).toHaveURL(/watch\/download-second.*mode=listen/);
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(.2);
  expect(requests).toEqual([1, 2]);
  await context.setOffline(false);
  await page.unroute("**/api/**", offlineApi);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => offlineViewSyncs.flatMap(request => request.items)).toContainEqual(expect.objectContaining({
    videoId: "download-second",
    playbackMode: "listen",
  }));
  const syncedMarker = offlineViewSyncs.flatMap(request => request.items).find(item => item.videoId === "download-second");
  expect(syncedMarker).not.toHaveProperty("playedSeconds");
  expect(syncedMarker).not.toHaveProperty("lastPositionSeconds");
  // Simulate browser storage reclamation: the catalogue survives, the file does not.
  await page.evaluate(async id => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("kids-media-v1");
    await dir.removeEntry(`${encodeURIComponent(id)}.media`);
  }, TEST_VIDEO_ID);
  page.removeAllListeners("dialog");
  page.on("dialog", dialog => dialog.dismiss());
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);
  await expect(page.getByText("請家長到管理中心的「離線下載」重新下載影片。", { exact: true })).toBeVisible();
  expect(requests).toEqual([1, 2]);
  page.removeAllListeners("dialog");
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/parent/downloads");
  await page.getByRole("button", { name: "刪除" }).click();
  await expect(page.getByText("0 / 2 部可離線播放", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => !!await caches.match("/download-test/0.png"))).toBe(false);
  await expect.poll(() => page.evaluate(async () => !!await caches.match("/download-test/1.png"))).toBe(false);
});
