import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PlayerState = "PLAYING" | "PAUSED" | "ENDED" | "BUFFERING" | "READY";

interface PlayerInstance {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
}

interface PlayerEvent { target: PlayerInstance; data: number; }

interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => PlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

export interface YouTubePlayerHandle {
  getCurrentTime(): number;
  getDuration(): number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
}

interface YouTubePlayerProps {
  videoId: string;
  startAt?: number;
  volume?: number;
  onStateChange?: (state: PlayerState) => void;
  onError?: () => void;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  ({ videoId, startAt = 0, volume = 1, onStateChange, onError }, ref) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<PlayerInstance | null>(null);
    const stateCallbackRef = useRef(onStateChange);
    const errorCallbackRef = useRef(onError);
    const volumeRef = useRef(volume);
    stateCallbackRef.current = onStateChange;
    errorCallbackRef.current = onError;
    volumeRef.current = volume;

    useEffect(() => {
      const player = playerRef.current;
      if (!player) return;
      const nextVolume = Math.round(Math.min(1, Math.max(0, volume)) * 100);
      player.setVolume(nextVolume);
      if (nextVolume === 0) player.mute();
      else player.unMute();
    }, [volume]);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => typeof playerRef.current?.getCurrentTime === "function" ? playerRef.current.getCurrentTime() || startAt : startAt,
      getDuration: () => typeof playerRef.current?.getDuration === "function" ? playerRef.current.getDuration() || 0 : 0,
      play: () => { if (typeof playerRef.current?.playVideo === "function") playerRef.current.playVideo(); },
      pause: () => { if (typeof playerRef.current?.pauseVideo === "function") playerRef.current.pauseVideo(); },
      seekTo: (seconds) => {
        if (typeof playerRef.current?.seekTo === "function") playerRef.current.seekTo(Math.max(0, seconds), true);
      },
    }), [startAt]);

    useEffect(() => {
      let cancelled = false;
      let player: PlayerInstance | null = null;
      void loadYouTubeApi().then((YT) => {
        if (cancelled || !hostRef.current) return;
        player = new YT.Player(hostRef.current, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            start: Math.max(0, Math.floor(startAt)),
            origin: window.location.origin,
          },
          events: {
            onReady: (event: PlayerEvent) => {
              playerRef.current = event.target;
              const initialVolume = Math.round(Math.min(1, Math.max(0, volumeRef.current)) * 100);
              event.target.setVolume(initialVolume);
              if (initialVolume === 0) event.target.mute();
              else event.target.unMute();
              if (startAt > 0) event.target.seekTo(startAt, true);
              event.target.pauseVideo();
              stateCallbackRef.current?.("READY");
            },
            onStateChange: (event: PlayerEvent) => {
              const state: PlayerState | undefined = ({ 0: "ENDED", 1: "PLAYING", 2: "PAUSED", 3: "BUFFERING" } as Record<number, PlayerState>)[event.data];
              if (state) stateCallbackRef.current?.(state);
            },
            onError: () => errorCallbackRef.current?.(),
          },
        });
      });
      return () => {
        cancelled = true;
        playerRef.current = null;
        player?.destroy();
      };
    }, [videoId, startAt]);

    return <div className="youtube-player" ref={hostRef} aria-label="YouTube 影片播放器" />;
  },
);
YouTubePlayer.displayName = "YouTubePlayer";
