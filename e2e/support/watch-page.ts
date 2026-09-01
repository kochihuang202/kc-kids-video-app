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

export async function installDeterministicMedia(page: Page, failLoads: number) {
  await page.addInitScript(({ failures }) => {
    const states = new WeakMap<HTMLMediaElement, { base: number; startedAt: number; playing: boolean }>();
    let loadCount = 0;

    const stateFor = (element: HTMLMediaElement) => {
      let state = states.get(element);
      if (!state) {
        state = { base: 0, startedAt: performance.now(), playing: false };
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
        element.dispatchEvent(new Event(attempt <= failures ? "error" : "loadedmetadata"));
      }, 25);
    };
    HTMLMediaElement.prototype.play = function play() {
      const state = stateFor(this);
      if (!state.playing) {
        state.playing = true;
        state.startedAt = performance.now();
        this.dispatchEvent(new Event("playing"));
      }
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      const state = stateFor(this);
      if (!state.playing) return;
      state.base += (performance.now() - state.startedAt) / 1000;
      state.playing = false;
      this.dispatchEvent(new Event("pause"));
    };
  }, { failures: failLoads });

  await page.route("**/e2e-media/regression-media.wav*", (route) => route.abort("connectionfailed"));
}

export function getMediaLoadCount(page: Page) {
  return page.evaluate(() => (window as Window & { __mediaLoadCount?: number }).__mediaLoadCount || 0);
}

export async function mockAuthorizedWatchApi(page: Page, onVideoRequest?: () => void) {
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
