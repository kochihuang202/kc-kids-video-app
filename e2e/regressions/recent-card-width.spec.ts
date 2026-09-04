import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1190, height: 600 } });

test("REG-005 keeps recent cards equal width when titles have different lengths", async ({ page }) => {
  const access = {
    state: "AVAILABLE", remainingSeconds: 900, todayPlayedSeconds: 120, dailyLimitSeconds: 2400,
    bonusSeconds: 0, baseLimitSeconds: 2400, earnedBonusSeconds: 0, learningSeconds: 0,
    leisureUsedSeconds: 120, listenSeconds: 0, gracePeriodSeconds: 0, nextAllowedAt: null,
    isPaused: false, serverTimeTaipei: "12:00", todayDate: "2026-09-02", message: "今天還有休閒時間",
    categoryStates: [],
  };
  const recents = [
    { id: "short", parentLabel: "短標題" },
    { id: "medium", parentLabel: "30 帶著同理心和想象力去閱讀" },
    { id: "long", parentLabel: "第13季【可愛巧虎島】飛吧！SUPER YA！" },
  ].map((video, index) => ({
    ...video,
    source: "youtube",
    youtubeVideoId: `youtube-${index}`,
    mediaType: null,
    mediaPath: null,
    mediaUrl: null,
    thumbnailPath: null,
    youtubeTitle: video.parentLabel,
    thumbnailUrl: "/local-media-placeholder.svg",
    durationSeconds: 600,
    lastPositionSeconds: 30,
    isWatched: false,
    lastPlayedAt: "2026-09-02T04:00:00.000Z",
    playbackMode: index === 0 ? "listen" : "video",
  }));

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/content/categories") return fulfill([]);
    if (path === "/api/child/access-state") return fulfill(access);
    if (path === "/api/child/today-picks") return fulfill([]);
    if (path === "/api/content/resume") return fulfill({ resume: null });
    if (path === "/api/content/recents") return fulfill(recents);
    if (path === "/api/device/status") return fulfill({ authorized: true, device: { id: "e2e-device", name: "iPad" } });
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  const cards = page.locator(".recents-section[aria-label='最近看過'] .recent-card");
  await expect(cards).toHaveCount(3);
  const widths = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));

  expect(widths).toEqual(widths.map(() => 150));
  await expect(cards.first()).toHaveAttribute("href", /mode=listen/);
  await expect(cards.first()).toContainText("純聽");
});
