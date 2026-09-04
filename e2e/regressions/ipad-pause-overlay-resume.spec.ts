import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });

test("REG-017 resumes a paused video by tapping anywhere on the reminder", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    mediaUrl: "/e2e-media/regression-media.wav",
    source: "self_hosted",
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}`);

  await page.getByRole("button", { name: "前進 10 秒" }).tap();
  await page.locator(".poster-overlay").tap();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await page.locator(".stage-click-capture").tap();
  await expect(page.getByRole("region", { name: "暫停思考提示" })).toBeVisible();

  await page.locator(".pause-question-btn").first().tap();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await expect(page.getByRole("region", { name: "暫停思考提示" })).toBeHidden();
});
