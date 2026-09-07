import { describe, expect, it } from "vitest";
import { clampPlaybackPosition, getPlaybackRange, playbackCompletionRatio, relativePlaybackPosition } from "../shared/playbackRange";

describe("playback ranges", () => {
  const video = { durationSeconds: 120, playbackStartSeconds: 10, playbackEndSeconds: 70 };

  it("uses an absolute source range with a relative child timeline", () => {
    expect(getPlaybackRange(video)).toEqual({ startSeconds: 10, endSeconds: 70, durationSeconds: 60 });
    expect(relativePlaybackPosition(video, 35)).toBe(25);
    expect(clampPlaybackPosition(video, 2)).toBe(10);
    expect(clampPlaybackPosition(video, 90)).toBe(70);
  });

  it("calculates completion inside the configured range", () => {
    expect(playbackCompletionRatio(video, 64)).toBe(0.9);
    expect(playbackCompletionRatio(video, 70)).toBe(1);
  });
});
