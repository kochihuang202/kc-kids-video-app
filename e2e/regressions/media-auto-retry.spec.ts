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

test("metadata followed by repeated failure keeps one player and stops after a single 60-second budget", async ({ page }) => {
  await page.clock.install();
  await installDeterministicMedia(page, 0, { errorAfterMetadata: true });
  await mockAuthorizedWatchApi(page);
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);
  const player = page.locator("audio.native-media-player");
  await expect(page.getByText(/正在重新連線/)).toBeVisible();
  await player.evaluate((element) => element.setAttribute("data-retry-player", "original"));
  const initialLoads = await getMediaLoadCount(page);
  await page.clock.runFor(5_000);

  expect((await getMediaLoadCount(page)) - initialLoads).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-retry-player="original"]')).toHaveCount(1);
  await page.clock.runFor(56_000);
  await expect(page.getByText(/正在重新連線/)).toBeHidden();
  await expect(page.getByRole("button", { name: "再試一次", exact: true })).toBeVisible();
  const stoppedLoads = await getMediaLoadCount(page);
  await page.clock.runFor(12_000);
  expect(await getMediaLoadCount(page)).toBe(stoppedLoads);

  await page.getByRole("button", { name: "再試一次", exact: true }).click();
  await expect(page.getByText(/正在重新連線/)).toBeVisible();
  expect(await getMediaLoadCount(page)).toBeGreaterThan(stoppedLoads);
});

test("a denied play request preserves the original error without starting network retries", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false, playFailureName: "NotAllowedError" });
  await mockAuthorizedWatchApi(page);
  const events: Array<{ type: string; errorCode?: string; detail?: Record<string, unknown> }> = [];
  await page.route("**/api/diagnostics/**", async (route) => {
    const body = route.request().postDataJSON();
    if (Array.isArray(body.events)) events.push(...body.events);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "blocked-diagnostic", ok: true }) });
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen`);
  await page.locator(".main-play-btn").click();
  await expect.poll(() => events.some((event) => event.errorCode === "PLAY_NOT_ALLOWED")).toBe(true);
  expect(events.some((event) => event.type === "retry_started")).toBe(false);
  expect(events.find((event) => event.errorCode === "PLAY_NOT_ALLOWED")?.detail).toMatchObject({
    errorName: "NotAllowedError", errorOperation: "play", sourceKind: "remote", documentHidden: false,
  });
  await expect(page.getByText(/正在重新連線/)).toBeHidden();
  await expect(page.getByText(/Mac 與 Tailscale/)).toBeHidden();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "播放");
});
