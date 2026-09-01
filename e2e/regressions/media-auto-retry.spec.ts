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
