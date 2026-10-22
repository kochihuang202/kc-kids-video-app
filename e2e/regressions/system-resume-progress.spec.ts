import { expect, test, type Page } from "@playwright/test";
import { getMediaLoadCount, installDeterministicMedia, invokeMediaSessionAction, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

async function setupFrozenResume(page: Page, recoverInForeground = true) {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await page.addInitScript(({ recover }) => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
    (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked = (locked) => {
      hidden = locked;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const frozen = new WeakSet<HTMLMediaElement>();
    const play = HTMLMediaElement.prototype.play;
    const pause = HTMLMediaElement.prototype.pause;
    const paused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused")!.get!;
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLMediaElement.prototype, "buffered", {
      configurable: true, get: () => ({ length: 1, start: () => 0, end: () => 120 }),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true, get() { return frozen.has(this) ? false : paused.call(this); },
    });
    HTMLMediaElement.prototype.play = function () {
      // Captured trace: play resolves and emits playing with a full buffer,
      // but currentTime stays frozen. Returning to the foreground alone does
      // not release it; a fresh pause/play in the foreground does.
      if (document.hidden || frozen.has(this)) {
        frozen.add(this);
        this.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      }
      return play.call(this);
    };
    HTMLMediaElement.prototype.pause = function () {
      const wasFrozen = frozen.has(this);
      if (recover && !document.hidden) frozen.delete(this);
      pause.call(this);
      if (wasFrozen) this.dispatchEvent(new Event("pause"));
    };
  }, { recover: recoverInForeground });
  await mockAuthorizedWatchApi(page, undefined, { mediaType: "video" });
  const events: Array<{ type: string; errorCode?: string; detail?: Record<string, unknown> }> = [];
  await page.route("**/api/diagnostics/**", async (route) => {
    const body = route.request().postDataJSON();
    if (Array.isArray(body.events)) events.push(...body.events);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "resume-diagnostic", ok: true }) });
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&fresh=1`);
  const player = page.locator("audio.native-media-player");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
  await player.evaluate((element) => element.setAttribute("data-original-session", "true"));
  const loadCount = await getMediaLoadCount(page);
  await page.evaluate(() => (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked?.(true));
  await invokeMediaSessionAction(page, "pause");
  const position = await player.evaluate((element) => (element as HTMLMediaElement).currentTime);
  await invokeMediaSessionAction(page, "play");
  return { player, position, loadCount, events };
}

test("REG-064 unlock recovers a frozen system resume once without clearing the source", async ({ page }) => {
  const { player, position, loadCount, events } = await setupFrozenResume(page);
  await page.waitForTimeout(1_400);
  expect(await player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeCloseTo(position, 2);
  await page.evaluate(() => (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked?.(false));

  await expect.poll(() => player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(position + 0.3);
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await expect(player).toHaveAttribute("data-original-session", "true");
  expect(await getMediaLoadCount(page)).toBe(loadCount);
  await expect.poll(() => events.some((event) => event.errorCode === "NATIVE_RESUME_STALLED")).toBe(true);
  await expect.poll(() => events.some((event) => event.type === "playback_confirmed"
    && typeof event.detail?.currentTime === "number" && event.detail.currentTime > position + 0.25)).toBe(true);
  expect(events.filter((event) => event.detail?.state === "foreground_resume_restart")).toHaveLength(1);
});

test("REG-064 explicit pause cancels the frozen-resume recovery before unlocking", async ({ page }) => {
  const { player, position, loadCount, events } = await setupFrozenResume(page);
  await page.waitForTimeout(1_400);
  await invokeMediaSessionAction(page, "pause");
  await page.evaluate(() => (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked?.(false));
  await page.waitForTimeout(1_600);

  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "播放");
  expect(await player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeCloseTo(position, 2);
  expect(await getMediaLoadCount(page)).toBe(loadCount);
  expect(events.filter((event) => event.detail?.state === "foreground_resume_restart")).toHaveLength(0);
});

test("REG-064 failed foreground recovery stops after one attempt and offers one-tap play", async ({ page }) => {
  const { player, position, loadCount, events } = await setupFrozenResume(page, false);
  await page.waitForTimeout(1_400);
  await page.evaluate(() => (window as Window & { __setLocked?: (locked: boolean) => void }).__setLocked?.(false));

  await expect(page.getByText("音訊尚未恢復，請點一下播放繼續。", { exact: true })).toBeVisible();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "播放");
  await page.waitForTimeout(1_600);
  expect(await player.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeCloseTo(position, 2);
  expect(await getMediaLoadCount(page)).toBe(loadCount);
  await expect.poll(() => events.some((event) => event.errorCode === "NATIVE_RESUME_REQUIRES_TAP")).toBe(true);
  expect(events.filter((event) => event.detail?.state === "foreground_resume_restart")).toHaveLength(1);
  expect(events.some((event) => event.type === "retry_started")).toBe(false);
});
