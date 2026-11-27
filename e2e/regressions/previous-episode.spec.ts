import { expect, test } from "@playwright/test";
import { installDeterministicMedia, TEST_MEDIA_URL } from "../support/watch-page";

for (const mode of ["video", "listen"] as const) {
  test(`previous episode preserves ${mode} mode and series settings with selectable boundaries`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const category = {
      id: "series-a",
      name: "系列 A",
      icon: "📘",
      tone: "sky",
      sortOrder: 1,
      dailyLimitSeconds: null,
      seriesType: "learning",
    };
    const videos = [1, 2, 3, 4].map((index) => ({
      id: `series-a-${index}`,
      categoryId: category.id,
      categoryIds: [category.id],
      source: "self_hosted",
      youtubeVideoId: null,
      mediaType: "video",
      mediaPath: `series-a-${index}.mp4`,
      mediaUrl: TEST_MEDIA_URL,
      thumbnailPath: null,
      youtubeTitle: `系列 A 第 ${index} 集`,
      parentLabel: `第 ${index} 集`,
      thumbnailUrl: "/local-media-placeholder.svg",
      durationSeconds: 120,
      sortOrder: index,
      lastPositionSeconds: 75,
      isWatched: false,
      isLearned: false,
      learnedAt: null,
      isSelectable: index < 4,
      seriesType: "learning",
    }));
    const access = {
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
      serverTimeTaipei: "2026-09-21T12:00:00+08:00",
      todayDate: "2026-09-21",
      message: "",
      categoryStates: [],
    };

    await installDeterministicMedia(page, 0, { abortNetwork: false });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      if (path === "/api/content/categories") return json([category]);
      if (path === `/api/content/categories/${category.id}/videos`) return json(videos);
      if (path.startsWith("/api/content/videos/")) {
        const video = videos.find((item) => path.endsWith(`/${item.id}`));
        return video ? json(video) : json({ error: "not found" }, 404);
      }
      if (path === "/api/child/access-state") return json(access);
      if (path === "/api/device/status") return json({ authorized: true, device: { id: "device-a", name: "測試裝置" } });
      if (path === "/api/view-sessions" && request.method() === "POST") {
        return json({ id: crypto.randomUUID(), writeToken: "write-token", startedAt: new Date().toISOString() }, 201);
      }
      if (path.startsWith("/api/view-sessions/") && request.method() === "PATCH") return json({ ok: true });
      return json({ ok: true });
    });

    await page.goto(`/watch/series-a-2?mode=${mode}&fresh=1`);
    await page.getByLabel("播放速度").selectOption("0.8");
    await page.getByLabel("音量").fill("0.35");
    await expect(page.getByRole("button", { name: "下一集", exact: true })).toBeVisible();
    const previous = page.getByRole("button", { name: "上一集", exact: true });
    await expect(previous).toBeVisible();
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator(".playback-buttons button")).toHaveCount(5);
      for (const button of await page.locator(".playback-buttons button").all()) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    }
    await previous.click();
    await expect(page).toHaveURL(`/watch/series-a-1?mode=${mode}&autoplay=1&fresh=1`);
    await expect(page.getByRole("button", { name: "上一集", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("播放速度")).toHaveValue("0.8");
    await expect(page.getByLabel("音量")).toHaveValue("0.35");
    const media = page.locator(mode === "listen" ? "audio" : "video").first();
    await expect(page.getByRole("button", { name: "暫停", exact: true })).toBeVisible();
    await expect.poll(() => media.evaluate((el: HTMLMediaElement) => el.currentTime)).toBeGreaterThan(1);
    expect(await media.evaluate((el: HTMLMediaElement) => el.currentTime)).toBeLessThan(20);
    await page.getByRole("button", { name: "下一集", exact: true }).click();
    await expect(page).toHaveURL(/\/watch\/series-a-2/);
    await expect(page.getByRole("button", { name: "上一集", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "下一集", exact: true }).click();
    await expect(page).toHaveURL(/\/watch\/series-a-3/);
    await expect(page.getByRole("button", { name: "下一集", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "上一集", exact: true }).click();
    await expect(page).toHaveURL(/\/watch\/series-a-2/);
  });
}
