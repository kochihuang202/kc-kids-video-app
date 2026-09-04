import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MediaType } from "../types";
import type { PlayerState, YouTubePlayerHandle } from "./YouTubePlayer";

function shouldUseBackgroundAudioMaster(mediaType: MediaType) {
  if (mediaType !== "video" || typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

interface NativeMediaPlayerProps {
  src: string;
  mediaType: MediaType;
  poster?: string;
  startAt?: number;
  volume?: number;
  playbackRate?: number;
  autoPlay?: boolean;
  loopPlayback?: boolean;
  onStateChange?: (state: PlayerState) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onError?: (error?: MediaError | null) => void;
  onReady?: () => void;
}

export const NativeMediaPlayer = forwardRef<YouTubePlayerHandle, NativeMediaPlayerProps>(
  ({ src, mediaType, poster, startAt = 0, volume = 1, playbackRate = 1, autoPlay = false, loopPlayback = false, onStateChange, onProgress, onError, onReady }, ref) => {
    const elementRef = useRef<HTMLMediaElement | null>(null);
    const visualVideoRef = useRef<HTMLVideoElement | null>(null);
    const readySentRef = useRef(false);
    const useBackgroundAudioMaster = shouldUseBackgroundAudioMaster(mediaType);

    const syncVisualVideo = (play: boolean) => {
      const master = elementRef.current;
      const visual = visualVideoRef.current;
      if (!master || !visual) return;
      if (Math.abs(visual.currentTime - master.currentTime) > 0.35) visual.currentTime = master.currentTime;
      visual.playbackRate = master.playbackRate;
      if (play && !document.hidden) void visual.play().catch(() => {});
      else visual.pause();
    };

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => elementRef.current?.currentTime || startAt,
      getDuration: () => {
        const duration = elementRef.current?.duration;
        return duration && Number.isFinite(duration) ? duration : 0;
      },
      play: () => {
        void elementRef.current?.play().then(() => syncVisualVideo(true)).catch(() => onError?.());
      },
      pause: () => {
        elementRef.current?.pause();
        visualVideoRef.current?.pause();
      },
      seekTo: (seconds) => {
        const element = elementRef.current;
        if (!element) return;
        const duration = Number.isFinite(element.duration) ? element.duration : Number.MAX_SAFE_INTEGER;
        element.currentTime = Math.max(0, Math.min(seconds, duration));
        if (visualVideoRef.current) visualVideoRef.current.currentTime = element.currentTime;
      },
      setPlaybackRate: (rate: number) => {
        if (elementRef.current) elementRef.current.playbackRate = rate;
        if (visualVideoRef.current) visualVideoRef.current.playbackRate = rate;
      },
    }), [onError, startAt]);

    useEffect(() => {
      readySentRef.current = false;
      const element = elementRef.current;
      if (!element) return;
      // Keep the native autoplay flag for playlist continuation. On iPadOS a
      // script-only play() after the screen locks can be rejected, while the
      // existing user-started media session may continue to the next source.
      element.autoplay = autoPlay;
      element.loop = loopPlayback;
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
      const visual = visualVideoRef.current;
      if (visual) {
        visual.muted = true;
        visual.playsInline = true;
        visual.load();
      }
      return () => {
        element.removeEventListener("webkitbeginfullscreen", keepInline);
      };
    }, [autoPlay, loopPlayback, src]);

    // Only tear down the media session when the player really unmounts. A
    // playlist source change reuses this element; pausing and clearing `src`
    // between episodes makes iOS treat the next play as a fresh autoplay.
    useEffect(() => {
      const element = elementRef.current;
      return () => {
        if (!element) return;
        element.pause();
        element.removeAttribute("src");
        element.load();
      };
    }, []);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      const nextVolume = Math.min(1, Math.max(0, volume));
      element.volume = nextVolume;
      element.muted = nextVolume === 0;
    }, [volume]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      element.playbackRate = playbackRate;
      if (visualVideoRef.current) visualVideoRef.current.playbackRate = playbackRate;
    }, [playbackRate]);

    useEffect(() => {
      if (!useBackgroundAudioMaster) return;
      const handleVisibility = () => {
        const master = elementRef.current;
        if (document.hidden) {
          visualVideoRef.current?.pause();
        } else if (master && !master.paused) {
          syncVisualVideo(true);
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);
      return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [useBackgroundAudioMaster]);

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
      if (autoPlay) {
        void element.play().then(() => syncVisualVideo(true)).catch(() => onError?.());
      } else {
        element.pause();
      }
      readySentRef.current = true;
      reportProgress();
      onReady?.();
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
      onPlaying: () => {
        syncVisualVideo(true);
        onStateChange?.("PLAYING");
      },
      onPause: () => {
        if (!elementRef.current?.ended) onStateChange?.("PAUSED");
      },
      onWaiting: () => onStateChange?.("BUFFERING"),
      onEnded: () => onStateChange?.("ENDED"),
      onError: () => onError?.(elementRef.current?.error),
      loop: loopPlayback,
    };

    if (mediaType === "audio") {
      return <audio {...commonProps} autoPlay={autoPlay} className="native-media-player native-audio-player" aria-label="家庭音訊播放器" />;
    }

    if (useBackgroundAudioMaster) {
      return (
        <>
          <audio
            {...commonProps}
            autoPlay={autoPlay}
            className="native-background-audio"
            aria-label="背景音訊播放器"
          />
          <video
            ref={visualVideoRef}
            src={src}
            className="native-media-player"
            poster={poster}
            muted
            preload="metadata"
            controls={false}
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nofullscreen nodownload noremoteplayback"
            aria-label="家庭影片播放器"
          />
        </>
      );
    }

    return (
      <video
        {...commonProps}
        className="native-media-player"
        poster={poster}
        controls={false}
        autoPlay={autoPlay}
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
