import { expect, test } from "@playwright/test";
import { installDeterministicMedia, mockAuthorizedWatchApi, TEST_VIDEO_ID } from "../support/watch-page";
import type { UpdateViewSessionInput } from "../../src/types";

for (const mode of ["video", "listen"] as const) {
  test(`REG-073 ${mode}: play, stall, pause, resume and leave without a zero-second polling loop`, async ({ page }) => {
    await page.clock.install();
    await installDeterministicMedia(page, 0, { abortNetwork: false });
    await mockAuthorizedWatchApi(page, undefined, { seriesType: "leisure", mediaType: "audio" });
    const updates: UpdateViewSessionInput[] = [];
    await page.route("**/api/view-sessions/session-e2e", async (route) => {
      updates.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.goto(`/watch/${TEST_VIDEO_ID}?mode=${mode}`);
    const controls = page.getByRole("region", { name: "影片播放控制" });
    await controls.getByRole("button", { name: "播放", exact: true }).click();
    await page.clock.runFor(31_000);
    await expect.poll(() => updates.some((item) => item.deltaSeconds > 0)).toBe(true);

    // Reproduce the observed device: still reports PLAYING, currentTime stops.
    await page.locator("audio.native-media-player").evaluate((element: HTMLAudioElement) => {
      Object.defineProperty(element, "currentTime", { configurable: true, writable: true, value: element.currentTime });
    });
    await page.clock.runFor(31_000); // Finish the interval that included movement.
    const settled = updates.length;
    for (let n = 0; n < 3; n++) await page.clock.runFor(30_000);
    expect(updates.slice(settled).filter((item) => item.status === "active")).toEqual([]);
    const played = updates.reduce((sum, item) => sum + item.deltaSeconds, 0);

    await controls.getByRole("button", { name: "暫停", exact: true }).click();
    await page.locator("audio.native-media-player").evaluate((element: HTMLAudioElement) => {
      const position = element.currentTime;
      Reflect.deleteProperty(element, "currentTime");
      element.currentTime = position;
    });
    await controls.getByRole("button", { name: "播放", exact: true }).click();
    await page.clock.runFor(31_000);
    await expect.poll(() => updates.reduce((sum, item) => sum + item.deltaSeconds, 0)).toBeGreaterThan(played);
    const resumed = updates.filter((item) => item.deltaSeconds > 0).at(-1)!;
    expect(Date.parse(resumed.intervalEndedAt!) - Date.parse(resumed.intervalStartedAt!)).toBeLessThanOrEqual(31_000);
    await controls.getByRole("link", { name: "回去" }).click();
    await expect.poll(() => updates.some((item) => item.status === "ended")).toBe(true);
    expect(new Set(updates.map((item) => item.heartbeatSeq)).size).toBe(updates.length);
  });
}
