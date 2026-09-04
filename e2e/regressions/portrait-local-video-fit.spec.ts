import { expect, test } from "@playwright/test";
import {
  installDeterministicMedia,
  mockAuthorizedWatchApi,
  TEST_VIDEO_ID,
} from "../support/watch-page";

test("REG-011 keeps a portrait local video fully visible on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await installDeterministicMedia(page, 0);
  await mockAuthorizedWatchApi(page, undefined, {
    mediaType: "video",
    parentLabel: "直式科學影片",
    thumbnailUrl: "/local-media-placeholder.svg",
  });

  await page.goto(`/watch/${TEST_VIDEO_ID}`);

  const stage = page.locator(".player-stage-local");
  const poster = stage.locator(".poster-thumb");
  const video = stage.locator("video.native-media-player");

  await expect(stage).toBeVisible();
  await expect(poster).toBeVisible();
  await expect(poster).toHaveCSS("object-fit", "contain");
  await expect(video).toHaveCSS("object-fit", "contain");

  // Reproduce the replaced-element sizing pressure of a portrait MP4. The
  // video must not expand the grid row beyond the visible player stage.
  await video.evaluate((node: HTMLVideoElement) => {
    node.style.aspectRatio = "3 / 4";
  });
  const [stageBox, videoBox] = await Promise.all([stage.boundingBox(), video.boundingBox()]);
  expect(stageBox).not.toBeNull();
  expect(videoBox).not.toBeNull();
  expect(videoBox!.height).toBeLessThanOrEqual(stageBox!.height + 1);
  expect(videoBox!.width).toBeLessThanOrEqual(stageBox!.width + 1);
});
