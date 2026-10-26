import { expect, test, type Page } from "@playwright/test";
import { finishMediaForTest, installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

async function setup(page: Page, duration = 267.84, start = 266) {
  await installDeterministicMedia(page, 0, { abortNetwork: false });
  await page.addInitScript((seconds) => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => seconds });
    document.addEventListener("loadedmetadata", (event) => {
      if (event.target instanceof HTMLAudioElement) Object.assign(window, { __repeatMetadataReady: true });
    }, true);
  }, duration);
  const first = {
    id: TEST_VIDEO_ID, categoryId: "learning-e2e", categoryIds: ["learning-e2e"],
    youtubeTitle: "重播計數測試", parentLabel: "重播計數測試", source: "self_hosted", youtubeVideoId: null,
    mediaType: "audio", mediaPath: "repeat.wav", mediaUrl: "/e2e-media/regression-media.wav?first",
    thumbnailUrl: "/local-media-placeholder.svg", thumbnailPath: null, sortOrder: 1,
    durationSeconds: duration, seriesType: "learning", listenRepeatCount: 5, isSelectable: true,
    playbackStartSeconds: 0, playbackEndSeconds: null,
  };
  const next = { ...first, id: "repeat-counter-next", sortOrder: 2, parentLabel: "下一首", mediaUrl: "/e2e-media/regression-media.wav?next" };
  await mockAuthorizedWatchApi(page, undefined, first);
  await page.route("**/api/content/categories/learning-e2e/videos", (route) => route.fulfill({ json: [first, next] }));
  await page.route("**/api/content/videos/repeat-counter-next", (route) => route.fulfill({ json: next }));
  const events: Array<{ type: string; detail?: Record<string, unknown> }> = [];
  await page.route("**/api/diagnostics/**", async (route) => {
    const body = route.request().postDataJSON();
    if (Array.isArray(body.events)) events.push(...body.events);
    await route.fulfill({ json: { id: "repeat-counter-diagnostic", ok: true } });
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&at=${start}`);
  const audio = page.locator("audio.native-media-player");
  await expect(audio).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as Window & { __repeatMetadataReady?: boolean }).__repeatMetadataReady)).toBe(true);
  await page.locator(".main-play-btn").click();
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  return { audio, events };
}

async function timeUpdate(page: Page, positions: number[]) {
  for (const position of positions) {
    await page.locator("audio.native-media-player").evaluate((element: HTMLAudioElement, time) => {
      element.currentTime = time;
      element.dispatchEvent(new Event("timeupdate"));
    }, position);
  }
}

test("REG-070 a near-end resume only increments at real wraps and advances after the fifth play", async ({ page }) => {
  const probe = await setup(page);
  const cover = page.getByLabel("純聽模式");
  for (let play = 1; play <= 5; play++) {
    // Replay the phone's forward-moving tail samples. None is a repeat.
    await timeUpdate(page, [266.19, 266.44, 266.69, 267.6]);
    await expect(cover).toContainText(`第 ${play} / 5 次`);
    await expect(page).toHaveURL(new RegExp(`/watch/${TEST_VIDEO_ID}`));
    await finishMediaForTest(page);
    if (play < 5) {
      await expect(cover).toContainText(`第 ${play + 1} / 5 次`);
      // Duplicate boundary notifications and ordinary second-pass progress
      // must not turn one real wrap into multiple completed plays.
      await timeUpdate(page, [0, 0.1, 0.2]);
      await expect(cover).toContainText(`第 ${play + 1} / 5 次`);
    }
  }
  await expect(page).toHaveURL(/\/watch\/repeat-counter-next\?mode=listen&autoplay=1&fresh=1/);
  await expect(cover).toContainText("第 1 / 5 次");
  await expect.poll(() => page.locator("audio").evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.2);
  await page.locator(".player-back").click();
  await expect.poll(() => probe.events.filter((event) => event.detail?.state === "loop_boundary_accepted").length).toBe(4);
  const boundaries = probe.events.filter((event) => event.detail?.state === "loop_boundary_accepted");
  for (const boundary of boundaries) {
    expect(boundary.detail?.loopReason).toBe("end_to_start");
    expect(Number(boundary.detail?.previousTime)).toBeGreaterThan(Number(boundary.detail?.currentTime));
    expect(Number(boundary.detail?.currentTime)).toBeLessThanOrEqual(Number(boundary.detail?.loopStartLimit));
    expect(Number(boundary.detail?.previousTime)).toBeGreaterThanOrEqual(Number(boundary.detail?.loopEndThreshold));
  }
  expect(probe.events.filter((event) => event.detail?.state === "learning_listen_completion").map((event) => ({
    count: event.detail?.repeatCount, reason: event.detail?.loopReason,
  }))).toEqual([{ count: 5, reason: "media_ended" }]);
});

test("REG-070 short lessons have distinct beginning and ending windows", async ({ page }) => {
  await setup(page, 3, 0);
  await timeUpdate(page, [1.1, 1.25, 1.5, 1.75, 1.9]);
  await expect(page.getByLabel("純聽模式")).toContainText("第 1 / 5 次");
  await timeUpdate(page, [2.5, 2.8]);
  await finishMediaForTest(page);
  await expect(page.getByLabel("純聽模式")).toContainText("第 2 / 5 次");
  await timeUpdate(page, [0, 0.1, 0.2, 0.4]);
  await expect(page.getByLabel("純聽模式")).toContainText("第 2 / 5 次");
});

test("REG-070 seeking from the tail to the beginning does not complete a play", async ({ page }) => {
  await setup(page, 3, 0);
  await timeUpdate(page, [2.8]);
  await page.getByRole("button", { name: "倒退 10 秒", exact: true }).click();
  await page.locator("audio").dispatchEvent("timeupdate");
  await page.locator("audio").dispatchEvent("seeked");
  await expect(page.getByLabel("純聽模式")).toContainText("第 1 / 5 次");
  await timeUpdate(page, [0.5, 2.6, 2.8]);
  await finishMediaForTest(page);
  await expect(page.getByLabel("純聽模式")).toContainText("第 2 / 5 次");
});

test("REG-070 initial source seeking and loading a resume at the duration are not native loops", async ({ page }) => {
  await setup(page, 267.84, 268);
  await timeUpdate(page, [0, 0.1, 0.2]);
  await expect(page.getByLabel("純聽模式")).toContainText("第 1 / 5 次");
  await timeUpdate(page, [266.2, 267.6]);
  await finishMediaForTest(page);
  await expect(page.getByLabel("純聽模式")).toContainText("第 2 / 5 次");
});

test("REG-070 a natural wrap with a brief buffering event still completes exactly one play", async ({ page }) => {
  await setup(page, 267.84, 0);
  await timeUpdate(page, [266.2, 267.6]);
  await page.locator("audio").dispatchEvent("waiting");
  await finishMediaForTest(page);
  await page.locator("audio").dispatchEvent("playing");
  await expect(page.getByLabel("純聽模式")).toContainText("第 2 / 5 次");
  await timeUpdate(page, [0, 0.1, 0.3]);
  await expect(page.getByLabel("純聽模式")).toContainText("第 2 / 5 次");
});
