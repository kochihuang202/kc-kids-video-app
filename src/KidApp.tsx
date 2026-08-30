import { flushSync } from "react-dom";
import { ArrowLeft, Check, MessageCircle, Pause, Play, RefreshCw, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { YouTubePlayer, type PlayerState, type YouTubePlayerHandle } from "./components/YouTubePlayer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { Button, buttonVariants } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { activityRepository, ApiError, contentRepository, deviceRepository } from "./data/repositories";
import { cn, formatPosition } from "./lib/utils";
import type { Category, DeviceStatus, UpdateViewSessionInput, VideoFixture } from "./types";

const prompts = ["我學到", "我覺得", "我想問", "我發現"];

function ParentGate() {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);
  const cancel = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const start = () => {
    cancel();
    timerRef.current = window.setTimeout(() => navigate("/parent"), 3000);
  };
  useEffect(() => cancel, []);
  return (
    <button type="button" className="brand-gate" aria-label="家長入口，請長按三秒"
      onPointerDown={start} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onClick={(event) => { if (event.detail === 0) navigate("/parent"); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate("/parent"); }
      }}
      onContextMenu={(event) => event.preventDefault()}>
      <span className="brand-mark" aria-hidden="true">小</span><span>小小選片</span>
    </button>
  );
}

function LoadingCard({ label = "正在準備…" }: { label?: string }) {
  return <div className="kid-loading" role="status"><span className="loading-dot" />{label}</div>;
}

function KidError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="kid-error" role="alert"><p>{message}</p><Button variant="secondary" onClick={retry}><RefreshCw />再試一次</Button></div>;
}

export function HomePage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [nextCategories, nextStatus] = await Promise.all([contentRepository.getCategories(), deviceRepository.status()]);
      setCategories(nextCategories);
      setStatus(nextStatus);
      if (!nextStatus.authorized && localStorage.getItem("device_setup_notice_seen") !== "1") setNotice(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "內容暫時載入不了。");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const dismissNotice = () => { localStorage.setItem("device_setup_notice_seen", "1"); setNotice(false); };
  return (
    <main className="kid-shell home-page">
      <header className="home-header"><ParentGate /><h1>今天想看什麼？</h1></header>
      {notice && (
        <aside className="device-notice" role="status">
          <div><strong>這台裝置還沒設定好</strong><p>影片可以看；要保存想法與觀看紀錄，請家長先到設定授權。</p></div>
          <div><Button variant="secondary" onClick={dismissNotice}>知道了</Button><Link to="/parent/settings">家長設定</Link></div>
        </aside>
      )}
      {!categories && !error && <LoadingCard label="正在拿出選片盒…" />}
      {error && <KidError message={error} retry={() => void load()} />}
      {categories && (
        <section className="category-grid" aria-label="影片分類">
          {categories.map((category) => (
            <Link className={`category-card tone-${category.tone}`} to={`/category/${category.id}`} key={category.id}>
              <span className="category-icon" aria-hidden="true">{category.icon}</span><span>{category.name}</span>
            </Link>
          ))}
        </section>
      )}
      {status?.authorized && <p className="device-ready" aria-label={`已授權裝置 ${status.device?.name}`}>這台 iPad 已準備好 ✓</p>}
    </main>
  );
}

export function CategoryPage() {
  const { categoryId = "" } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [videos, setVideos] = useState<VideoFixture[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [categories, nextVideos] = await Promise.all([contentRepository.getCategories(), contentRepository.getVideos(categoryId)]);
      const nextCategory = categories.find((item) => item.id === categoryId);
      if (!nextCategory) throw new ApiError("找不到這個分類。", 404);
      setCategory(nextCategory); setVideos(nextVideos);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "影片暫時載入不了。"); }
  }, [categoryId]);
  useEffect(() => { void load(); }, [load]);
  return (
    <main className="kid-shell category-page">
      <Link className="back-link" to="/"><ArrowLeft />回去</Link>
      {!category && !error && <LoadingCard label="正在找影片…" />}
      {error && <KidError message={error} retry={() => void load()} />}
      {category && videos && <>
        <header className="section-heading"><span aria-hidden="true">{category.icon}</span><h1>{category.name}</h1></header>
        <section className="video-grid" aria-label={`${category.name}影片`}>
          {videos.map((video) => (
            <Link className="video-card" to={`/watch/${video.id}`} key={video.id}>
              <img src={video.thumbnailUrl} alt={`${video.parentLabel}影片縮圖`} />
              <div><h2>{video.parentLabel}</h2><p>{video.youtubeTitle}</p></div>
            </Link>
          ))}
        </section>
      </>}
    </main>
  );
}

interface Capability { id: string; writeToken: string }
interface PendingHeartbeat { sessionId: string; payload: UpdateViewSessionInput; keepalive: boolean }

export function WatchPage() {
  const { videoId = "" } = useParams();
  const initialParams = new URLSearchParams(window.location.search);
  const initialPosition = Math.max(0, Number(initialParams.get("at") || initialParams.get("t") || 0) || 0);
  const [video, setVideo] = useState<VideoFixture | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const capabilityRef = useRef<Capability | null>(null);
  const sessionPromiseRef = useRef<Promise<Capability | null> | null>(null);
  const clientSessionIdRef = useRef(crypto.randomUUID());
  const heartbeatSeqRef = useRef(0);
  const queueRef = useRef<PendingHeartbeat[]>([]);
  const drainingRef = useRef(false);
  const playingStartPerfRef = useRef<number | null>(null);
  const playingStartWallRef = useRef<string | null>(null);
  const playerStateRef = useRef<PlayerState>("READY");
  const successTimerRef = useRef<number | null>(null);
  const draftKey = `draft_note_${videoId || "unknown"}`;
  const initialDraft = localStorage.getItem(draftKey) || "";
  const [noteMode, setNoteMode] = useState(initialParams.get("mode") === "note");
  const [capturedPosition, setCapturedPosition] = useState(initialPosition);
  const [content, setContent] = useState("");
  const [draftPrompt, setDraftPrompt] = useState(noteMode && !!initialDraft);
  const [draftReady, setDraftReady] = useState(!initialDraft);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [authPrompt, setAuthPrompt] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [showDictationTip, setShowDictationTip] = useState(localStorage.getItem("dictation_tip_seen") !== "1");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPos, setCurrentPos] = useState(initialPosition);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(initialPosition);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [nextVideo, nextDevice] = await Promise.all([contentRepository.getVideo(videoId), deviceRepository.status()]);
      setVideo(nextVideo); setDevice(nextDevice);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "影片暫時載入不了。"); }
  }, [videoId]);
  useEffect(() => { void load(); }, [load]);

  const ensureSession = useCallback(async () => {
    if (!video || !device?.authorized) return null;
    if (capabilityRef.current) return capabilityRef.current;
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = activityRepository.startViewSession(video.id, clientSessionIdRef.current)
        .then(({ id, writeToken }) => { capabilityRef.current = { id, writeToken }; return capabilityRef.current; })
        .catch(() => null)
        .finally(() => { sessionPromiseRef.current = null; });
    }
    return sessionPromiseRef.current;
  }, [device?.authorized, video]);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length) {
        const item = queueRef.current[0];
        try {
          await activityRepository.updateViewSession(item.sessionId, item.payload, item.keepalive);
          queueRef.current.shift();
        } catch { break; }
      }
    } finally { drainingRef.current = false; }
  }, []);

  const flushTracking = useCallback(async (status: "active" | "ended" = "active", keepalive = false) => {
    if (!device?.authorized) return;
    const nowPerf = performance.now();
    const nowIso = new Date().toISOString();
    let deltaSeconds = 0;
    let intervalStartedAt: string | null = null;
    if (playingStartPerfRef.current !== null) {
      deltaSeconds = Math.max(0, Math.min(60, Math.round((nowPerf - playingStartPerfRef.current) / 1000)));
      intervalStartedAt = playingStartWallRef.current;
      playingStartPerfRef.current = nowPerf;
      playingStartWallRef.current = nowIso;
    }
    const capability = capabilityRef.current || await ensureSession();
    if (!capability) return;
    const payload: UpdateViewSessionInput = {
      writeToken: capability.writeToken,
      heartbeatSeq: ++heartbeatSeqRef.current,
      deltaSeconds,
      positionSeconds: Math.max(0, Math.round(playerRef.current?.getCurrentTime() || capturedPosition)),
      intervalStartedAt,
      intervalEndedAt: intervalStartedAt ? nowIso : null,
      status,
    };
    queueRef.current.push({ sessionId: capability.id, payload, keepalive });
    void drainQueue();
  }, [capturedPosition, device?.authorized, drainQueue, ensureSession]);

  const handlePlayerState = useCallback((state: PlayerState) => {
    playerStateRef.current = state;
    setIsPlaying(state === "PLAYING");
    if (state === "PLAYING") {
      if (playingStartPerfRef.current === null) {
        playingStartPerfRef.current = performance.now(); playingStartWallRef.current = new Date().toISOString();
      }
      void ensureSession();
    } else if (state === "PAUSED" || state === "ENDED") {
      void flushTracking(state === "ENDED" ? "ended" : "active");
      playingStartPerfRef.current = null; playingStartWallRef.current = null;
    }
  }, [ensureSession, flushTracking]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (playerStateRef.current === "PLAYING") {
        void flushTracking();
        if (playerRef.current) {
          const time = playerRef.current.getCurrentTime();
          if (!isDragging) setCurrentPos(time);
          const dur = playerRef.current.getDuration();
          if (dur > 0 && dur !== totalDuration) setTotalDuration(dur);
        }
      } else {
        void drainQueue();
      }
    }, 500);
    const onVisibility = () => { if (document.visibilityState === "hidden") void flushTracking("active", true); };
    const onPageHide = () => { void flushTracking("active", true); };
    document.addEventListener("visibilitychange", onVisibility); window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", onPageHide);
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    };
  }, [drainQueue, flushTracking, isDragging, totalDuration]);

  const togglePlay = () => {
    if (playerStateRef.current === "PLAYING") {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const seekRelative = (delta: number) => {
    const current = playerRef.current?.getCurrentTime() ?? currentPos;
    const max = totalDuration > 0 ? totalDuration : 999999;
    const target = Math.max(0, Math.min(max, current + delta));
    playerRef.current?.seekTo(target);
    setCurrentPos(target);
    setCapturedPosition(target);
  };

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(event.target.value);
    setDragPos(val);
    setCurrentPos(val);
  };

  const handleSliderCommit = (val: number) => {
    setIsDragging(false);
    playerRef.current?.seekTo(val);
    setCurrentPos(val);
    setCapturedPosition(val);
  };

  useEffect(() => {
    if (!noteMode || !window.visualViewport) return;
    const updateHeight = () => document.documentElement.style.setProperty("--visual-height", `${window.visualViewport!.height}px`);
    updateHeight(); window.visualViewport.addEventListener("resize", updateHeight);
    return () => { window.visualViewport?.removeEventListener("resize", updateHeight); document.documentElement.style.removeProperty("--visual-height"); };
  }, [noteMode]);
  useEffect(() => {
    if (!noteMode || !draftReady) return;
    if (content) localStorage.setItem(draftKey, content); else localStorage.removeItem(draftKey);
  }, [content, draftKey, draftReady, noteMode]);
  useEffect(() => {
    if (noteMode && !draftPrompt && draftReady) window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  }, [draftPrompt, draftReady, noteMode]);

  if (!video && !loadError) return <main className="watch-page watch-loading"><LoadingCard label="正在準備播放器…" /></main>;
  if (loadError) return <main className="kid-shell"><KidError message={loadError} retry={() => void load()} /></main>;
  if (!video) return <Navigate to="/" replace />;

  const setPlayerUrl = (position: number, mode?: "note") => {
    const params = new URLSearchParams(); params.set(mode ? "at" : "t", String(Math.max(0, Math.round(position))));
    if (mode) params.set("mode", "note");
    const nextUrl = `${window.location.pathname}?${params}`;
    if (mode) window.history.pushState({}, "", nextUrl); else window.history.replaceState({}, "", nextUrl);
  };
  const enterNote = async () => {
    if (!device?.authorized) { setAuthPrompt(true); return; }
    const capability = await ensureSession();
    if (!capability) { setSaveError("目前無法建立保存空間，請檢查網路後再試一次。"); return; }
    const position = Math.max(0, playerRef.current?.getCurrentTime() || capturedPosition);
    playerRef.current?.pause(); void flushTracking();
    const draft = localStorage.getItem(draftKey) || "";
    flushSync(() => {
      setCapturedPosition(position); setSaveError(""); setSaved(false); setContent("");
      setDraftPrompt(!!draft); setDraftReady(!draft); setNoteMode(true);
    });
    setPlayerUrl(position, "note");
  };
  const leaveNote = (clearDraft = false) => {
    if (clearDraft) localStorage.removeItem(draftKey);
    setPlayerUrl(capturedPosition);
    flushSync(() => {
      setNoteMode(false); setContent(""); setDraftPrompt(false); setDraftReady(true);
      setCancelOpen(false); setSaveError(""); setSaved(false);
    });
    playerRef.current?.seekTo(capturedPosition);
  };
  const continueDraft = () => { setContent(localStorage.getItem(draftKey) || ""); setDraftPrompt(false); setDraftReady(true); };
  const discardDraft = () => { localStorage.removeItem(draftKey); setContent(""); setDraftPrompt(false); setDraftReady(true); };
  const insertPrompt = (prompt: string) => {
    const start = textareaRef.current?.selectionStart ?? content.length;
    const end = textareaRef.current?.selectionEnd ?? content.length;
    const insertion = `${prompt} `; setContent(`${content.slice(0, start)}${insertion}${content.slice(end)}`);
    window.setTimeout(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(start + insertion.length, start + insertion.length); }, 0);
  };
  const saveNote = async () => {
    if (!content.trim() || saving) return;
    setSaving(true); setSaveError("");
    try {
      const capability = capabilityRef.current || await ensureSession();
      if (!capability) throw new Error("無法確認這台裝置的授權。");
      await activityRepository.saveNote({
        videoId: video.id, viewSessionId: capability.id, writeToken: capability.writeToken,
        content: content.trim(), videoPositionSeconds: Math.round(capturedPosition),
      });
      localStorage.removeItem(draftKey); localStorage.setItem("dictation_tip_seen", "1");
      setShowDictationTip(false); setSaved(true); successTimerRef.current = window.setTimeout(() => leaveNote(false), 1000);
    } catch {
      setSaveError("還沒存到雲端；內容已先保存在這台 iPad，請檢查網路後重試。");
    } finally { setSaving(false); }
  };

  const activePos = isDragging ? dragPos : currentPos;
  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (activePos / totalDuration) * 100)) : 0;

  return (
    <main className={cn("watch-page", noteMode && "note-is-open")}>
      <section className={cn("player-surface", noteMode && "player-hidden")} aria-hidden={noteMode}>
        <div className="player-stage">
          {/* YouTube iframe — always mounted so seeking/state works */}
          <YouTubePlayer
            ref={playerRef}
            videoId={video.youtubeVideoId}
            startAt={initialPosition}
            onStateChange={handlePlayerState}
            onError={() => setPlayerError(true)}
          />

          {/* Opaque poster: covers the entire iframe when not playing,
              completely hiding YouTube's title bar, logo, and related-video buttons.
              Fades away the instant real playback starts. */}
          <div
            className={cn("poster-overlay", isPlaying && "poster-hidden")}
            onClick={togglePlay}
            aria-hidden={isPlaying}
          >
            <img
              src={video.thumbnailUrl}
              alt=""
              className="poster-thumb"
              draggable={false}
            />
            {!playerError && (
              <button
                type="button"
                className="stage-big-play"
                aria-label="播放"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
              >
                <Play />
              </button>
            )}
          </div>

          {playerError && (
            <div className="player-error" role="alert">
              <p>影片暫時載入不了。</p>
              <Button variant="secondary" onClick={() => window.location.reload()}><RotateCcw />再試一次</Button>
            </div>
          )}
        </div>

        <div className="kid-player-controls" role="region" aria-label="影片播放控制">
          <div className="kid-scrubber-row">
            <span className="time-text">{formatPosition(activePos)}</span>
            <div className="scrubber-wrapper">
              <input
                type="range"
                min={0}
                max={totalDuration > 0 ? totalDuration : 100}
                step={0.5}
                value={activePos}
                className="kid-slider"
                aria-label="影片播放進度"
                onPointerDown={() => {
                  setIsDragging(true);
                  setDragPos(currentPos);
                }}
                onChange={handleSliderChange}
                onPointerUp={(e) => handleSliderCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => handleSliderCommit(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => handleSliderCommit(Number((e.target as HTMLInputElement).value))}
                style={{
                  backgroundSize: `${progressPercent}% 100%`,
                }}
              />
            </div>
            <span className="time-text">{totalDuration > 0 ? formatPosition(totalDuration) : "--:--"}</span>
          </div>

          <footer className="player-actions">
            <Link
              className="player-back"
              to={`/category/${video.categoryId}`}
              onClick={() => {
                playerRef.current?.pause();
                void flushTracking("ended");
              }}
            >
              <ArrowLeft />回去
            </Link>

            <div className="playback-buttons" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                variant="secondary"
                className="seek-btn"
                aria-label="倒退 10 秒"
                onClick={() => seekRelative(-10)}
              >
                <RotateCcw />
                <span>10秒</span>
              </Button>

              <Button
                type="button"
                className={cn("main-play-btn", isPlaying ? "btn-playing" : "btn-paused")}
                aria-label={isPlaying ? "暫停" : "播放"}
                onClick={togglePlay}
              >
                {isPlaying ? <Pause /> : <Play />}
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="seek-btn"
                aria-label="前進 10 秒"
                onClick={() => seekRelative(10)}
              >
                <RotateCw />
                <span>10秒</span>
              </Button>
            </div>

            <Button className="speak-button" size="large" onClick={() => void enterNote()}>
              <MessageCircle />我想說
            </Button>
          </footer>
        </div>
      </section>
      {noteMode && <section className="note-screen" aria-label="我想說">
        {draftPrompt ? <div className="draft-restore"><div className="draft-icon"><MessageCircle /></div><h1>剛剛還有一段<br />沒有存起來。</h1><div className="draft-actions"><Button size="large" onClick={continueDraft}>繼續</Button><Button size="large" variant="quiet" onClick={discardDraft}>不要了</Button></div></div> :
          <div className="note-layout">
            <header className="note-header"><p>💬 我想說</p><h1>你想到什麼？</h1></header>
            <div className="note-input-area"><Textarea ref={textareaRef} value={content} onChange={(event) => setContent(event.target.value)} placeholder="在這裡說出你的想法……" aria-label="想法內容" maxLength={4000} />
              {showDictationTip && <p className="dictation-tip"><strong>想用說的嗎？</strong><span>按鍵盤上的 🎙，直接把想說的話說出來。</span></p>}
              <div className="prompt-row">{prompts.map((prompt) => <Button variant="secondary" size="chip" key={prompt} onClick={() => insertPrompt(prompt)}>{prompt}……</Button>)}</div>
            </div>
            <footer className="note-actions"><Button variant="quiet" size="large" onClick={() => content.trim() ? setCancelOpen(true) : leaveNote(true)}>不要了</Button><Button size="large" onClick={() => void saveNote()} disabled={!content.trim() || saving}><Check />{saving ? "存入中…" : "存起來"}</Button></footer>
            {saveError && <p className="save-error" role="alert">{saveError}</p>}{saved && <div className="save-success" role="status"><Check />存好了！</div>}
          </div>}
      </section>}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>這段還沒有存起來。</AlertDialogTitle><AlertDialogDescription>要繼續說，還是真的不要了？</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className={buttonVariants({ variant: "secondary", size: "large" })}>繼續說</AlertDialogCancel><AlertDialogAction className={buttonVariants({ variant: "danger", size: "large" })} onClick={() => leaveNote(true)}>不要了</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={authPrompt} onOpenChange={setAuthPrompt}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>請家長先設定這台裝置</AlertDialogTitle><AlertDialogDescription>影片可以繼續看，但保存想法前，需要家長到設定頁授權這台 iPad。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className={buttonVariants({ variant: "secondary" })}>先不要</AlertDialogCancel><AlertDialogAction className={buttonVariants()} asChild><Link to="/parent/settings">家長設定</Link></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}
