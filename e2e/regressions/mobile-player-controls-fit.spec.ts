import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test("REG-013 keeps pure-listening controls inside a phone portrait viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    seriesType: "leisure",
    durationSeconds: 530,
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);
  await expect(page.getByLabel("純聽模式")).toBeVisible();

  const selectors = [
    ".kid-scrubber-row",
    ".player-left-group",
    ".playback-buttons",
    ".volume-control",
  ];
  for (const selector of selectors) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} should be visible`).not.toBeNull();
    expect(box!.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${selector} right edge`).toBeLessThanOrEqual(390);
  }

  const [left, playback] = await Promise.all([
    page.locator(".player-left-group").boundingBox(),
    page.locator(".playback-buttons").boundingBox(),
  ]);
  expect(left!.y).toBeGreaterThanOrEqual(playback!.y + playback!.height);
});
