import { expect, test } from "@playwright/test";

test("REG-014 keeps YouTube pure listening playing when advancing", async ({ page }) => {
  await page.addInitScript(() => {
    type PlayerOptions = {
      videoId: string;
      events: {
        onReady(event: { target: unknown }): void;
        onStateChange(event: { target: unknown; data: number }): void;
      };
    };

    const state = {
      constructorCount: 0,
      loadedVideos: [] as Array<{ videoId: string; startSeconds: number }>,
      currentTime: 0,
      duration: 120,
      options: null as PlayerOptions | null,
      instance: null as Record<string, unknown> | null,
    };
    (window as typeof window & { __youtubeTest: typeof state & { end(): void } }).__youtubeTest = {
      ...state,
      end() {
        const current = (window as typeof window & { __youtubeTest: typeof state }).__youtubeTest;
        current.options?.events.onStateChange({ target: current.instance, data: 0 });
      },
    };

    class FakePlayer {
      constructor(_element: HTMLElement, options: PlayerOptions) {
        const current = (window as typeof window & { __youtubeTest: typeof state }).__youtubeTest;
        current.constructorCount += 1;
        current.options = options;
        current.instance = this as unknown as Record<string, unknown>;
        queueMicrotask(() => options.events.onReady({ target: this }));
      }
      destroy() {}
      getCurrentTime() { return 0; }
      getDuration() { return 120; }
      playVideo() {
        const current = (window as typeof window & { __youtubeTest: typeof state }).__youtubeTest;
        current.options?.events.onStateChange({ target: this, data: 1 });
      }
      pauseVideo() {}
      seekTo() {}
      setVolume() {}
      mute() {}
      unMute() {}
      setPlaybackRate() {}
      loadVideoById(videoId: string, startSeconds = 0) {
        const current = (window as typeof window & { __youtubeTest: typeof state }).__youtubeTest;
        current.loadedVideos.push({ videoId, startSeconds });
        current.options?.events.onStateChange({ target: this, data: 1 });
      }
      cueVideoById() {}
    }

    (window as typeof window & { YT: { Player: typeof FakePlayer } }).YT = { Player: FakePlayer };
  });

  const videos = [
    { id: "qiaohu-1", youtubeVideoId: "youtube-one", parentLabel: "巧虎第一集", sortOrder: 1 },
    { id: "qiaohu-2", youtubeVideoId: "youtube-two", parentLabel: "巧虎第二集", sortOrder: 2, lastPositionSeconds: 119 },
  ].map((video) => ({
    ...video,
    categoryId: "qiaohu",
    categoryIds: ["qiaohu"],
    youtubeTitle: video.parentLabel,
    thumbnailUrl: "https://i.ytimg.com/vi/example/hqdefault.jpg",
    durationSeconds: 120,
    lastPositionSeconds: video.lastPositionSeconds || 0,
    isWatched: false,
    isLearned: false,
    isSelectable: true,
    seriesType: "leisure",
    source: "youtube",
    mediaType: "video",
    mediaPath: null,
    mediaUrl: null,
    thumbnailPath: null,
  }));
  const sessionModes: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/device/status") return json({ authorized: true, device: { id: "device-e2e", name: "iPhone" } });
    if (path === "/api/content/categories/qiaohu/videos") return json(videos);
    if (path === "/api/content/videos/qiaohu-1") return json(videos[0]);
    if (path === "/api/content/videos/qiaohu-2") return json(videos[1]);
    if (path === "/api/child/access-state") return json({
      state: "DAILY_LIMIT_REACHED", remainingSeconds: 0, todayPlayedSeconds: 3600,
      dailyLimitSeconds: 3600, bonusSeconds: 0, baseLimitSeconds: 3600,
      earnedBonusSeconds: 0, learningSeconds: 0, leisureUsedSeconds: 3600,
      listenSeconds: 0, gracePeriodSeconds: 0, nextAllowedAt: null, isPaused: false,
      serverTimeTaipei: "2026-09-03T12:00:00+08:00", todayDate: "2026-09-03",
      message: "今天的休閒時間到了", categoryStates: [],
    });
    if (path === "/api/view-sessions" && request.method() === "POST") {
      sessionModes.push((request.postDataJSON() as { playbackMode: string }).playbackMode);
      return json({ id: `session-${sessionModes.length}`, writeToken: "write-token", startedAt: new Date().toISOString() });
    }
    if (path.startsWith("/api/view-sessions/") && request.method() === "PATCH") return json({ ok: true });
    return json({ error: `Unexpected ${request.method()} ${path}` }, 404);
  });

  await page.goto("/watch/qiaohu-1?mode=listen");
  await page.locator(".main-play-btn").click();
  await expect.poll(() => sessionModes).toEqual(["listen"]);

  await page.evaluate(() => (window as typeof window & { __youtubeTest: { end(): void } }).__youtubeTest.end());

  await expect(page).toHaveURL(/\/watch\/qiaohu-2\?mode=listen&autoplay=1&fresh=1/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & {
    __youtubeTest: { constructorCount: number; loadedVideos: Array<{ videoId: string; startSeconds: number }> };
  }).__youtubeTest)).toMatchObject({
    constructorCount: 1,
    loadedVideos: [{ videoId: "youtube-two", startSeconds: 0 }],
  });
  await expect(page.locator(".main-play-btn")).toHaveAttribute("aria-label", "暫停");
  await expect(page.getByLabel("純聽模式")).toBeVisible();
  await expect.poll(() => sessionModes).toEqual(["listen", "listen"]);
});
