import { expect, test, type Page } from "@playwright/test";
import { mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

// Exercise the actual script request and onReady boundary, not an already-ready YT mock.
const apiScript = `
window.__ytInit ||= { created: 0, destroyed: 0, instances: [] };
class FakePlayer {
  constructor(host, options) {
    this.options = options; this.time = options.playerVars.start; this.state = 5;
    this.volume = 100; this.rate = 1; this.dead = false;
    window.__ytInit.created++; window.__ytInit.instances.push(this);
    this.frame = document.createElement('iframe'); this.frame.title = 'YouTube test player';
    host.replaceWith(this.frame);
    if (!(window.__stallFirstPlayer && window.__ytInit.created === 1))
      setTimeout(() => { if (!this.dead) options.events.onReady({ target: this }); }, 0);
  }
  destroy() { if (this.dead) return; this.dead = true; clearInterval(this.timer); this.frame.remove(); window.__ytInit.destroyed++; }
  getCurrentTime() { return this.time; } getDuration() { return 120; }
  getPlayerState() { return this.state; } getVideoData() { return { video_id: this.options.videoId }; }
  setVolume(v) { this.volume = v; } getVolume() { return this.volume; }
  mute() { this.muted = true; } unMute() { this.muted = false; } isMuted() { return !!this.muted; }
  setPlaybackRate(r) { this.rate = r; } seekTo(t) { this.time = t; }
  pauseVideo() { clearInterval(this.timer); this.state = 2; this.options.events.onStateChange({ target: this, data: 2 }); }
  playVideo() {
    clearInterval(this.timer); this.state = 1;
    this.options.events.onStateChange({ target: this, data: 1 });
    this.timer = setInterval(() => { this.time += 0.1 * this.rate; }, 100);
  }
  cueVideoById(id, t = 0) { this.options.videoId = id; this.time = t; }
  loadVideoById(id, t = 0) { this.cueVideoById(id, t); this.playVideo(); }
}
window.YT = { Player: FakePlayer };
window.onYouTubeIframeAPIReady?.();
`;

type PlayerProbe = { time: number; volume: number; rate: number; state: number; options: { events: { onReady(event: { target: unknown }): void; onError(event: { target: unknown; data: number }): void } } };
type ProbeWindow = Window & { __ytInit: { created: number; destroyed: number; instances: PlayerProbe[] } };

async function setup(page: Page, failure: "error" | "timeout" | "iframe" = "error") {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("kid_series_player_preferences_v1", JSON.stringify({
    "learning-e2e": { volume: 0.35, playbackRate: 0.8 },
  })));
  await mockAuthorizedWatchApi(page, undefined, {
    source: "youtube", youtubeVideoId: "youtube-one", mediaType: null, mediaUrl: null,
  });
  let requests = 0;
  let failing = true;
  let documents = 0;
  const events: Array<{ type: string; errorCode?: string; detail?: Record<string, unknown> }> = [];
  page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
  await page.route("https://www.youtube.com/iframe_api", async (route) => {
    requests++;
    if (failing && failure === "error") return route.abort("failed");
    await route.fulfill({ contentType: "application/javascript", body: failing && failure === "timeout" ? "/* API callback never arrives */" : apiScript });
  });
  if (failure === "iframe") await page.addInitScript(() => { Object.assign(window, { __stallFirstPlayer: true }); });
  await page.route("**/api/diagnostics/**", async (route) => {
    const body = route.request().postDataJSON();
    if (Array.isArray(body.events)) events.push(...body.events);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "yt-init-diagnostic", ok: true }) });
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video&at=37`, { waitUntil: "domcontentloaded" });
  return { requests: () => requests, documents: () => documents, recover: () => { failing = false; }, events };
}

async function verifyPlayback(page: Page) {
  await expect(page.locator(".main-play-btn")).toBeEnabled();
  await page.locator(".main-play-btn").click();
  await page.clock.runFor(1_500);
  await expect.poll(() => page.evaluate(() => {
    const state = (window as ProbeWindow).__ytInit;
    const player = state.instances.at(-1)!;
    return { playing: player.state === 1, advanced: player.time > 37.25, volume: player.volume, rate: player.rate };
  })).toEqual({ playing: true, advanced: true, volume: 35, rate: 0.8 });
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
}

test("REG-068 recovers a failed API load without reopening the page and keeps position/preferences", async ({ page }) => {
  const probe = await setup(page);
  await expect(page.getByTestId("youtube-initialization")).toContainText("重新連線");
  await expect(page.locator(".main-play-btn")).toBeDisabled();
  probe.recover();
  await page.evaluate(() => { for (let n = 0; n < 5; n++) window.dispatchEvent(new Event("online")); });
  await page.clock.runFor(4_500);
  await expect(page.getByTestId("youtube-initialization")).toHaveCount(0);
  await verifyPlayback(page);
  expect(probe.requests()).toBe(2);
  expect(probe.documents()).toBe(1);
  await expect.poll(() => probe.events.some((event) => event.errorCode === "YT_API_LOAD_FAILED")).toBe(true);
  const frame = page.locator("iframe[title='YouTube test player']");
  await frame.evaluate((element) => element.setAttribute("data-original", "yes"));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.clock.runFor(61_000);
  expect(probe.requests()).toBe(2);
  await expect(frame).toHaveAttribute("data-original", "yes");
});

test("REG-068 retries when the API script loads but never calls its readiness callback", async ({ page }) => {
  const probe = await setup(page, "timeout");
  await expect(page.locator(".main-play-btn")).toBeDisabled();
  probe.recover();
  await page.clock.runFor(14_500);
  await expect(page.getByTestId("youtube-initialization")).toHaveCount(0);
  await verifyPlayback(page);
  expect(probe.requests()).toBe(2);
  await expect.poll(() => probe.events.some((event) => event.errorCode === "YT_API_TIMEOUT")).toBe(true);
});

test("REG-068 retries only an unready iframe and ignores its late onReady after recovery", async ({ page }) => {
  const probe = await setup(page, "iframe");
  await expect.poll(() => page.evaluate(() => (window as ProbeWindow).__ytInit?.created)).toBe(1);
  await page.clock.runFor(14_500);
  await expect(page.getByTestId("youtube-initialization")).toHaveCount(0);
  await verifyPlayback(page);
  await page.locator(".main-play-btn").click();
  await page.evaluate(() => {
    const old = (window as ProbeWindow).__ytInit.instances[0];
    old.options.events.onReady({ target: old });
  });
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "播放");
  expect(await page.evaluate(() => (window as ProbeWindow).__ytInit.created)).toBe(2);
  expect(await page.evaluate(() => (window as ProbeWindow).__ytInit.destroyed)).toBe(1);
  expect(probe.requests()).toBe(1);
  await expect(page.locator("iframe[title='YouTube test player']")).toHaveCount(1);
  await expect.poll(() => probe.events.some((event) => event.errorCode === "YT_PLAYER_READY_TIMEOUT")).toBe(true);
});

test("REG-068 stops after 60 seconds and an explicit retry starts a new bounded cycle", async ({ page }) => {
  const probe = await setup(page);
  await expect(page.getByTestId("youtube-initialization")).toContainText("重新連線");
  for (let step = 0; step < 15; step++) {
    await page.clock.runFor(4_000);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
  }
  await expect(page.getByTestId("youtube-initialization")).toContainText("暫時連不上");
  const stopped = probe.requests();
  expect(stopped).toBeLessThanOrEqual(16);
  await page.clock.runFor(20_000);
  expect(probe.requests()).toBe(stopped);
  probe.recover();
  await page.getByRole("button", { name: "再試一次", exact: true }).click();
  await expect(page.getByTestId("youtube-initialization")).toHaveCount(0);
  await verifyPlayback(page);
  expect(probe.documents()).toBe(1);
  expect(probe.requests()).toBe(stopped + 1);
});

test("REG-068 leaving a pending initialization cancels instance retries and ignores a late API callback", async ({ page }) => {
  const probe = await setup(page, "timeout");
  await expect(page.getByTestId("youtube-initialization")).toBeVisible();
  await page.locator(".player-back").click();
  await expect(page).toHaveURL(/\/category\//);
  await page.evaluate(apiScript);
  await page.clock.runFor(61_000);
  expect(probe.requests()).toBe(1);
  expect(await page.evaluate(() => (window as ProbeWindow).__ytInit.created)).toBe(0);
  await expect(page.locator("iframe[title='YouTube test player']")).toHaveCount(0);
});

test("REG-068 recovers a failed secondary widget script without resetting YouTube private globals", async ({ page }) => {
  let widgetRequests = 0;
  await page.route("https://www.youtube.com/s/player/test/www-widgetapi.vflset/www-widgetapi.js", async (route) => {
    widgetRequests++;
    if (widgetRequests === 1) return route.abort("failed");
    await route.fulfill({ contentType: "application/javascript", body: apiScript });
  });
  // Match the official bootstrap's loading guard: fetching iframe_api again
  // alone does not issue a second widget request after the first one fails.
  await page.route("https://www.youtube.com/iframe_api", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: `
      window.YT ||= { loading: 0 };
      if (!YT.loading) {
        YT.loading = 1;
        const script = document.createElement('script'); script.id = 'www-widgetapi-script';
        script.src = 'https://www.youtube.com/s/player/test/www-widgetapi.vflset/www-widgetapi.js';
        document.head.appendChild(script);
      }
    ` });
  });
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("kid_series_player_preferences_v1", JSON.stringify({
    "learning-e2e": { volume: 0.35, playbackRate: 0.8 },
  })));
  await mockAuthorizedWatchApi(page, undefined, {
    source: "youtube", youtubeVideoId: "youtube-one", mediaType: null, mediaUrl: null,
  });
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=video&at=37`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => widgetRequests).toBe(1);
  await page.clock.runFor(14_500);
  await expect(page.getByTestId("youtube-initialization")).toHaveCount(0);
  await verifyPlayback(page);
  expect(widgetRequests).toBe(2);
});

test("REG-068 a real YouTube video error does not start an initialization retry loop", async ({ page }) => {
  await setup(page, "iframe");
  await expect.poll(() => page.evaluate(() => (window as ProbeWindow).__ytInit?.created)).toBe(1);
  await page.evaluate(() => {
    const player = (window as ProbeWindow).__ytInit.instances[0];
    player.options.events.onError({ target: player, data: 100 });
  });
  await expect(page.getByTestId("youtube-initialization")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("影片暫時載入不了。");
  await page.clock.runFor(61_000);
  expect(await page.evaluate(() => (window as ProbeWindow).__ytInit.created)).toBe(1);
});
