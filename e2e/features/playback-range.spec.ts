import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test("configured playback range starts correctly, clamps seeking, and uses a relative child timeline", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, { playbackStartSeconds: 10, playbackEndSeconds: 70 });

  await page.goto(`/watch/${TEST_VIDEO_ID}`);
  const timeline = page.locator(".kid-scrubber-row");
  await expect(timeline.locator(".time-text").first()).toHaveText("00:00");
  await expect(timeline.locator(".time-text").last()).toHaveText("01:00");
  await expect(timeline.getByRole("slider")).toHaveAttribute("min", "10");
  await expect(timeline.getByRole("slider")).toHaveAttribute("max", "70");

  await page.goto(`/watch/${TEST_VIDEO_ID}?t=35&mode=listen`);
  await expect(timeline.locator(".time-text").first()).toHaveText("00:25");

  await page.goto(`/watch/${TEST_VIDEO_ID}?t=999&mode=listen`);
  await expect(timeline.locator(".time-text").first()).toHaveText("01:00");
});
