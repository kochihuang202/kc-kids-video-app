import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MediaType } from "../types";
import type { PlayerDebugInfo, PlayerState, YouTubePlayerHandle } from "./YouTubePlayer";

export interface NativePlaybackError {
  code: number;
  name: string;
  message: string;
  operation: "play" | "media";
}

function shouldUseBackgroundAudioMaster(mediaType: MediaType, src: string) {
  // Opening the same large OPFS-backed blob in both an audio master and a
  // visual video can leave WebKit reporting `playing` at 0:00. Local viewing
  // therefore uses one native video element.
  if (mediaType !== "video" || src.startsWith("blob:") || typeof navigator === "undefined") return false;
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
  onLoop?: () => void;
  onStateChange?: (state: PlayerState) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onError?: (error?: NativePlaybackError) => void;
  onReady?: () => void;
  onPlayable?: () => void;
  onDiagnostic?: (type: string, detail: PlayerDebugInfo) => void;
}

export const NativeMediaPlayer = forwardRef<YouTubePlayerHandle, NativeMediaPlayerProps>(
  ({ src, mediaType, poster, startAt = 0, volume = 1, playbackRate = 1, autoPlay = false, loopPlayback = false, onLoop, onStateChange, onProgress, onError, onReady, onPlayable, onDiagnostic }, ref) => {
    const elementRef = useRef<HTMLMediaElement | null>(null);
    const visualVideoRef = useRef<HTMLVideoElement | null>(null);
    const readySentRef = useRef(false);
    const playingRef = useRef(false);
    const playRequestedRef = useRef(autoPlay);
    const pendingPlayRef = useRef<Promise<void> | null>(null);
    const remotePauseRef = useRef(false);
    const lastCurrentTimeRef = useRef(startAt);
    const sourceGenerationRef = useRef(0);
    const settingsRef = useRef({ autoPlay, startAt, src });
    settingsRef.current = { autoPlay, startAt, src };
    const callbacksRef = useRef({ onError, onDiagnostic });
    callbacksRef.current = { onError, onDiagnostic };
    const useBackgroundAudioMaster = shouldUseBackgroundAudioMaster(mediaType, src);

    const debugState = (): PlayerDebugInfo => {
      const element = elementRef.current;
      const position = element?.currentTime || 0;
      let bufferedEnd = position;
      if (element) {
        for (let index = 0; index < element.buffered.length; index += 1) {
          if (element.buffered.start(index) <= position + 0.1 && element.buffered.end(index) >= position) {
            bufferedEnd = element.buffered.end(index);
            break;
          }
        }
      }
      return {
        sourceKind: settingsRef.current.src.startsWith("blob:") ? "blob" : "remote",
        currentTime: position, duration: element && Number.isFinite(element.duration) ? element.duration : 0,
        readyState: element?.readyState, networkState: element?.networkState,
        mediaPaused: element?.paused, mediaEnded: element?.ended, mediaSeeking: element?.seeking,
        bufferedAheadSeconds: Math.max(0, bufferedEnd - position),
        playIntent: playRequestedRef.current, pendingPlay: !!pendingPlayRef.current,
        sourceGeneration: sourceGenerationRef.current,
        muted: element?.muted, volume: element?.volume, playbackRate: element?.playbackRate,
        mediaErrorCode: element?.error?.code || 0,
      };
    };
    const diagnostic = (state: string) => callbacksRef.current.onDiagnostic?.("native_media_event", { ...debugState(), state });

    const syncVisualVideo = (play: boolean) => {
      const master = elementRef.current;
      const visual = visualVideoRef.current;
      if (!master || !visual) return;
      if (Math.abs(visual.currentTime - master.currentTime) > 0.35) visual.currentTime = master.currentTime;
      visual.playbackRate = master.playbackRate;
      if (play && !document.hidden) void visual.play().catch(() => {});
      else visual.pause();
    };

    const playElement = (element: HTMLMediaElement) => {
      if (pendingPlayRef.current) return;
      const generation = sourceGenerationRef.current;
      diagnostic("play_invoked");
      const request = element.play();
      pendingPlayRef.current = request;
      void request.then(() => {
        if (generation !== sourceGenerationRef.current) return;
        diagnostic("play_resolved");
        if (playRequestedRef.current && elementRef.current === element) syncVisualVideo(true);
      }).catch((error: unknown) => {
        if (generation !== sourceGenerationRef.current) return;
        const name = error instanceof Error ? error.name : "UnknownError";
        callbacksRef.current.onDiagnostic?.("native_media_event", { ...debugState(), state: "play_rejected", errorName: name, errorOperation: "play" });
        // A pending play promise is commonly aborted when our own pause/load
        // wins the race. That is a control-flow interruption, not a broken
        // Mac/Tailscale media connection.
        if (error instanceof DOMException && error.name === "AbortError") return;
        callbacksRef.current.onError?.({ code: 0, name, message: error instanceof Error ? error.message : "Playback failed", operation: "play" });
      }).finally(() => {
        if (pendingPlayRef.current === request) pendingPlayRef.current = null;
      });
    };

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => elementRef.current?.currentTime ?? startAt,
      getDuration: () => {
        const duration = elementRef.current?.duration;
        return duration && Number.isFinite(duration) ? duration : 0;
      },
      play: () => {
        playRequestedRef.current = true;
        const element = elementRef.current;
        if (!element) return;
        playElement(element);
      },
      pause: () => {
        playRequestedRef.current = false;
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
      getDebugState: debugState,
    }), [onError, startAt]);

    useEffect(() => {
      sourceGenerationRef.current += 1;
      readySentRef.current = false;
      playingRef.current = false;
      playRequestedRef.current = settingsRef.current.autoPlay;
      pendingPlayRef.current = null;
      lastCurrentTimeRef.current = startAt;
      const element = elementRef.current;
      if (!element) return;
      // StrictMode replays effect cleanup/setup without re-rendering the DOM.
      // Restore the source that the unmount cleanup removed during that replay.
      if (element.getAttribute("src") !== src) element.setAttribute("src", src);
      // Keep the native autoplay flag for playlist continuation. On iPadOS a
      // script-only play() after the screen locks can be rejected, while the
      // existing user-started media session may continue to the next source.
      element.autoplay = settingsRef.current.autoPlay;
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
      diagnostic("source_changed");
      element.load();
      const visual = visualVideoRef.current;
      if (visual) {
        visual.muted = true;
        visual.playsInline = true;
        visual.loop = loopPlayback;
        visual.load();
      }
      return () => {
        element.removeEventListener("webkitbeginfullscreen", keepInline);
      };
    }, [src]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      element.autoplay = autoPlay;
      if (autoPlay) {
        playRequestedRef.current = true;
        if (readySentRef.current) playElement(element);
      }
    }, [autoPlay]);

    useEffect(() => {
      const element = elementRef.current;
      if (element) element.loop = loopPlayback;
      if (visualVideoRef.current) visualVideoRef.current.loop = loopPlayback;
    }, [loopPlayback]);

    // Only tear down the media session when the player really unmounts. A
    // playlist source change reuses this element; pausing and clearing `src`
    // between episodes makes iOS treat the next play as a fresh autoplay.
    useEffect(() => {
      const element = elementRef.current;
      return () => {
        if (!element) return;
        sourceGenerationRef.current += 1;
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
      if (mediaType !== "audio" || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      const mediaSession = navigator.mediaSession;
      const pauseFromSystem = () => {
        remotePauseRef.current = true;
        playRequestedRef.current = false;
        diagnostic("system_pause");
        elementRef.current?.pause();
      };
      const playFromSystem = () => {
        const element = elementRef.current;
        if (!element) return;
        playRequestedRef.current = true;
        diagnostic("system_play");

        if (remotePauseRef.current) {
          remotePauseRef.current = false;
          if (document.hidden) {
            // The iPad can load metadata but stall fetching playable data in
            // the background. Do not discard a healthy buffer or native audio
            // session just because the lock-screen Play action was pressed.
            diagnostic("system_resume_preserve_source");
          } else {
            diagnostic("system_resume_rebind_source");
            const position = Math.max(0, element.currentTime || 0);
            const activeSource = element.getAttribute("src") || src;
            // Keep the existing foreground repair for a silent native audio
            // output, where WebKit can actually finish loading the resource.
            element.setAttribute("src", activeSource);
            element.load();
            const restorePosition = () => {
              if (Math.abs(element.currentTime - position) > 0.25) element.currentTime = position;
            };
            element.addEventListener("loadedmetadata", restorePosition, { once: true });
            try { element.currentTime = position; } catch { /* restored after metadata */ }
          }
        }
        playElement(element);
      };

      try {
        mediaSession.setActionHandler("pause", pauseFromSystem);
        mediaSession.setActionHandler("play", playFromSystem);
      } catch { return; }
      return () => {
        try {
          mediaSession.setActionHandler("pause", null);
          mediaSession.setActionHandler("play", null);
        } catch { /* older WebKit may reject unsupported actions */ }
      };
    }, [mediaType, src]);

    useEffect(() => {
      const handleVisibility = () => {
        const master = elementRef.current;
        diagnostic(document.hidden ? "background_entered" : "foreground_entered");
        if (document.hidden) {
          visualVideoRef.current?.pause();
        } else if (master) {
          if (playRequestedRef.current && master.paused && !master.ended) {
            diagnostic("foreground_resume_attempt");
            playElement(master);
          } else if (!master.paused) syncVisualVideo(true);
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
      readySentRef.current = true;
      reportProgress();
      onReady?.();
      // A user's early play() may already have started before metadata is
      // delivered. READY must not replace that real PLAYING state.
      if (!playingRef.current) onStateChange?.("READY");
      if (playRequestedRef.current && !playingRef.current) {
        playElement(element);
      } else if (!playRequestedRef.current) {
        element.pause();
      }
    };

    const commonProps = {
      ref: (node: HTMLMediaElement | null) => { elementRef.current = node; },
      src,
      preload: "metadata" as const,
      onLoadedMetadata: () => { diagnostic("loadedmetadata"); markReady(); },
      onCanPlay: () => { diagnostic("canplay"); markReady(); onPlayable?.(); },
      onStalled: () => diagnostic("stalled"),
      onSuspend: () => diagnostic("suspend"),
      onAbort: () => diagnostic("abort"),
      onEmptied: () => diagnostic("emptied"),
      onDurationChange: reportProgress,
      onTimeUpdate: () => {
        const master = elementRef.current;
        const currentTime = Math.max(0, master?.currentTime || 0);
        const duration = master && Number.isFinite(master.duration) ? master.duration : 0;
        if (
          loopPlayback
          && duration > 0
          && lastCurrentTimeRef.current >= duration - 2
          && currentTime <= Math.max(2, startAt + 1)
        ) {
          onLoop?.();
        }
        lastCurrentTimeRef.current = currentTime;
        reportProgress();
        const visual = visualVideoRef.current;
        if (master && visual && !document.hidden && Math.abs(visual.currentTime - master.currentTime) > 0.5) {
          syncVisualVideo(playRequestedRef.current);
        }
      },
      onSeeked: () => {
        reportProgress();
        syncVisualVideo(playRequestedRef.current);
      },
      onPlaying: () => {
        playingRef.current = true;
        playRequestedRef.current = true;
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        syncVisualVideo(true);
        onStateChange?.("PLAYING");
      },
      onPause: () => {
        playingRef.current = false;
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        if (!elementRef.current?.ended) onStateChange?.("PAUSED");
      },
      onWaiting: () => { playingRef.current = false; onStateChange?.("BUFFERING"); },
      onEnded: () => {
        if (loopPlayback) {
          const el = elementRef.current;
          if (el) {
            el.currentTime = 0;
            playElement(el);
          }
          syncVisualVideo(true);
          return;
        }
        onStateChange?.("ENDED");
      },
      onError: () => {
        const error = elementRef.current?.error;
        callbacksRef.current.onError?.({ code: error?.code || 0, name: "MediaError", message: error?.message || "Media element error", operation: "media" });
      },
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
            loop={loopPlayback}
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
