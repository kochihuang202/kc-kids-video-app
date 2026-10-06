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

import { buildYouTubeListenPlaylist } from "../src/lib/playbackQueue";

describe("buildYouTubeListenPlaylist", () => {
  it("rotates the playlist so that the current active video is always index 0", () => {
    const fixtures: any[] = [
      { id: "q1", source: "youtube", youtubeVideoId: "yt-1" },
      { id: "q2", source: "youtube", youtubeVideoId: "yt-2" },
      { id: "q3", source: "youtube", youtubeVideoId: "yt-3" },
      { id: "q4", source: "youtube", youtubeVideoId: "yt-4" },
      { id: "q5", source: "youtube", youtubeVideoId: "yt-5" },
    ];

    // When playing episode 3, playlist MUST start with episode 3 at index 0
    const listForEp3 = buildYouTubeListenPlaylist(fixtures, "yt-3");
    expect(listForEp3[0]).toBe("yt-3");
    expect(listForEp3).toEqual(["yt-3", "yt-4", "yt-5", "yt-1", "yt-2"]);

    // When playing episode 1, playlist starts with episode 1
    const listForEp1 = buildYouTubeListenPlaylist(fixtures, "yt-1");
    expect(listForEp1[0]).toBe("yt-1");
    expect(listForEp1).toEqual(["yt-1", "yt-2", "yt-3", "yt-4", "yt-5"]);
  });

  it("caps large categories (e.g. 284 episodes like 巧虎) to safe chunk size while keeping active video at index 0", () => {
    const fixtures: any[] = Array.from({ length: 284 }, (_, i) => ({
      id: `q${i + 1}`,
      source: "youtube",
      youtubeVideoId: `yt-${i + 1}`,
    }));

    // Active is episode 100
    const result = buildYouTubeListenPlaylist(fixtures, "yt-100");
    expect(result.length).toBe(50);
    expect(result[0]).toBe("yt-100");
    expect(result[1]).toBe("yt-101");
  });
});
