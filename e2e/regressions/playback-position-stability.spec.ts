import { expect, test } from "@playwright/test";
import {
  installDeterministicMedia,
  mockAuthorizedWatchApi,
  TEST_VIDEO_ID,
} from "../support/watch-page";

function parseClock(value: string) {
  const parts = value.trim().split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

test("REG-001 keeps playback moving across the 15-second access refresh", async ({ page }) => {
  let videoRequests = 0;
  await installDeterministicMedia(page, 0);
  await mockAuthorizedWatchApi(page, () => { videoRequests += 1; });

  await page.goto(`/watch/${TEST_VIDEO_ID}?t=36`);
  const controls = page.getByRole("region", { name: "影片播放控制" });
  await expect(controls.getByRole("button", { name: "播放" })).toBeVisible();
  const initialVideoRequests = videoRequests;
  expect(initialVideoRequests).toBeGreaterThanOrEqual(1);
  await controls.getByRole("button", { name: "播放" }).click();

  const elapsed = page.locator(".kid-scrubber-row .time-text").first();
  await expect.poll(async () => parseClock(await elapsed.innerText()), { timeout: 5_000 }).toBeGreaterThanOrEqual(37);
  const beforeRefresh = parseClock(await elapsed.innerText());

  await page.waitForTimeout(16_000);

  const afterRefresh = parseClock(await elapsed.innerText());
  expect(afterRefresh).toBeGreaterThanOrEqual(beforeRefresh + 14);
  expect(videoRequests).toBe(initialVideoRequests);

  await page.locator(".stage-click-capture").click();
});

test("REG-018 starts a normal video-list selection at the beginning", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await mockAuthorizedWatchApi(page);

  await page.goto(`/watch/${TEST_VIDEO_ID}`);
  const elapsed = page.locator(".kid-scrubber-row .time-text").first();
  await expect(elapsed).toHaveText("00:00");

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&t=36`);
  await expect(elapsed).toHaveText("00:36");
});
