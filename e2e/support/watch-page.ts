import type { Page, Route } from "@playwright/test";

export const TEST_VIDEO_ID = "regression-local-media";
export const TEST_MEDIA_URL = "/e2e-media/regression-media.wav";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function silentWav() {
  const sampleRate = 8_000;
  const dataSize = sampleRate;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  wav.fill(128, 44);
  return wav;
}

export async function installDeterministicMedia(
  page: Page,
  failLoads: number,
  options: { abortNetwork?: boolean; readyDelayMs?: number; deferPlayUntilReady?: boolean } = {},
) {
  await page.addInitScript(({ failures, readyDelayMs, deferPlayUntilReady }) => {
    const states = new WeakMap<HTMLMediaElement, {
      base: number;
      startedAt: number;
      playing: boolean;
      ready: boolean;
      pendingPlay: Array<{ resolve: () => void; reject: (error: Error) => void }>;
    }>();
    let loadCount = 0;
    let sourceRemovalCount = 0;
    let dispatchingEnded = false;

    const nativeRemoveAttribute = Element.prototype.removeAttribute;
    Element.prototype.removeAttribute = function removeAttribute(name: string) {
      if ((this instanceof HTMLAudioElement || this instanceof HTMLVideoElement) && name.toLowerCase() === "src") {
        sourceRemovalCount += 1;
        (window as Window & { __mediaSourceRemovalCount?: number }).__mediaSourceRemovalCount = sourceRemovalCount;
      }
      return nativeRemoveAttribute.call(this, name);
    };

    const stateFor = (element: HTMLMediaElement) => {
      let state = states.get(element);
      if (!state) {
        state = { base: 0, startedAt: performance.now(), playing: false, ready: false, pendingPlay: [] };
        states.set(element, state);
      }
      return state;
    };

    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() { return 120; },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get() {
        const state = stateFor(this as HTMLMediaElement);
        return state.base + (state.playing ? (performance.now() - state.startedAt) / 1000 : 0);
      },
      set(value: number) {
        const state = stateFor(this as HTMLMediaElement);
        state.base = Math.max(0, Number(value) || 0);
        state.startedAt = performance.now();
      },
    });
    HTMLMediaElement.prototype.load = function load() {
      if (!this.getAttribute("src")) return;
      const attempt = ++loadCount;
      (window as Window & { __mediaLoadCount?: number }).__mediaLoadCount = loadCount;
      const element = this;
      window.setTimeout(() => {
        stateFor(element).ready = attempt > failures;
        element.dispatchEvent(new Event(attempt <= failures ? "error" : "loadedmetadata"));
        const state = stateFor(element);
        if (state.ready && state.pendingPlay.length) {
          state.playing = true;
          state.startedAt = performance.now();
          element.dispatchEvent(new Event("playing"));
          for (const pending of state.pendingPlay.splice(0)) pending.resolve();
        }
      }, readyDelayMs);
    };
    HTMLMediaElement.prototype.play = function play() {
      const state = stateFor(this);
      // iPadOS can acknowledge a synchronous play() issued inside an ended
      // handler without actually restarting the finished media timeline.
      if (dispatchingEnded) {
        this.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      }
      if (deferPlayUntilReady && !state.ready) {
        this.dispatchEvent(new Event("waiting"));
        return new Promise<void>((resolve, reject) => state.pendingPlay.push({ resolve, reject }));
      }
      if (!state.playing) {
        state.playing = true;
        state.startedAt = performance.now();
        this.dispatchEvent(new Event("playing"));
      }
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      const state = stateFor(this);
      for (const pending of state.pendingPlay.splice(0)) {
        pending.reject(new DOMException("The play() request was interrupted by pause()", "AbortError"));
      }
      if (!state.playing) return;
      state.base += (performance.now() - state.startedAt) / 1000;
      state.playing = false;
      this.dispatchEvent(new Event("pause"));
    };

    (window as Window & { __finishMediaForTest?: () => void }).__finishMediaForTest = () => {
      const element = (document.querySelector("audio.native-media-player")
        || document.querySelector("audio.native-background-audio")
        || document.querySelector("video.native-media-player")) as HTMLMediaElement | null;
      if (!element) throw new Error("No native audio player");
      const state = stateFor(element);
      if (element.loop) {
        state.base = 0;
        state.startedAt = performance.now();
        state.playing = true;
        element.dispatchEvent(new Event("timeupdate"));
        return;
      }
      if (state.playing) {
        state.base += (performance.now() - state.startedAt) / 1000;
        state.playing = false;
      }
      dispatchingEnded = true;
      element.dispatchEvent(new Event("ended"));
      dispatchingEnded = false;
    };
  }, {
    failures: failLoads,
    readyDelayMs: options.readyDelayMs ?? 25,
    deferPlayUntilReady: options.deferPlayUntilReady ?? false,
  });

  await page.route("**/e2e-media/regression-media.wav*", async (route) => {
    if (options.deferPlayUntilReady) await new Promise((resolve) => setTimeout(resolve, options.readyDelayMs ?? 25));
    return options.abortNetwork === false
      ? route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav() })
      : route.abort("connectionfailed");
  });
}

export function finishMediaForTest(page: Page) {
  return page.evaluate(() => {
    const finish = (window as Window & { __finishMediaForTest?: () => void }).__finishMediaForTest;
    if (!finish) throw new Error("Deterministic media finish helper is not installed");
    finish();
  });
}

export function getMediaLoadCount(page: Page) {
  return page.evaluate(() => (window as Window & { __mediaLoadCount?: number }).__mediaLoadCount || 0);
}

export function getMediaSourceRemovalCount(page: Page) {
  return page.evaluate(() => (window as Window & { __mediaSourceRemovalCount?: number }).__mediaSourceRemovalCount || 0);
}

export async function mockAuthorizedWatchApi(
  page: Page,
  onVideoRequest?: () => void,
  videoOverrides: Record<string, unknown> = {},
) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/device/status") {
      await json(route, { authorized: true, device: { id: "device-e2e", name: "Regression iPad" } });
      return;
    }
    if (url.pathname === `/api/content/videos/${TEST_VIDEO_ID}`) {
      onVideoRequest?.();
      await json(route, {
        id: TEST_VIDEO_ID,
        categoryId: "learning-e2e",
        categoryIds: ["learning-e2e"],
        youtubeTitle: "Regression local media",
        parentLabel: "播放器回歸測試",
        thumbnailUrl: "/local-media-placeholder.svg",
        sortOrder: 1,
        durationSeconds: 120,
        lastPositionSeconds: 36,
        isWatched: true,
        isLearned: false,
        isSelectable: true,
        seriesType: "learning",
        source: "self_hosted",
        youtubeVideoId: null,
        mediaType: "audio",
        mediaPath: "regression-media.wav",
        mediaUrl: TEST_MEDIA_URL,
        thumbnailPath: null,
        ...videoOverrides,
      });
      return;
    }
    if (url.pathname === "/api/child/access-state") {
      await json(route, {
        state: "AVAILABLE",
        remainingSeconds: 3600,
        todayPlayedSeconds: 0,
        dailyLimitSeconds: 3600,
        bonusSeconds: 0,
        baseLimitSeconds: 3600,
        earnedBonusSeconds: 0,
        learningSeconds: 0,
        leisureUsedSeconds: 0,
        listenSeconds: 0,
        gracePeriodSeconds: 0,
        nextAllowedAt: null,
        isPaused: false,
        serverTimeTaipei: "2026-09-02T12:00:00+08:00",
        todayDate: "2026-09-02",
        message: "",
        categoryStates: [],
      });
      return;
    }
    if (url.pathname === "/api/view-sessions" && request.method() === "POST") {
      await json(route, { id: "session-e2e", writeToken: "write-token-e2e", startedAt: new Date().toISOString() });
      return;
    }
    if (url.pathname === "/api/view-sessions/session-e2e" && request.method() === "PATCH") {
      await json(route, { ok: true });
      return;
    }

    await json(route, { error: `Unexpected regression request: ${request.method()} ${url.pathname}` }, 404);
  });
}
