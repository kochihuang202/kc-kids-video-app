import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

function silentWav() {
  const sampleRate = 8_000;
  const dataSize = sampleRate;
  const wav = Buffer.alloc(44 + dataSize, 128);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(dataSize, 40);
  return wav;
}

test("REG-024 downloaded iPhone video uses one advancing local player", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
  });
  await installDeterministicMedia(page, 0, { abortNetwork: false, stallBlobAudio: true });

  const category = { id: "downloaded-video-e2e", name: "DeepEng", icon: "📘", seriesType: "learning", sortOrder: 0, tone: "sage" };
  const video = {
    id: TEST_VIDEO_ID,
    categoryId: category.id,
    categoryIds: [category.id],
    source: "self_hosted",
    mediaType: "video",
    mediaUrl: "/download-test/deepeng.mp4",
    mediaPath: "/media/deepeng.mp4",
    youtubeVideoId: null,
    parentLabel: "001_L2",
    youtubeTitle: "001_L2",
    thumbnailUrl: "/local-media-placeholder.svg",
    thumbnailPath: null,
    seriesType: "learning",
    isSelectable: true,
    sortOrder: 0,
    durationSeconds: 120,
  };
  await mockAuthorizedWatchApi(page, undefined, video);
  await page.route("**/api/parent/session", route => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/content/categories**", route => route.fulfill({
    json: route.request().url().endsWith("/videos") ? [video] : [category],
  }));
  await page.route("**/download-test/deepeng.mp4", route => route.fulfill({
    status: 200,
    contentType: "audio/wav",
    body: silentWav(),
  }));
  page.on("dialog", dialog => dialog.accept());

  await page.goto("/parent/downloads");
  await page.getByRole("button", { name: "下載整個系列" }).click();
  await expect(page.getByRole("status")).toContainText("整個系列已下載完成");
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video&offline=1`);

  await expect(page.locator("video.native-media-player")).toHaveCount(1);
  await expect(page.locator("audio.native-background-audio")).toHaveCount(0);
  await page.locator(".main-play-btn").click();
  await expect.poll(() => page.locator("video.native-media-player").evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(.2);
});
