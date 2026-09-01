import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeMediaPlayer } from "../src/components/NativeMediaPlayer";

describe("NativeMediaPlayer progress reporting", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it("reports native time and duration when media events fire", async () => {
    const onProgress = vi.fn();
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <NativeMediaPlayer
          src="https://media.test/course/lesson.mp4"
          mediaType="video"
          volume={0.35}
          onProgress={onProgress}
        />,
      );
    });

    const video = host.querySelector("video")!;
    expect(video.volume).toBeCloseTo(0.35);
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 7.5 });

    await act(async () => {
      video.dispatchEvent(new Event("loadedmetadata"));
      video.dispatchEvent(new Event("timeupdate"));
    });

    expect(onProgress).toHaveBeenLastCalledWith(7.5, 120);

    await act(async () => root.unmount());
  });
});
