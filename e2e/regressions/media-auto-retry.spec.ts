import { expect, test } from "@playwright/test";
import {
  getMediaLoadCount,
  installDeterministicMedia,
  mockAuthorizedWatchApi,
  TEST_VIDEO_ID,
} from "../support/watch-page";

test("REG-002 automatically recovers from transient local-media connection failures", async ({ page }) => {
  await installDeterministicMedia(page, 2);
  await mockAuthorizedWatchApi(page);

  await page.goto(`/watch/${TEST_VIDEO_ID}`);
  await expect(page.getByText(/正在重新連線，最多再試 \d+ 秒/)).toBeVisible();
  await expect.poll(() => getMediaLoadCount(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".stage-big-play")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(/正在重新連線/)).toBeHidden();
});

test("REG-021 does not treat play-before-ready as a connection failure", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
  });
  await installDeterministicMedia(page, 0, {
    abortNetwork: false,
    readyDelayMs: 1_500,
    deferPlayUntilReady: true,
  });
  await mockAuthorizedWatchApi(page, undefined, { mediaType: "video" });

  await page.goto(`/watch/${TEST_VIDEO_ID}`);
  await expect(page.locator("audio.native-background-audio")).toHaveCount(1);
  const initialLoads = await getMediaLoadCount(page);
  await page.locator(".main-play-btn").click();
  await page.locator(".main-play-btn").click();
  await page.waitForTimeout(2_200);

  await expect(page.getByText(/正在重新連線/)).toBeHidden();
  await expect.poll(() => getMediaLoadCount(page)).toBe(initialLoads);
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await expect.poll(() => page.locator("audio.native-background-audio").evaluate(
    (element) => (element as HTMLMediaElement).currentTime,
  )).toBeGreaterThan(0.2);
});
