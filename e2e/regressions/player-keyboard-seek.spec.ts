import { expect, test } from "@playwright/test";
import {
  installDeterministicMedia,
  mockAuthorizedWatchApi,
  TEST_VIDEO_ID,
} from "../support/watch-page";

test("REG-008 uses the Mac left and right arrow keys to seek exactly 10 seconds", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page);

  await page.goto(`/watch/${TEST_VIDEO_ID}?t=36`);
  const controls = page.getByRole("region", { name: "影片播放控制" });
  const elapsed = controls.locator(".time-text").first();

  await expect(elapsed).toHaveText("00:36");

  await page.keyboard.press("ArrowRight");
  await expect(elapsed).toHaveText("00:46");
  expect(await page.locator("audio").evaluate((element) => (element as HTMLAudioElement).currentTime)).toBe(46);

  await page.keyboard.press("ArrowLeft");
  await expect(elapsed).toHaveText("00:36");

  await controls.getByRole("slider", { name: "音量" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(elapsed).toHaveText("00:36");
});
