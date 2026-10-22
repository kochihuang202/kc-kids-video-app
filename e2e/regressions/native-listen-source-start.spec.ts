import { expect, test } from "@playwright/test";
import { finishMediaForTest, getMediaLoadCount, getMediaSourceRemovalCount, installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

for (const seriesType of ["leisure", "learning"] as const) {
  test(`REG-065 ${seriesType} listening requests the next source before delayed metadata while locked`, async ({ page }) => {
    await installDeterministicMedia(page, 0, {
      readyDelayMs: 700, deferPlayUntilReady: true,
    });
    await page.addInitScript(() => {
      let hidden = false;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
      (window as Window & { __setLocked?: (value: boolean) => void }).__setLocked = (value) => {
        hidden = value;
        document.dispatchEvent(new Event("visibilitychange"));
      };
      const calls: Array<{ source: string; type: string; hidden: boolean }> = [];
      (window as Window & { __sourceStartCalls?: typeof calls }).__sourceStartCalls = calls;
      const load = HTMLMediaElement.prototype.load;
      const play = HTMLMediaElement.prototype.play;
      const watched = new WeakSet<HTMLMediaElement>();
      HTMLMediaElement.prototype.load = function () {
        if (!watched.has(this)) {
          watched.add(this);
          // Observe metadata before React's native/bubble handler can issue
          // play(), otherwise the recorder itself reverses the event order.
          this.addEventListener("loadedmetadata", () => calls.push({ source: this.getAttribute("src") || "", type: "metadata", hidden }), true);
        }
        calls.push({ source: this.getAttribute("src") || "", type: "load", hidden });
        load.call(this);
      };
      HTMLMediaElement.prototype.play = function () {
        calls.push({ source: this.getAttribute("src") || "", type: "play", hidden });
        return play.call(this);
      };
    });
    const first = {
      id: TEST_VIDEO_ID, categoryId: "learning-e2e", categoryIds: ["learning-e2e"],
      youtubeTitle: "First listening episode", parentLabel: "第一集", sortOrder: 1,
      thumbnailUrl: "/local-media-placeholder.svg", durationSeconds: 120,
      lastPositionSeconds: 0, isWatched: false, isLearned: false, isSelectable: true,
      playbackStartSeconds: 0, playbackEndSeconds: null, listenRepeatCount: 1,
      seriesType, source: "self_hosted", mediaType: "video",
      mediaPath: "first.wav", mediaUrl: "/e2e-media/regression-media.wav?episode=first",
      youtubeVideoId: null, thumbnailPath: null,
    };
    const second = {
      ...first, id: "locked-next-audio", parentLabel: "第二集", sortOrder: 2,
      mediaPath: "second.wav", mediaUrl: "/e2e-media/regression-media.wav?episode=second",
    };
    await mockAuthorizedWatchApi(page, undefined, first);
    await page.route("**/api/content/categories/learning-e2e/videos", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([first, second]),
    }));
    await page.route("**/api/content/videos/locked-next-audio", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(second),
    }));
    const sessions: string[] = [];
    await page.route("**/api/view-sessions", async (route) => {
      const body = route.request().postDataJSON();
      sessions.push(body.videoId);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id: "session-e2e", writeToken: "write-token-e2e", startedAt: new Date().toISOString(),
      }) });
    });

    await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&fresh=1`);
    const audio = page.locator("audio.native-media-player");
    await page.locator(".main-play-btn").click();
    await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
    await audio.evaluate((element) => element.setAttribute("data-original-audio", "true"));
    const removalsBefore = await getMediaSourceRemovalCount(page);
    const loadsBefore = await getMediaLoadCount(page);
    await page.evaluate(() => (window as Window & { __setLocked?: (value: boolean) => void }).__setLocked?.(true));

    for (const episode of [second, first]) {
      await finishMediaForTest(page);
      await expect(page).toHaveURL(new RegExp(`/watch/${episode.id}\\?mode=listen&autoplay=1&fresh=1`));
      await expect(audio).toHaveAttribute("src", episode.mediaUrl);
      await expect.poll(() => audio.evaluate((element) => (element as HTMLMediaElement).currentTime)).toBeGreaterThan(0.3);
      await expect(audio).toHaveAttribute("data-original-audio", "true");
      await expect(page.getByLabel("純聽模式")).toBeVisible();
      await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
      const sourceCalls = await page.evaluate((source) => {
        const calls = (window as Window & { __sourceStartCalls?: Array<{ source: string; type: string; hidden: boolean }> }).__sourceStartCalls || [];
        return calls.filter((call) => call.source === source && call.hidden);
      }, episode.mediaUrl);
      // A real play request, not only the autoplay attribute or a route change,
      // must precede metadata. This guards the observed metadata-only wait;
      // it cannot prove physical iPad speaker output in a desktop browser.
      expect(sourceCalls.findIndex((call) => call.type === "play")).toBeGreaterThanOrEqual(0);
      expect(sourceCalls.findIndex((call) => call.type === "play")).toBeLessThan(sourceCalls.findIndex((call) => call.type === "metadata"));
    }
    expect(await getMediaSourceRemovalCount(page)).toBe(removalsBefore);
    expect(await getMediaLoadCount(page)).toBe(loadsBefore + 2);
    await expect.poll(() => sessions).toEqual([TEST_VIDEO_ID, second.id, TEST_VIDEO_ID]);
  });
}
