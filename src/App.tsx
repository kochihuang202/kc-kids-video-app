import { flushSync } from "react-dom";
import {
  ArrowLeft,
  Check,
  Clock3,
  Film,
  Home,
  MessageCircle,
  Play,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { YouTubePlayer, type PlayerState, type YouTubePlayerHandle } from "./components/YouTubePlayer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { Button, buttonVariants } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { activityRepository, contentRepository } from "./data/repositories";
import { addPlayedSeconds, cn, formatClock, formatPosition, getLocalDayRange } from "./lib/utils";
import type { TodayDashboard } from "./types";

const prompts = ["我學到", "我覺得", "我想問", "我發現"];

function formatPlayedDuration(seconds: number) {
  if (seconds <= 0) return "0 分鐘";
  if (seconds < 60) return "少於 1 分鐘";
  return `${Math.round(seconds / 60)} 分鐘`;
}

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
    <button
      type="button"
      className="brand-gate"
      aria-label="家長入口，請長按三秒"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClick={(event) => { if (event.detail === 0) navigate("/parent"); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate("/parent");
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="brand-mark" aria-hidden="true">小</span>
      <span>小小選片</span>
    </button>
  );
}

function HomePage() {
  const categories = contentRepository.getCategories();
  return (
    <main className="kid-shell home-page">
      <header className="home-header">
        <ParentGate />
        <h1>今天想看什麼？</h1>
      </header>
      <section className="category-grid" aria-label="影片分類">
        {categories.map((category) => (
          <Link className={`category-card tone-${category.tone}`} to={`/category/${category.id}`} key={category.id}>
            <span className="category-icon" aria-hidden="true">{category.icon}</span>
            <span>{category.name}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

function CategoryPage() {
  const { categoryId } = useParams();
  const category = contentRepository.getCategories().find((item) => item.id === categoryId);
  if (!category) return <Navigate to="/" replace />;
  const videos = contentRepository.getVideos(category.id);
  return (
    <main className="kid-shell category-page">
      <Link className="back-link" to="/"><ArrowLeft aria-hidden="true" />回去</Link>
      <header className="section-heading">
        <span aria-hidden="true">{category.icon}</span>
        <h1>{category.name}</h1>
      </header>
      <section className="video-grid" aria-label={`${category.name}影片`}>
        {videos.map((video) => (
          <Link className="video-card" to={`/watch/${video.id}`} key={video.id}>
            <img src={video.thumbnailUrl} alt={`${video.parentLabel}影片縮圖`} />
            <div>
              <h2>{video.parentLabel}</h2>
              <p>{video.youtubeTitle}</p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}

function WatchPage() {
  const { videoId } = useParams();
  const video = videoId ? contentRepository.getVideo(videoId) : undefined;
  const initialParams = new URLSearchParams(window.location.search);
  const initialPosition = Math.max(0, Number(initialParams.get("at") || initialParams.get("t") || 0) || 0);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const playedSecondsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
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
  const [playerError, setPlayerError] = useState(false);
  const [showDictationTip, setShowDictationTip] = useState(localStorage.getItem("dictation_tip_seen") !== "1");

  const accrue = useCallback(() => {
    if (lastTickRef.current === null) return;
    const now = performance.now();
    playedSecondsRef.current = addPlayedSeconds(playedSecondsRef.current, now - lastTickRef.current);
    lastTickRef.current = now;
  }, []);

  const ensureSession = useCallback(async () => {
    if (!video) return null;
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = activityRepository.startViewSession(video.id)
        .then(({ id }) => {
          sessionIdRef.current = id;
          return id;
        })
        .catch(() => null)
        .finally(() => { sessionPromiseRef.current = null; });
    }
    return sessionPromiseRef.current;
  }, [video]);

  const flushTracking = useCallback(async (keepalive = false) => {
    accrue();
    const id = sessionIdRef.current || await sessionPromiseRef.current;
    if (!id) return;
    await activityRepository.updateViewSession(id, {
      playedSeconds: playedSecondsRef.current,
      lastPositionSeconds: playerRef.current?.getCurrentTime() || capturedPosition,
    }, keepalive).catch(() => undefined);
  }, [accrue, capturedPosition]);

  const handlePlayerState = useCallback((state: PlayerState) => {
    playerStateRef.current = state;
    if (state === "PLAYING") {
      if (lastTickRef.current === null) lastTickRef.current = performance.now();
      void ensureSession();
      return;
    }
    if (state === "PAUSED" || state === "ENDED") {
      accrue();
      lastTickRef.current = null;
      void flushTracking();
    }
  }, [accrue, ensureSession, flushTracking]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (playerStateRef.current === "PLAYING") void flushTracking();
    }, 15_000);
    const onPageHide = () => { void flushTracking(true); };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    };
  }, [flushTracking]);

  useEffect(() => {
    const syncFromHistory = () => {
      const params = new URLSearchParams(window.location.search);
      setNoteMode(params.get("mode") === "note");
      setCapturedPosition(Math.max(0, Number(params.get("at") || params.get("t") || 0) || 0));
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  useEffect(() => {
    if (!noteMode || !window.visualViewport) return;
    const updateHeight = () => document.documentElement.style.setProperty("--visual-height", `${window.visualViewport!.height}px`);
    updateHeight();
    window.visualViewport.addEventListener("resize", updateHeight);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateHeight);
      document.documentElement.style.removeProperty("--visual-height");
    };
  }, [noteMode]);

  useEffect(() => {
    if (!noteMode || !draftReady) return;
    if (content) localStorage.setItem(draftKey, content);
    else localStorage.removeItem(draftKey);
  }, [content, draftKey, draftReady, noteMode]);

  useEffect(() => {
    if (!noteMode || draftPrompt || !draftReady) return;
    window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  }, [draftPrompt, draftReady, noteMode]);

  if (!video) return <Navigate to="/" replace />;

  const setPlayerUrl = (position: number, mode?: "note") => {
    const params = new URLSearchParams();
    params.set(mode ? "at" : "t", String(Math.max(0, Math.round(position))));
    if (mode) params.set("mode", "note");
    const nextUrl = `${window.location.pathname}?${params}`;
    if (mode) window.history.pushState({}, "", nextUrl);
    else window.history.replaceState({}, "", nextUrl);
  };

  const enterNote = () => {
    const position = Math.max(0, playerRef.current?.getCurrentTime() || capturedPosition);
    playerRef.current?.pause();
    void flushTracking();
    const draft = localStorage.getItem(draftKey) || "";
    flushSync(() => {
      setCapturedPosition(position);
      setSaveError("");
      setSaved(false);
      setContent("");
      setDraftPrompt(!!draft);
      setDraftReady(!draft);
      setNoteMode(true);
    });
    setPlayerUrl(position, "note");
    if (!draft) textareaRef.current?.focus({ preventScroll: true });
  };

  const leaveNote = (clearDraft = false) => {
    if (clearDraft) localStorage.removeItem(draftKey);
    setPlayerUrl(capturedPosition);
    flushSync(() => {
      setNoteMode(false);
      setContent("");
      setDraftPrompt(false);
      setDraftReady(true);
      setCancelOpen(false);
      setSaveError("");
      setSaved(false);
    });
    playerRef.current?.seekTo(capturedPosition);
  };

  const continueDraft = () => {
    setContent(localStorage.getItem(draftKey) || "");
    setDraftPrompt(false);
    setDraftReady(true);
    window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  };

  const discardDraft = () => {
    localStorage.removeItem(draftKey);
    setContent("");
    setDraftPrompt(false);
    setDraftReady(true);
    window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  };

  const insertPrompt = (prompt: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? content.length;
    const insertion = `${prompt} `;
    const next = `${content.slice(0, start)}${insertion}${content.slice(end)}`;
    setContent(next);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  const requestCancel = () => {
    if (!content.trim()) leaveNote(true);
    else setCancelOpen(true);
  };

  const saveNote = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await activityRepository.saveNote({
        videoId: video.id,
        content: content.trim(),
        videoPositionSeconds: capturedPosition,
      });
      localStorage.removeItem(draftKey);
      localStorage.setItem("dictation_tip_seen", "1");
      setShowDictationTip(false);
      setSaved(true);
      successTimerRef.current = window.setTimeout(() => leaveNote(false), 1000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "還沒存好，請再試一次。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={cn("watch-page", noteMode && "note-is-open")}>
      <section className={cn("player-surface", noteMode && "player-hidden")} aria-hidden={noteMode}>
        <div className="player-stage">
          <YouTubePlayer
            ref={playerRef}
            videoId={video.youtubeVideoId}
            startAt={initialPosition}
            onStateChange={handlePlayerState}
            onError={() => setPlayerError(true)}
          />
          {playerError && (
            <div className="player-error" role="alert">
              <p>影片暫時載入不了。</p>
              <Button variant="secondary" onClick={() => window.location.reload()}><RotateCcw aria-hidden="true" />再試一次</Button>
            </div>
          )}
        </div>
        <footer className="player-actions">
          <Link className="player-back" to={`/category/${video.categoryId}`} onClick={() => { playerRef.current?.pause(); void flushTracking(); }}>
            <ArrowLeft aria-hidden="true" />回去
          </Link>
          <Button className="speak-button" size="large" onClick={enterNote}><MessageCircle aria-hidden="true" />我想說</Button>
        </footer>
      </section>

      {noteMode && (
        <section className="note-screen" aria-label="我想說">
          {draftPrompt ? (
            <div className="draft-restore">
              <div className="draft-icon" aria-hidden="true"><MessageCircle /></div>
              <h1>剛剛還有一段<br />沒有存起來。</h1>
              <div className="draft-actions">
                <Button size="large" onClick={continueDraft}>繼續</Button>
                <Button size="large" variant="quiet" onClick={discardDraft}>不要了</Button>
              </div>
            </div>
          ) : (
            <div className="note-layout">
              <header className="note-header"><p>💬 我想說</p><h1>你想到什麼？</h1></header>
              <div className="note-input-area">
                <Textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="在這裡說出你的想法……"
                  aria-label="想法內容"
                  maxLength={4000}
                />
                {showDictationTip && (
                  <p className="dictation-tip"><strong>想用說的嗎？</strong><span>按鍵盤上的 🎙，直接把想說的話說出來。</span></p>
                )}
                <div className="prompt-row" aria-label="思考開頭">
                  {prompts.map((prompt) => <Button variant="secondary" size="chip" key={prompt} onClick={() => insertPrompt(prompt)}>{prompt}……</Button>)}
                </div>
              </div>
              <footer className="note-actions">
                <Button variant="quiet" size="large" onClick={requestCancel}>不要了</Button>
                <Button size="large" onClick={() => void saveNote()} disabled={!content.trim() || saving}>
                  <Check aria-hidden="true" />{saving ? "存入中…" : "存起來"}
                </Button>
              </footer>
              {saveError && <p className="save-error" role="alert">{saveError}</p>}
              {saved && <div className="save-success" role="status"><Check aria-hidden="true" />存好了！</div>}
            </div>
          )}
        </section>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>這段還沒有存起來。</AlertDialogTitle>
            <AlertDialogDescription>要繼續說，還是真的不要了？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={buttonVariants({ variant: "secondary", size: "large" })}>繼續說</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "danger", size: "large" })} onClick={() => leaveNote(true)}>不要了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ParentPage() {
  const [dashboard, setDashboard] = useState<TodayDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { start, end } = getLocalDayRange();
    try {
      setDashboard(await activityRepository.getTodayDashboard(start, end));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "今天的資料載入不了。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="parent-shell">
      <header className="parent-topbar">
        <div><p className="parent-kicker">小小選片 · 家長</p><h1>今天</h1></div>
        <Link className="parent-home" to="/"><Home aria-hidden="true" />孩子首頁</Link>
      </header>
      {loading && <div className="dashboard-state" role="status">正在整理今天的紀錄…</div>}
      {error && (
        <div className="dashboard-state error-state" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void load()}><RefreshCw aria-hidden="true" />再試一次</Button></div>
      )}
      {dashboard && !loading && !error && (
        <>
          <section className="notes-section">
            <p className="section-label">孩子今天說了什麼？</p>
            {dashboard.notes.length ? (
              <div className="note-card-list">
                {dashboard.notes.map((note) => (
                  <article className="parent-note-card" key={note.id}>
                    <div className="note-meta"><time>{formatClock(note.createdAt)}</time><span>{note.videoLabel}</span></div>
                    <blockquote>「{note.content}」</blockquote>
                    <footer>
                      <span>影片位置 {formatPosition(note.videoPositionSeconds)}</span>
                      <Link to={`/watch/${note.videoId}?t=${Math.round(note.videoPositionSeconds)}`}><Play aria-hidden="true" />從這裡看</Link>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-notes"><MessageCircle aria-hidden="true" /><p>今天還沒有留下想法。</p><span>孩子存下第一段話後，會出現在這裡。</span></div>
            )}
          </section>

          <section className="summary-section" aria-label="今日摘要">
            <div className="summary-card summary-main"><Clock3 aria-hidden="true" /><span>今天影片播放</span><strong>{formatPlayedDuration(dashboard.summary.totalPlayedSeconds)}</strong></div>
            <div className="summary-card"><Film aria-hidden="true" /><strong>{dashboard.summary.playedVideoCount}</strong><span>部影片</span></div>
            <div className="summary-card"><MessageCircle aria-hidden="true" /><strong>{dashboard.summary.noteCount}</strong><span>個想法</span></div>
          </section>

          <section className="timeline-section">
            <p className="section-label">今天的觀看足跡</p>
            {dashboard.timeline.length ? (
              <ol className="timeline-list">
                {dashboard.timeline.map((session) => (
                  <li key={session.id}>
                    <time>{formatClock(session.startedAt)}</time>
                    <div><h2>{session.videoLabel}</h2><p>播放 {formatPlayedDuration(session.playedSeconds)}</p>{session.noteCount > 0 && <span><MessageCircle aria-hidden="true" />留下 {session.noteCount} 個想法</span>}</div>
                  </li>
                ))}
              </ol>
            ) : <p className="timeline-empty">今天還沒有播放紀錄。</p>}
          </section>
        </>
      )}
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/category/:categoryId" element={<CategoryPage />} />
      <Route path="/watch/:videoId" element={<WatchPage />} />
      <Route path="/parent" element={<ParentPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
