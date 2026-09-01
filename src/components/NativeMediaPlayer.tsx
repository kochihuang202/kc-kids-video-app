import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MediaType } from "../types";
import type { PlayerState, YouTubePlayerHandle } from "./YouTubePlayer";

interface NativeMediaPlayerProps {
  src: string;
  mediaType: MediaType;
  poster?: string;
  startAt?: number;
  volume?: number;
  onStateChange?: (state: PlayerState) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onError?: () => void;
}

export const NativeMediaPlayer = forwardRef<YouTubePlayerHandle, NativeMediaPlayerProps>(
  ({ src, mediaType, poster, startAt = 0, volume = 1, onStateChange, onProgress, onError }, ref) => {
    const elementRef = useRef<HTMLMediaElement | null>(null);
    const readySentRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => elementRef.current?.currentTime || startAt,
      getDuration: () => {
        const duration = elementRef.current?.duration;
        return duration && Number.isFinite(duration) ? duration : 0;
      },
      play: () => {
        void elementRef.current?.play().catch(() => onError?.());
      },
      pause: () => elementRef.current?.pause(),
      seekTo: (seconds) => {
        const element = elementRef.current;
        if (!element) return;
        const duration = Number.isFinite(element.duration) ? element.duration : Number.MAX_SAFE_INTEGER;
        element.currentTime = Math.max(0, Math.min(seconds, duration));
      },
    }), [onError, startAt]);

    useEffect(() => {
      readySentRef.current = false;
      const element = elementRef.current;
      if (!element) return;
      element.autoplay = false;
      element.controls = false;
      element.setAttribute("playsinline", "");
      element.setAttribute("webkit-playsinline", "");
      element.setAttribute("x-webkit-airplay", "deny");
      element.setAttribute("controlslist", "nofullscreen nodownload noremoteplayback");

      const keepInline = () => {
        const appleVideo = element as HTMLVideoElement & {
          webkitDisplayingFullscreen?: boolean;
          webkitExitFullscreen?: () => void;
        };
        if (appleVideo.webkitDisplayingFullscreen) appleVideo.webkitExitFullscreen?.();
      };
      element.addEventListener("webkitbeginfullscreen", keepInline);
      element.load();
      return () => {
        element.removeEventListener("webkitbeginfullscreen", keepInline);
        element.pause();
        element.removeAttribute("src");
        element.load();
      };
    }, [src]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      const nextVolume = Math.min(1, Math.max(0, volume));
      element.volume = nextVolume;
      element.muted = nextVolume === 0;
    }, [volume]);

    const reportProgress = () => {
      const element = elementRef.current;
      if (!element) return;
      const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0;
      onProgress?.(Math.max(0, element.currentTime || 0), duration);
    };

    const markReady = () => {
      const element = elementRef.current;
      if (!element || readySentRef.current) return;
      if (startAt > 0) {
        const duration = Number.isFinite(element.duration) ? element.duration : Number.MAX_SAFE_INTEGER;
        element.currentTime = Math.min(startAt, duration);
      }
      element.pause();
      readySentRef.current = true;
      reportProgress();
      onStateChange?.("READY");
    };

    const commonProps = {
      ref: (node: HTMLMediaElement | null) => { elementRef.current = node; },
      src,
      preload: "metadata" as const,
      onLoadedMetadata: markReady,
      onCanPlay: markReady,
      onDurationChange: reportProgress,
      onTimeUpdate: reportProgress,
      onSeeked: reportProgress,
      onPlaying: () => onStateChange?.("PLAYING"),
      onPause: () => {
        if (!elementRef.current?.ended) onStateChange?.("PAUSED");
      },
      onWaiting: () => onStateChange?.("BUFFERING"),
      onEnded: () => onStateChange?.("ENDED"),
      onError,
    };

    if (mediaType === "audio") {
      return <audio {...commonProps} className="native-media-player native-audio-player" aria-label="家庭音訊播放器" />;
    }

    return (
      <video
        {...commonProps}
        className="native-media-player"
        poster={poster}
        controls={false}
        autoPlay={false}
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nofullscreen nodownload noremoteplayback"
        aria-label="家庭影片播放器"
      />
    );
  },
);

NativeMediaPlayer.displayName = "NativeMediaPlayer";
