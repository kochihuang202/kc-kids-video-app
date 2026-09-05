import { expect, test } from "@playwright/test";
import { finishMediaForTest, installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test("REG-016 keeps self-hosted video audio playing when iOS locks the screen", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    (window as typeof window & { __lockScreen(): void }).__lockScreen = () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    mediaUrl: "/e2e-media/regression-media.wav",
    seriesType: "learning",
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video`);

  await expect(page.locator("video.native-media-player")).toHaveCount(1);
  await expect(page.locator("audio.native-background-audio")).toHaveCount(1);
  await page.locator(".main-play-btn").click();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");

  const beforeLock = await page.locator("audio.native-background-audio").evaluate((audio: HTMLAudioElement) => audio.currentTime);
  await page.evaluate(() => (window as typeof window & { __lockScreen(): void }).__lockScreen());
  await page.waitForTimeout(300);
  const afterLock = await page.locator("audio.native-background-audio").evaluate((audio: HTMLAudioElement) => audio.currentTime);

  expect(afterLock).toBeGreaterThan(beforeLock);
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
});

test("REG-020 loops learning video inside the native iOS background audio session", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    (window as typeof window & { __lockScreen(): void }).__lockScreen = () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    mediaUrl: "/e2e-media/regression-media.wav",
    seriesType: "learning",
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video`);

  const audioPlayer = page.locator("audio.native-background-audio");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => audioPlayer.evaluate((el) => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.2);

  await page.evaluate(() => (window as typeof window & { __lockScreen(): void }).__lockScreen());
  await expect(audioPlayer).toHaveJSProperty("loop", true);

  await finishMediaForTest(page);

  await expect.poll(() => audioPlayer.evaluate((el) => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.5);
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
});
