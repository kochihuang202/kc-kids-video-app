import { expect, test } from "@playwright/test";
import { getMediaLoadCount, installDeterministicMedia, invokeMediaSessionAction, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

test("REG-063 preserves buffered audio across lock-screen pause and resume", async ({ page }) => {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", {
      configurable: true, get: () => hidden ? "hidden" : "visible",
    });
    (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked = (locked) => {
      hidden = locked;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    // Replay the captured iPad failure: playback is healthy until a load()
    // discards its buffer while hidden. The new background play stays pending
    // even after metadata arrives. A plain resume of the loaded audio works.
    const load = HTMLMediaElement.prototype.load;
    const play = HTMLMediaElement.prototype.play;
    const stalledAfterReload = new WeakSet<HTMLMediaElement>();
    HTMLMediaElement.prototype.load = function () {
      if (document.hidden && this.getAttribute("src")) stalledAfterReload.add(this);
      load.call(this);
    };
    HTMLMediaElement.prototype.play = function () {
      if (stalledAfterReload.has(this)) {
        this.dispatchEvent(new Event("waiting"));
        return new Promise<void>(() => {});
      }
      return play.call(this);
    };
  });
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video", mediaUrl: "/e2e-media/regression-media.wav",
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&fresh=1`);
  const player = page.locator("audio.native-media-player");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
  await player.evaluate((element) => element.setAttribute("data-buffered-session", "original"));
  const source = await player.getAttribute("src");
  const loadsBeforeLock = await getMediaLoadCount(page);
  await page.evaluate(() => (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked?.(true));

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await invokeMediaSessionAction(page, "pause");
    await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "播放");
    const pausedAt = await player.evaluate((element) => (element as HTMLMediaElement).currentTime);
    await page.waitForTimeout(150);
    expect(await player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeCloseTo(pausedAt, 2);

    await invokeMediaSessionAction(page, "play");
    await expect.poll(() => player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(pausedAt + 0.3);
    await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
    expect(await getMediaLoadCount(page)).toBe(loadsBeforeLock);
    await expect(player).toHaveAttribute("src", source!);
    await expect(player).toHaveAttribute("data-buffered-session", "original");
  }

  // Unlocking after an explicit system pause must not start playback again.
  await invokeMediaSessionAction(page, "pause");
  const finalPosition = await player.evaluate((element) => (element as HTMLMediaElement).currentTime);
  await page.evaluate(() => (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked?.(false));
  await page.waitForTimeout(200);
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "播放");
  expect(await player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeCloseTo(finalPosition, 2);
  expect(await getMediaLoadCount(page)).toBe(loadsBeforeLock);
});
