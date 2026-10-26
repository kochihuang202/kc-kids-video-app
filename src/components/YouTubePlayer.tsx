import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PlayerState = "PLAYING" | "PAUSED" | "ENDED" | "BUFFERING" | "READY";
export type PlayerDebugInfo = Record<string, string | number | boolean | null | undefined>;

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
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  cuePlaylist?(videoIds: string[], index?: number, startSeconds?: number): void;
  loadPlaylist?(videoIds: string[], index?: number, startSeconds?: number): void;
  setLoop?(loop: boolean): void;
  nextVideo?(): void;
  getPlayerState?(): number;
  getVideoData?(): { video_id?: string };
  getVolume?(): number;
  isMuted?(): boolean;
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
let widgetApiRetryUrl: string | null = null;
const API_URL = "https://www.youtube.com/iframe_api";
const INIT_TIMEOUT_MS = 10_000;
const INIT_BUDGET_MS = 60_000;
const INIT_RETRY_MS = 4_000;

class YouTubeInitializationError extends Error {
  constructor(readonly code: string) { super(code); }
}

export interface YouTubeInitialization {
  state: "loading" | "retrying" | "ready" | "exhausted";
  remainingSeconds: number;
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  const pending = new Promise<YouTubeNamespace>((resolve, reject) => {
    const requestUrl = widgetApiRetryUrl || API_URL;
    const script = document.querySelector<HTMLScriptElement>(`script[src="${requestUrl}"]`) || document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const rememberUnreadyWidget = () => {
      // iframe_api is a bootstrap: its internal loading flag prevents a second
      // copy from fetching a failed www-widgetapi script. Retry that exact
      // official script instead of mutating YT's private loading flags.
      const widget = document.querySelector<HTMLScriptElement>("script#www-widgetapi-script[src]");
      if (!widget || window.YT?.Player) return;
      const url = new URL(widget.src);
      if (url.origin === "https://www.youtube.com" && url.pathname.endsWith("/www-widgetapi.js")) {
        widgetApiRetryUrl = widget.src;
        widget.remove();
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener("error", failed);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
    };
    const failed = () => {
      rememberUnreadyWidget();
      cleanup();
      script.remove();
      reject(new YouTubeInitializationError("YT_API_LOAD_FAILED"));
    };
    const ready = () => {
      if (!window.YT?.Player) return;
      cleanup();
      widgetApiRetryUrl = null;
      resolve(window.YT);
      try { previous?.(); } catch { /* Another consumer cannot strand our loader. */ }
    };
    const timeout = window.setTimeout(() => {
      if (window.YT?.Player) { ready(); return; }
      rememberUnreadyWidget();
      cleanup();
      script.remove();
      reject(new YouTubeInitializationError("YT_API_TIMEOUT"));
    }, INIT_TIMEOUT_MS);
    window.onYouTubeIframeAPIReady = ready;
    script.addEventListener("error", failed, { once: true });
    if (!script.isConnected) {
      script.src = requestUrl;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  // Never cache a failed/pending-forever attempt for the lifetime of the App.
  apiPromise = pending;
  void pending.catch(() => { if (apiPromise === pending) apiPromise = null; });
  return apiPromise;
}

export interface YouTubePlayerHandle {
  getCurrentTime(): number;
  getDuration(): number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setPlaybackRate?(rate: number): void;
  getAudioState?(): { volume: number | null; muted: boolean | null };
  getDebugState?(): PlayerDebugInfo;
  switchToPlaylist?(videoIds: string[], videoId: string, seconds: number, play: boolean): void;
  switchToVideo?(videoId: string, seconds: number, play: boolean): void;
  nextVideo?(): void;
  retryInitialization?(): void;
}

interface YouTubePlayerProps {
  videoId: string;
  startAt?: number;
  volume?: number;
  playbackRate?: number;
  autoPlay?: boolean;
  playlist?: string[];
  playlistStartIndex?: number;
  onVideoChange?: (youtubeVideoId: string) => void;
  onStateChange?: (state: PlayerState) => void;
  onError?: (code?: number) => void;
  onAutoplayBlocked?: () => void;
  onInitializationChange?: (initialization: YouTubeInitialization) => void;
  onDiagnostic?: (type: string, detail: PlayerDebugInfo, errorCode?: string) => void;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  ({ videoId, startAt = 0, volume = 1, playbackRate = 1, autoPlay = false, playlist = [], playlistStartIndex = 0, onVideoChange, onStateChange, onError, onAutoplayBlocked, onInitializationChange, onDiagnostic }, ref) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<PlayerInstance | null>(null);
    const loadedVideoIdRef = useRef(videoId);
    const requestedVideoRef = useRef({ videoId, startAt, autoPlay });
    const stateCallbackRef = useRef(onStateChange);
    const errorCallbackRef = useRef(onError);
    const blockedCallbackRef = useRef(onAutoplayBlocked);
    const videoChangeCallbackRef = useRef(onVideoChange);
    const volumeRef = useRef(volume);
    const rateRef = useRef(playbackRate);
    const playlistRef = useRef({ playlist, playlistStartIndex });
    const initializationCallbacksRef = useRef({ onInitializationChange, onDiagnostic });
    const retryInitializationRef = useRef<() => void>(() => {});
    const initializationStateRef = useRef<YouTubeInitialization["state"]>("loading");
    stateCallbackRef.current = onStateChange;
    errorCallbackRef.current = onError;
    blockedCallbackRef.current = onAutoplayBlocked;
    videoChangeCallbackRef.current = onVideoChange;
    volumeRef.current = volume;
    rateRef.current = playbackRate;
    playlistRef.current = { playlist, playlistStartIndex };
    initializationCallbacksRef.current = { onInitializationChange, onDiagnostic };
    requestedVideoRef.current = { videoId, startAt, autoPlay };

    useEffect(() => {
      const player = playerRef.current;
      if (!player) return;
      const nextVolume = Math.round(Math.min(1, Math.max(0, volume)) * 100);
      player.setVolume(nextVolume);
      if (nextVolume === 0) player.mute();
      else player.unMute();
    }, [volume]);

    useEffect(() => {
      const player = playerRef.current as (PlayerInstance & { setPlaybackRate?: (rate: number) => void }) | null;
      if (player && typeof player.setPlaybackRate === "function") {
        player.setPlaybackRate(playbackRate);
      }
    }, [playbackRate]);

    // Keep one iframe/player instance alive while WatchPage advances through a
    // playlist. Recreating it makes iOS treat the next item as a new autoplay.
    useEffect(() => {
      const player = playerRef.current;
      if (!player) return;
      if (loadedVideoIdRef.current === videoId) {
        const currentState = player.getPlayerState?.();
        const state = currentState === 1 ? "PLAYING" : currentState === 2 ? "PAUSED" : currentState === 3 ? "BUFFERING" : undefined;
        if (state) stateCallbackRef.current?.(state);
        return;
      }
      loadedVideoIdRef.current = videoId;
      const requested = requestedVideoRef.current;
      const position = Math.max(0, Math.floor(requested.startAt));
      if (requested.autoPlay) player.loadVideoById(videoId, position);
      else player.cueVideoById(videoId, position);
    }, [videoId]);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => typeof playerRef.current?.getCurrentTime === "function" ? playerRef.current.getCurrentTime() || startAt : startAt,
      getDuration: () => typeof playerRef.current?.getDuration === "function" ? playerRef.current.getDuration() || 0 : 0,
      play: () => { if (typeof playerRef.current?.playVideo === "function") playerRef.current.playVideo(); },
      pause: () => { if (typeof playerRef.current?.pauseVideo === "function") playerRef.current.pauseVideo(); },
      seekTo: (seconds) => {
        if (typeof playerRef.current?.seekTo === "function") playerRef.current.seekTo(Math.max(0, seconds), true);
      },
      setPlaybackRate: (rate: number) => {
        const player = playerRef.current as (PlayerInstance & { setPlaybackRate?: (r: number) => void }) | null;
        if (typeof player?.setPlaybackRate === "function") {
          player.setPlaybackRate(rate);
        }
      },
      getAudioState: () => ({
        volume: typeof playerRef.current?.getVolume === "function" ? playerRef.current.getVolume() : null,
        muted: typeof playerRef.current?.isMuted === "function" ? playerRef.current.isMuted() : null,
      }),
      getDebugState: () => ({
        sourceKind: "youtube",
        currentTime: playerRef.current?.getCurrentTime?.() || 0,
        duration: playerRef.current?.getDuration?.() || 0,
        youtubePlayerState: playerRef.current?.getPlayerState?.(),
        playerVideoId: playerRef.current?.getVideoData?.().video_id,
        volume: playerRef.current?.getVolume?.(),
        muted: playerRef.current?.isMuted?.(),
        initializationState: initializationStateRef.current,
      }),
      switchToPlaylist: (videoIds, activeVideoId, seconds, play) => {
        const player = playerRef.current;
        if (!player || videoIds.length < 2 || !player.cuePlaylist || !player.loadPlaylist) return;
        const index = Math.max(0, videoIds.indexOf(activeVideoId));
        loadedVideoIdRef.current = activeVideoId;
        if (play) player.loadPlaylist(videoIds, index, Math.max(0, seconds));
        else player.cuePlaylist(videoIds, index, Math.max(0, seconds));
        player.setLoop?.(true);
      },
      switchToVideo: (activeVideoId, seconds, play) => {
        const player = playerRef.current;
        if (!player) return;
        loadedVideoIdRef.current = activeVideoId;
        player.setLoop?.(false);
        if (play) player.loadVideoById(activeVideoId, Math.max(0, seconds));
        else player.cueVideoById(activeVideoId, Math.max(0, seconds));
      },
      nextVideo: () => playerRef.current?.nextVideo?.(),
      retryInitialization: () => retryInitializationRef.current(),
    }), [startAt]);

    useEffect(() => {
      let cancelled = false;
      let player: PlayerInstance | null = null;
      let generation = 0;
      let attempts = 0;
      let deadline = 0;
      let ready = false;
      let phase: YouTubeInitialization["state"] = "loading";
      let lastAttemptAt = 0;
      let readyTimer: number | undefined;
      let retryTimer: number | undefined;
      let deadlineTimer: number | undefined;
      let ticker: number | undefined;
      const report = (state: YouTubeInitialization["state"]) => {
        phase = state;
        initializationStateRef.current = state;
        initializationCallbacksRef.current.onInitializationChange?.({
          state, remainingSeconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
        });
      };
      const diagnostic = (type: string, state: string, errorCode?: string) => {
        initializationCallbacksRef.current.onDiagnostic?.(type, {
          state, sourceKind: "youtube", retryNumber: Math.max(0, attempts - 1),
          retryRemainingMs: Math.max(0, deadline - Date.now()),
          errorOperation: "youtube_initialization",
        }, errorCode);
      };
      const clearTimers = () => {
        window.clearTimeout(readyTimer);
        window.clearTimeout(retryTimer);
        window.clearTimeout(deadlineTimer);
        window.clearInterval(ticker);
      };
      const destroyUnreadyPlayer = () => {
        playerRef.current = null;
        try { player?.destroy(); } catch { /* An incompletely created iframe may already be gone. */ }
        player = null;
        hostRef.current?.replaceChildren();
      };
      const exhausted = () => {
        if (cancelled || ready || phase === "exhausted") return;
        generation++;
        clearTimers();
        destroyUnreadyPlayer();
        report("exhausted");
        diagnostic("retry_exhausted", "youtube_initialization_exhausted", "YT_INITIALIZATION_EXHAUSTED");
      };
      const failed = (code: string) => {
        if (cancelled || ready || phase === "exhausted") return;
        generation++;
        window.clearTimeout(readyTimer);
        destroyUnreadyPlayer();
        diagnostic("youtube_error", "youtube_initialization_failed", code);
        if (Date.now() >= deadline) { exhausted(); return; }
        report("retrying");
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(attempt, INIT_RETRY_MS);
      };
      function attempt() {
        if (cancelled || ready || phase === "exhausted") return;
        if (Date.now() >= deadline) { exhausted(); return; }
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        lastAttemptAt = Date.now();
        const currentGeneration = ++generation;
        attempts++;
        report(attempts === 1 ? "loading" : "retrying");
        diagnostic(attempts === 1 ? "player_created" : "retry_started", "youtube_api_requested");
        void loadYouTubeApi().then((YT) => {
          if (cancelled || currentGeneration !== generation || !hostRef.current) return;
          if (Date.now() >= deadline) { exhausted(); return; }
          diagnostic("player_created", "youtube_api_ready");
          // YT replaces its host node. Keep React's outer container intact so
          // only a failed initialization can create a fresh mount point.
          const mount = document.createElement("div");
          hostRef.current.replaceChildren(mount);
          const { videoId, startAt } = requestedVideoRef.current;
          diagnostic("player_created", "youtube_iframe_requested");
          readyTimer = window.setTimeout(() => failed("YT_PLAYER_READY_TIMEOUT"),
            Math.min(INIT_TIMEOUT_MS, deadline - Date.now()));
          player = new YT.Player(mount, {
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
              if (cancelled || currentGeneration !== generation || ready) return;
              if (Date.now() >= deadline) { exhausted(); return; }
              ready = true;
              clearTimers();
              playerRef.current = event.target;
              loadedVideoIdRef.current = videoId;
              const initialVolume = Math.round(Math.min(1, Math.max(0, volumeRef.current)) * 100);
              event.target.setVolume(initialVolume);
              if (initialVolume === 0) event.target.mute();
              else event.target.unMute();
              (event.target as PlayerInstance & { setPlaybackRate?: (rate: number) => void }).setPlaybackRate?.(rateRef.current);
              report("ready");
              diagnostic("player_created", "youtube_iframe_ready");
              const requested = requestedVideoRef.current;
              const { playlist, playlistStartIndex } = playlistRef.current;
              const activePlaylist = playlist.length > 1 && playlist.includes(requested.videoId) ? playlist : [];
              if (activePlaylist.length && event.target.cuePlaylist && event.target.loadPlaylist) {
                const requestedIndex = activePlaylist.indexOf(requested.videoId);
                const index = requestedIndex >= 0 ? requestedIndex : Math.max(0, playlistStartIndex);
                const position = Math.max(0, Math.floor(requested.startAt));
                loadedVideoIdRef.current = requested.videoId;
                if (requested.autoPlay) event.target.loadPlaylist(activePlaylist, index, position);
                else event.target.cuePlaylist(activePlaylist, index, position);
                event.target.setLoop?.(true);
                stateCallbackRef.current?.("READY");
                return;
              }
              if (requested.videoId !== videoId) {
                loadedVideoIdRef.current = requested.videoId;
                const position = Math.max(0, Math.floor(requested.startAt));
                if (requested.autoPlay) event.target.loadVideoById(requested.videoId, position);
                else event.target.cueVideoById(requested.videoId, position);
              } else if (startAt > 0) {
                event.target.seekTo(startAt, true);
              }
              if (requested.videoId === videoId && requested.autoPlay) {
                event.target.playVideo();
              } else if (requested.videoId === videoId) {
                event.target.pauseVideo();
              }
              stateCallbackRef.current?.("READY");
            },
            onStateChange: (event: PlayerEvent) => {
              if (cancelled || currentGeneration !== generation) return;
              const state: PlayerState | undefined = ({ 0: "ENDED", 1: "PLAYING", 2: "PAUSED", 3: "BUFFERING" } as Record<number, PlayerState>)[event.data];
              if (state === "PLAYING") {
                const intendedVolume = Math.round(Math.min(1, Math.max(0, volumeRef.current)) * 100);
                event.target.setVolume(intendedVolume);
                if (intendedVolume === 0) event.target.mute();
                else event.target.unMute();
                const activeVideoId = event.target.getVideoData?.().video_id;
                if (activeVideoId) {
                  loadedVideoIdRef.current = activeVideoId;
                  videoChangeCallbackRef.current?.(activeVideoId);
                }
              }
              if (state) stateCallbackRef.current?.(state);
            },
            onError: (event: PlayerEvent) => {
              if (cancelled || currentGeneration !== generation) return;
              // Real video errors (private/deleted/not embeddable) are not a
              // transport initialization failure and must not cause reload loops.
              ready = true;
              clearTimers();
              playerRef.current = event.target;
              report("ready");
              errorCallbackRef.current?.(event.data);
            },
            onAutoplayBlocked: () => {
              if (!cancelled && currentGeneration === generation) blockedCallbackRef.current?.();
            },
          },
        });
        }).catch((error: unknown) => {
          if (!cancelled && currentGeneration === generation) {
            failed(error instanceof YouTubeInitializationError ? error.code : "YT_PLAYER_CREATE_FAILED");
          }
        });
      }
      const startCycle = () => {
        if (cancelled || ready) return;
        clearTimers();
        deadline = Date.now() + INIT_BUDGET_MS;
        attempts = 0;
        phase = "loading";
        deadlineTimer = window.setTimeout(exhausted, INIT_BUDGET_MS);
        ticker = window.setInterval(() => {
          if (Date.now() >= deadline) exhausted();
          else report(phase);
        }, 1000);
        attempt();
      };
      retryInitializationRef.current = () => { if (phase === "exhausted") startCycle(); };
      const online = () => {
        // Online events never extend the deadline or overlap an active attempt.
        if (phase === "retrying" && retryTimer !== undefined && Date.now() - lastAttemptAt >= INIT_RETRY_MS) attempt();
      };
      window.addEventListener("online", online);
      startCycle();
      return () => {
        cancelled = true;
        generation++;
        clearTimers();
        window.removeEventListener("online", online);
        retryInitializationRef.current = () => {};
        playerRef.current = null;
        try { player?.destroy(); } catch { /* A partial iframe may already be removed. */ }
      };
    }, []);

    return <div className="youtube-player" ref={hostRef} aria-label="YouTube 影片播放器" />;
  },
);
YouTubePlayer.displayName = "YouTubePlayer";
