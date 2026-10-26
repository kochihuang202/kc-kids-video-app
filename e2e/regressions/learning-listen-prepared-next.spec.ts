import { expect, test, type Page } from "@playwright/test";
import { finishMediaForTest, getMediaLoadCount, getMediaSourceRemovalCount, installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";

type LockWindow = Window & {
  __setPreparedTestLock(value: boolean): void;
  __preparedUrls: { created: string[]; revoked: string[] };
  __releasePreparedFile?: () => void;
  __preparedFileWaiting?: boolean;
  __preparedFileCompleted?: boolean;
};

async function setup(page: Page, downloaded: boolean, options: { missingNext?: boolean; gateNextFile?: boolean; holdFirstSession?: boolean } = {}) {
  await installDeterministicMedia(page, 0, { readyDelayMs: 100, deferPlayUntilReady: true });
  await page.addInitScript(({ gateNextFile }) => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
    (window as LockWindow).__setPreparedTestLock = (value) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    localStorage.setItem("kid_series_player_preferences_v1", JSON.stringify({
      "learning-e2e": { volume: 0.4, playbackRate: 0.8 },
    }));
    const urls = { created: [] as string[], revoked: [] as string[] };
    (window as LockWindow).__preparedUrls = urls;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); urls.created.push(url); return url; };
    URL.revokeObjectURL = (url) => { urls.revoked.push(url); revoke(url); };
    if (gateNextFile) {
      const getFile = FileSystemFileHandle.prototype.getFile;
      FileSystemFileHandle.prototype.getFile = async function () {
        if (this.name === "prepared-first-lesson.media") {
          (window as LockWindow).__preparedFileWaiting = true;
          await new Promise<void>((resolve) => { (window as LockWindow).__releasePreparedFile = resolve; });
        }
        const file = await getFile.call(this);
        if (this.name === "prepared-first-lesson.media") (window as LockWindow).__preparedFileCompleted = true;
        return file;
      };
    }
  }, options);
  const second = {
    id: TEST_VIDEO_ID, categoryId: "learning-e2e", categoryIds: ["learning-e2e"],
    parentLabel: "第二集", youtubeTitle: "第二集", source: "self_hosted", youtubeVideoId: null,
    mediaType: "video", mediaPath: "second.wav", mediaUrl: "/e2e-media/regression-media.wav?second",
    thumbnailUrl: "/local-media-placeholder.svg", thumbnailPath: null, seriesType: "learning",
    isSelectable: true, sortOrder: 2, durationSeconds: 120, listenRepeatCount: 5,
    playbackStartSeconds: 0, playbackEndSeconds: null,
  };
  const first = { ...second, id: "prepared-first-lesson", parentLabel: "第一集", youtubeTitle: "第一集", sortOrder: 1, mediaPath: "first.wav", mediaUrl: "/e2e-media/regression-media.wav?first" };
  const locked = { ...second, id: "prepared-locked-lesson", sortOrder: 3, isSelectable: false };
  await mockAuthorizedWatchApi(page, undefined, second);
  await page.route("**/api/content/categories/learning-e2e/videos", (route) => route.fulfill({ json: [first, second, locked] }));
  await page.route("**/api/content/videos/prepared-first-lesson", (route) => route.fulfill({ json: first }));
  const sessions: Array<{ videoId: string; playbackMode: string }> = [];
  let releaseFirstSession = () => {};
  await page.route("**/api/view-sessions", async (route) => {
    sessions.push(route.request().postDataJSON());
    if (options.holdFirstSession && sessions.length === 1) {
      await new Promise<void>((resolve) => { releaseFirstSession = resolve; });
      await route.fulfill({ status: 403, json: { error: "舊播放請求已失效。", code: "DEVICE_AUTH_REQUIRED" } });
      return;
    }
    await route.fulfill({ json: { id: `prepared-session-${sessions.length}`, writeToken: "prepared-write-token", startedAt: new Date().toISOString() } });
  });
  const events: Array<{ type: string; detail?: Record<string, unknown> }> = [];
  await page.route("**/api/diagnostics/**", async (route) => {
    const body = route.request().postDataJSON();
    if (Array.isArray(body.events)) events.push(...body.events);
    await route.fulfill({ json: { id: "prepared-diagnostic", ok: true } });
  });
  const blocked: Array<() => void> = [];
  const hiddenLoads: string[] = [];
  // Replay the background data wait: reads made only after ending cannot
  // finish until this fixture unlocks. Existing playback/session writes work.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && /^\/api\/(device\/status|child\/access-state|content\/)/.test(path)
      && await page.evaluate(() => document.hidden)) {
      hiddenLoads.push(path);
      await new Promise<void>((resolve) => blocked.push(resolve));
    }
    await route.fallback();
  });
  page.on("dialog", (dialog) => dialog.accept());
  if (downloaded) {
    await page.goto("/");
    await page.evaluate(async ({ videos, missingNext }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("kids-media-v1", { create: true });
      const completed: Record<string, number> = {};
      for (const video of videos) {
        const file = await dir.getFileHandle(`${encodeURIComponent(video.id)}.media`, { create: true });
        const writer = await file.createWritable();
        const bytes = new Uint8Array(8044);
        bytes[0] = video.sortOrder;
        await writer.write(bytes);
        await writer.close();
        completed[video.id] = 8044;
      }
      localStorage.setItem("kids-downloads-v1", JSON.stringify([{
        category: { id: "learning-e2e", name: "測試課程" }, videos, completed,
        mimeTypes: Object.fromEntries(videos.map((video) => [video.id, "audio/wav"])),
      }]));
      if (missingNext) await dir.removeEntry("prepared-first-lesson.media");
    }, { videos: [first, second], missingNext: options.missingNext });
  }
  await page.goto(`/watch/${TEST_VIDEO_ID}?mode=listen&fresh=1`);
  const audio = page.locator("audio.native-media-player");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.3);
  await audio.evaluate((element) => element.setAttribute("data-prepared-original", "yes"));
  return { audio, first, second, sessions, events, hiddenLoads, releaseFirstSession: () => releaseFirstSession(), release: () => blocked.splice(0).forEach((resolve) => resolve()) };
}

async function finishFive(page: Page) {
  const audio = page.locator("audio.native-media-player");
  for (let play = 1; play < 5; play++) {
    await audio.evaluate((element: HTMLAudioElement) => {
      element.currentTime = 119.8;
      element.dispatchEvent(new Event("timeupdate"));
    });
    await finishMediaForTest(page);
    await expect(page.getByLabel("純聽模式")).toContainText(`第 ${play + 1} / 5 次`);
  }
  await expect(audio).toHaveJSProperty("loop", false);
  await finishMediaForTest(page);
}

for (const downloaded of [false, true]) {
  test(`REG-069 five locked learning plays advance with a prepared ${downloaded ? "downloaded" : "remote"} source and wrap without waiting for GETs`, async ({ page }) => {
    const probe = await setup(page, downloaded);
    const loads = await getMediaLoadCount(page);
    const removals = await getMediaSourceRemovalCount(page);
    await page.evaluate(() => (window as LockWindow).__setPreparedTestLock(true));
    try {
      for (const target of [probe.first, probe.second]) {
        const previousSource = await probe.audio.getAttribute("src");
        await finishFive(page);
        await expect(page).toHaveURL(new RegExp(`/watch/${target.id}\\?mode=listen&autoplay=1&fresh=1`));
        await expect(probe.audio).toHaveAttribute("src", downloaded ? /^blob:/ : target.mediaUrl);
        expect(await probe.audio.getAttribute("src")).not.toBe(previousSource);
        await expect.poll(() => probe.audio.evaluate((element: HTMLAudioElement) => element.currentTime > 0.3 && element.currentTime < 5)).toBe(true);
        if (downloaded) expect(await probe.audio.evaluate(async (element: HTMLAudioElement) =>
          new Uint8Array(await (await fetch(element.src)).arrayBuffer())[0])).toBe(target.sortOrder);
        await expect(probe.audio).toHaveAttribute("data-prepared-original", "yes");
        await expect(probe.audio).toHaveJSProperty("volume", 0.4);
        await expect(probe.audio).toHaveJSProperty("playbackRate", 0.8);
        await expect(page.getByLabel("純聽模式")).toContainText("第 1 / 5 次");
        await expect(page.locator("audio")).toHaveCount(1);
      }
      expect(probe.hiddenLoads).toEqual([]);
      expect(await getMediaLoadCount(page)).toBe(loads + 2);
      expect(await getMediaSourceRemovalCount(page)).toBe(removals);
      await expect.poll(() => probe.sessions.map(({ videoId, playbackMode }) => ({ videoId, playbackMode }))).toEqual([
        { videoId: TEST_VIDEO_ID, playbackMode: "listen" },
        { videoId: probe.first.id, playbackMode: "listen" },
        { videoId: TEST_VIDEO_ID, playbackMode: "listen" },
      ]);
      await page.locator(".player-back").click();
      await expect.poll(() => probe.events.some((event) => event.detail?.state === "next_source_claimed")).toBe(true);
      if (downloaded) await expect.poll(() => page.evaluate(() => {
        const urls = (window as LockWindow).__preparedUrls;
        return urls.created.every((url) => urls.revoked.includes(url));
      })).toBe(true);
    } finally { probe.release(); }
  });
}

test("REG-069 leaving while a downloaded next file is opening never creates a ghost source", async ({ page }) => {
  const probe = await setup(page, true, { gateNextFile: true });
  await expect.poll(() => page.evaluate(() => (window as LockWindow).__preparedFileWaiting)).toBe(true);
  await page.locator(".player-back").click();
  await page.evaluate(() => (window as LockWindow).__releasePreparedFile?.());
  await expect.poll(() => page.evaluate(() => (window as LockWindow).__preparedFileCompleted)).toBe(true);
  await expect(page.locator("audio")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as LockWindow).__preparedUrls.created.length)).toBe(1);
  const urls = await page.evaluate(() => (window as LockWindow).__preparedUrls);
  expect(urls.revoked).toEqual(urls.created);
  expect(probe.sessions).toHaveLength(1);
});

test("REG-069 a missing downloaded next lesson still requires consent before streaming", async ({ page }) => {
  await setup(page, true, { missingNext: true });
  const prompts: string[] = [];
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => { prompts.push(dialog.message()); return dialog.dismiss(); });
  await finishFive(page);
  await expect(page.getByText("請家長到管理中心的「離線下載」重新下載影片。", { exact: true })).toBeVisible();
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain("這會消耗流量");
  await expect(page.locator("audio")).toHaveCount(0);
});

test("REG-069 changing child discards the prepared lesson and uses the child's current permission", async ({ page }) => {
  const probe = await setup(page, false);
  await page.route("**/api/content/videos/prepared-first-lesson", async (route) => {
    expect(route.request().headers()["x-kc-child-id"]).toBe("different-child");
    await route.fulfill({ status: 403, json: { error: "這部學習影片尚未解鎖。", code: "LEARNING_VIDEO_LOCKED" } });
  });
  await page.evaluate(() => localStorage.setItem("kc_active_child_id", "different-child"));
  await finishFive(page);
  await expect(page.getByRole("heading", { name: "這一部還沒開放" })).toBeVisible();
  expect(probe.sessions).toHaveLength(1);
  await expect(page.locator("audio")).toHaveCount(0);
});

test("REG-069 server rejection still stops a prepared local successor", async ({ page }) => {
  await setup(page, true);
  await page.route("**/api/view-sessions", (route) => route.fulfill({
    status: 403, json: { error: "這部學習影片尚未解鎖。", code: "LEARNING_VIDEO_LOCKED" },
  }));
  await finishFive(page);
  await expect(page.getByRole("heading", { name: "這一部還沒開放" })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("REG-069 a late denial from the previous episode cannot stop the playing successor", async ({ page }) => {
  const probe = await setup(page, false, { holdFirstSession: true });
  try {
    await finishFive(page);
    await expect(probe.audio).toHaveAttribute("src", probe.first.mediaUrl);
    await expect.poll(() => probe.audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.3);
    await expect.poll(() => probe.sessions.length).toBe(2);
    const denied = page.waitForResponse((response) => response.url().endsWith("/api/view-sessions") && response.status() === 403);
    probe.releaseFirstSession();
    await (await denied).finished();
    const position = await probe.audio.evaluate((element: HTMLAudioElement) => element.currentTime);
    await expect.poll(() => probe.audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(position + 0.3);
    await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
    await expect(page.getByRole("heading", { name: "請家長先授權這台裝置" })).toHaveCount(0);
  } finally { probe.releaseFirstSession(); }
});
