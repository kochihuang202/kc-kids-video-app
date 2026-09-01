import { ArrowLeft, Clock, Clock3, Pause, Play, RefreshCw, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { NativeMediaPlayer } from "./components/NativeMediaPlayer";
import { YouTubePlayer, type PlayerState, type YouTubePlayerHandle } from "./components/YouTubePlayer";
import { Button, buttonVariants } from "./components/ui/button";
import { activityRepository, ApiError, contentRepository, deviceRepository } from "./data/repositories";
import { cn, formatPosition } from "./lib/utils";
import type {
  Category, ChildAccessState, DeviceStatus, RecentVideo, ResumeInfo, TodayPick,
  UpdateViewSessionInput, VideoFixture,
} from "./types";

function showThumbnailFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = "/local-media-placeholder.svg";
}

export const thinkingPromptsList = [
  { icon: "💡", text: "你覺得剛剛最有趣的地方是什麼呢？", shortText: "💡 最有趣的地方", prompt: "我覺得最有趣的地方是：" },
  { icon: "🌟", text: "影片的主角是誰？他遇到了什麼事？", shortText: "🌟 主角是誰", prompt: "這部影片的主角是：" },
  { icon: "🔬", text: "你有發現什麼以前不知道的新知識嗎？", shortText: "🔬 新發現", prompt: "我發現的新知識是：" },
  { icon: "🤔", text: "如果是你遇到這樣的情況，你會怎麼做？", shortText: "🤔 如果是我", prompt: "如果是我的話，我會：" },
  { icon: "❤️", text: "目前為止，你最喜歡哪一個畫面或角色？", shortText: "❤️ 最喜歡的", prompt: "我最喜歡的是：" },
  { icon: "❓", text: "看完剛剛這一段，你有什麼想問爸爸媽媽的嗎？", shortText: "❓ 我想問", prompt: "我想問爸爸媽媽：" },
  { icon: "🚀", text: "這個故事或知識，讓你聯想到什麼事情？", shortText: "🚀 聯想到", prompt: "這讓我聯想到：" },
  { icon: "🎨", text: "如果讓你幫故事換一個情節，你想怎麼改？", shortText: "🎨 換個情節", prompt: "我想把故事改成：" },
  { icon: "🌿", text: "剛剛影片中介紹的自然現象，你覺得奇妙嗎？", shortText: "🌿 自然奧妙", prompt: "我覺得最奇妙的是：" },
  { icon: "🐾", text: "影片裡的小動物或角色做了什麼好玩的事？", shortText: "🐾 好玩的事", prompt: "最好玩的事是：" },
  { icon: "🔍", text: "剛剛有沒有哪個步驟或細節讓你印象深刻？", shortText: "🔍 深刻細節", prompt: "讓我印象深刻的細節是：" },
  { icon: "💬", text: "用一句話來形容你現在的心情或想法吧！", shortText: "💬 心情想法", prompt: "我現在覺得：" },
  { icon: "🌈", text: "影片裡的顏色、音樂或聲音，你喜歡哪一個？", shortText: "🌈 喜歡的感覺", prompt: "我最喜歡裡面的：" },
  { icon: "🛠️", text: "影片中介紹的工具或方法，你想試試看嗎？", shortText: "🛠️ 想試的方法", prompt: "我想試試看：" },
  { icon: "🤝", text: "如果能和影片中的角色說一句話，你想跟他說什麼？", shortText: "🤝 對他說的話", prompt: "我想對他說：" },
  { icon: "🧐", text: "剛剛這一段，最讓你感到驚訝的是什麼？", shortText: "🧐 驚訝的地方", prompt: "最讓我驚訝的是：" },
  { icon: "🗺️", text: "影片裡發生事情的地點在哪裡？你有去過類似的地方嗎？", shortText: "🗺️ 地點故事", prompt: "故事發生在：" },
  { icon: "🧩", text: "主角用了什麼聰明的方法解決問題呢？", shortText: "🧩 解決方法", prompt: "主角解決問題的方法是：" },
  { icon: "☀️", text: "這部影片讓你想起生活中的哪件事？", shortText: "☀️ 生活聯想", prompt: "這讓我想起生活中的：" },
  { icon: "📖", text: "如果要把這個故事講給朋友聽，你會先介紹什麼？", shortText: "📖 介紹給朋友", prompt: "我會先介紹：" },
  { icon: "🏃", text: "影片裡的角色展現了什麼厲害的能力或優點？", shortText: "🏃 厲害能力", prompt: "他厲害的地方是：" },
  { icon: "🌍", text: "看完這個，你對世界有什麼新的好奇嗎？", shortText: "🌍 新的好奇", prompt: "我很好奇：" },
  { icon: "🎶", text: "你有注意到剛才畫面中的特別細節嗎？", shortText: "🎶 特別細節", prompt: "我注意到：" },
  { icon: "💭", text: "今天學到的這件事，可以用在平常生活中的哪裡？", shortText: "💭 平常運用", prompt: "我可以用在：" },
  { icon: "🎁", text: "如果把這部影片推薦給家人，你會說什麼？", shortText: "🎁 推薦理由", prompt: "我想推薦這部影片，因為：" },
  { icon: "✨", text: "這部影片看完後，你最想跟誰分享？", shortText: "✨ 想跟誰分享", prompt: "我最想分享給：" },
];

export function getRandomThinkingPrompts(count = 5) {
  const shuffled = [...thinkingPromptsList].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
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
  const [todayPicks, setTodayPicks] = useState<TodayPick[]>([]);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [recents, setRecents] = useState<RecentVideo[]>([]);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextCategories, accessData, picksData, resumeData, recentData, deviceData] = await Promise.all([
        contentRepository.getCategories(),
        contentRepository.getAccessState().catch(() => null),
        contentRepository.getTodayPicks().catch(() => []),
        contentRepository.getResume().catch(() => ({ resume: null })),
        contentRepository.getRecents().catch(() => []),
        deviceRepository.status().catch(() => ({ authorized: false, device: null })),
      ]);
      setCategories(nextCategories);
      setAccessState(accessData);
      setTodayPicks(picksData || []);
      setResume(resumeData.resume);
      setRecents(recentData || []);
      setDevice(deviceData);
      if (!deviceData.authorized && localStorage.getItem("device_setup_notice_seen") !== "1") setNotice(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "內容暫時載入不了。");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(async () => {
      try {
        const nextState = await contentRepository.getAccessState();
        setAccessState(nextState);
      } catch { /* ignore offline errors */ }
    }, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const dismissNotice = () => {
    localStorage.setItem("device_setup_notice_seen", "1");
    setNotice(false);
  };

  if (accessState?.state === "PAUSED_BY_PARENT") {
    return (
      <main className="kid-shell home-page">
        <header className="home-header">
          <ParentGate />
          <h1>今天先休息一下 🌱</h1>
        </header>
        <div className="limit-card">
          <p>等等再來看看。</p>
        </div>
      </main>
    );
  }

  if (accessState?.state === "DAILY_LIMIT_REACHED") {
    return (
      <main className="kid-shell home-page">
        <header className="home-header">
          <ParentGate />
          <h1>今天的影片時間到了 🌙</h1>
        </header>
        <div className="limit-card">
          <p>今天看影片的時間已經結束囉！✨ 休息一下，明天再來看看吧！</p>
        </div>
      </main>
    );
  }

  const isOutsideWindow = accessState?.state === "OUTSIDE_WINDOW";

  return (
    <main className="kid-shell home-page">
      <header className="home-header">
        <ParentGate />
        <h1>今天想看什麼？</h1>
        {accessState && accessState.state === "AVAILABLE" && accessState.message && (
          <div className="gentle-time-badge" aria-label={accessState.message}>
            <Clock /> {accessState.message}
          </div>
        )}
        {isOutsideWindow && (
          <div className="outside-window-tip" role="status">
            {accessState.message}
          </div>
        )}
      </header>

      {notice && (
        <aside className="device-notice" role="status">
          <div><strong>這台裝置還沒設定好</strong><p>請家長授權一次，才能同步觀看紀錄與每日時間。</p></div>
          <div><Button variant="secondary" onClick={dismissNotice}>知道了</Button><Link to="/parent/settings">家長設定</Link></div>
        </aside>
      )}

      {!isOutsideWindow && resume && (
        <section className="resume-section" aria-label="繼續觀看">
          <div className="resume-header"><span className="resume-tag"><Play />繼續看</span></div>
          <Link className="resume-card" to={`/watch/${resume.videoId}?t=${Math.round(resume.lastPositionSeconds)}`}>
            <div className="resume-thumb-wrapper">
              <img src={resume.thumbnailUrl} alt="" onError={showThumbnailFallback} />
              <span className="resume-pos-pill">看到 {formatPosition(resume.lastPositionSeconds)}</span>
            </div>
            <div className="resume-content"><h2>{resume.parentLabel}</h2><span className="resume-action-btn"><Play />繼續播放</span></div>
          </Link>
        </section>
      )}

      {!isOutsideWindow && recents.length > 0 && (
        <section className="recents-section" aria-label="最近看過">
          <h2 className="recents-title">最近看過</h2>
          <div className="recents-scroll-row">
            {recents.map((recent) => (
              <Link className="recent-card" to={`/watch/${recent.id}?t=${Math.round(recent.lastPositionSeconds)}`} key={recent.id}>
                <div className="recent-thumb-wrapper"><img src={recent.thumbnailUrl} alt="" onError={showThumbnailFallback} /></div>
                <h3>{recent.parentLabel}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 今天推薦 (Today Picks) (Spec #46, #49, #50) */}
      {!isOutsideWindow && todayPicks.length > 0 && (
        <section className="today-picks-section" aria-label="今天推薦">
          <h2 className="recents-title">✨ 今天推薦給你 🌱</h2>
          <div className="recents-scroll-row">
            {todayPicks.map((pick) => (
              <Link className="recent-card today-pick-card" to={`/watch/${pick.videoId}`} key={pick.id}>
                <div className="recent-thumb-wrapper">
                  <img src={pick.thumbnailUrl} alt={pick.parentLabel} onError={showThumbnailFallback} />
                </div>
                <h3>{pick.parentLabel}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!categories && !error && <LoadingCard label="正在拿出選片盒…" />}
      {error && <KidError message={error} retry={() => void load()} />}

      {categories && (
        <section className={`category-grid ${isOutsideWindow ? "is-disabled" : ""}`} aria-label="影片分類">
          {categories.map((category) => {
            const catState = accessState?.categoryStates?.find((cs) => cs.categoryId === category.id);
            const isCatReached = !isOutsideWindow && !!catState?.isReached;

            if (isOutsideWindow || isCatReached) {
              return (
                <div
                  className={`category-card tone-${category.tone} disabled-card`}
                  key={category.id}
                  title={isCatReached ? "此分類今天的時間到了 🌱" : undefined}
                >
                  <span className="category-icon" aria-hidden="true">{category.icon}</span>
                  <span className="category-name-text">{category.name}</span>
                  {isCatReached && <span className="cat-reached-pill">🌱 今日時間到了</span>}
                </div>
              );
            }

            return (
              <Link className={`category-card tone-${category.tone}`} to={`/category/${category.id}`} key={category.id}>
                <span className="category-icon" aria-hidden="true">{category.icon}</span>
                <span className="category-name-text">{category.name}</span>
                {catState && catState.dailyLimitSeconds && catState.remainingSeconds !== null && catState.remainingSeconds > 0 && catState.remainingSeconds <= 1800 && (
                  <span className="cat-time-pill">約剩 {Math.max(1, Math.round(catState.remainingSeconds / 60))} 分</span>
                )}
              </Link>
            );
          })}
        </section>
      )}

      {device?.authorized && <p className="device-ready">這台裝置已同步觀看紀錄 ✓</p>}

    </main>
  );
}

export function CategoryPage() {
  const { categoryId = "" } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [videos, setVideos] = useState<VideoFixture[] | null>(null);
  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [categories, nextVideos, nextAccess] = await Promise.all([
        contentRepository.getCategories(),
        contentRepository.getVideos(categoryId),
        contentRepository.getAccessState().catch(() => null),
      ]);
      const nextCategory = categories.find((item) => item.id === categoryId);
      if (!nextCategory) throw new ApiError("找不到這個分類。", 404);
      setCategory(nextCategory);
      setVideos(nextVideos);
      setAccessState(nextAccess);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "影片暫時載入不了。");
    }
  }, [categoryId]);

  useEffect(() => { void load(); }, [load]);

  const currentCatState = accessState?.categoryStates?.find((cs) => cs.categoryId === categoryId);
  const isCategoryLimitReached = currentCatState?.isReached;

  return (
    <main className="kid-shell category-page">
      <Link className="back-link" to="/"><ArrowLeft />回去</Link>
      {!category && !error && <LoadingCard label="正在找影片…" />}
      {error && <KidError message={error} retry={() => void load()} />}
      {category && videos && (
        <>
          <header className="section-heading">
            <span aria-hidden="true">{category.icon}</span>
            <h1>{category.name}</h1>
            {currentCatState && currentCatState.dailyLimitSeconds && currentCatState.remainingSeconds !== null && !isCategoryLimitReached && (
              <span className="gentle-time-badge">
                <Clock3 /> 此分類今日約剩 {Math.max(1, Math.round(currentCatState.remainingSeconds / 60))} 分鐘
              </span>
            )}
          </header>

          {isCategoryLimitReached && (
            <div className="limit-card" role="status">
              <span className="ended-badge">🌱</span>
              <h2>這個分類今天的時間到了</h2>
              <p>這個分類今天已經看夠囉！休息一下，也可以回首頁看看其他分類喔 ✨</p>
            </div>
          )}

          {!isCategoryLimitReached && (
            <section className="video-grid" aria-label={`${category.name}影片`}>
              {videos.map((video) => (
                <Link className="video-card" to={`/watch/${video.id}`} key={video.id}>
                  <div className="video-thumb-container">
                    <img src={video.thumbnailUrl} alt={`${video.parentLabel}影片縮圖`} onError={showThumbnailFallback} />
                    {video.isWatched && <span className="watched-badge">✓ 看過</span>}
                    {!!video.lastPositionSeconds && !!video.durationSeconds && (
                      <div className="mini-progress-track" aria-hidden="true">
                        <div className="mini-progress-fill" style={{ width: `${Math.min(100, video.lastPositionSeconds / video.durationSeconds * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2>{video.parentLabel}</h2>
                    <p>{video.youtubeTitle}</p>
                  </div>
                </Link>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function reminderRemainingForVideo(access: ChildAccessState, video: VideoFixture) {
  let remaining = access.dailyLimitSeconds > 0 ? access.remainingSeconds : Number.MAX_SAFE_INTEGER;
  let categoryReached = false;
  const categoryIds = video.categoryIds || (video.categoryId ? [video.categoryId] : []);
  for (const category of access.categoryStates?.filter((item) => categoryIds.includes(item.categoryId)) || []) {
    if (category.dailyLimitSeconds && category.dailyLimitSeconds > 0) {
      if (category.isReached || category.remainingSeconds === 0) categoryReached = true;
      if (category.remainingSeconds !== null) remaining = Math.min(remaining, category.remainingSeconds);
    }
  }
  return { remaining, categoryReached };
}

interface Capability { id: string; writeToken: string }
interface PendingHeartbeat { sessionId: string; payload: UpdateViewSessionInput; keepalive: boolean }

export function WatchPage() {
  const { videoId = "" } = useParams();
  const initialParams = new URLSearchParams(window.location.search);
  const rawInitialPos = Math.max(0, Number(initialParams.get("at") || initialParams.get("t") || 0) || 0);

  const [video, setVideo] = useState<VideoFixture | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [startPosition, setStartPosition] = useState(rawInitialPos);
  const [loadError, setLoadError] = useState("");
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const capabilityRef = useRef<Capability | null>(null);
  const sessionPromiseRef = useRef<Promise<Capability | null> | null>(null);
  const clientSessionIdRef = useRef(crypto.randomUUID());
  const heartbeatSeqRef = useRef(0);
  const queueRef = useRef<PendingHeartbeat[]>([]);
  const drainingRef = useRef(false);
  const playingStartPerfRef = useRef<number | null>(null);
  const accumulatedPlayMsRef = useRef<number>(0);
  const playingStartWallRef = useRef<string | null>(null);
  const playerStateRef = useRef<PlayerState>("READY");

  const [playerError, setPlayerError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentPos, setCurrentPos] = useState(rawInitialPos);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(rawInitialPos);
  const [showEdgeMasks, setShowEdgeMasks] = useState(false);
  const [volume, setVolume] = useState(1);

  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [inGrace, setInGrace] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [parentPaused, setParentPaused] = useState(false);
  const [pausePrompts, setPausePrompts] = useState<Array<{ icon: string; text: string; shortText: string; prompt: string }>>([]);
  const [endPrompts, setEndPrompts] = useState<Array<{ icon: string; text: string; shortText: string; prompt: string }>>(() => getRandomThinkingPrompts(5));
  const graceSecsUsedRef = useRef<number>(0);
  const remainingSecsRef = useRef<number>(999999);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [nextVideo, rawAccess, nextDevice] = await Promise.all([
        contentRepository.getVideo(videoId),
        contentRepository.getAccessState().catch(() => null),
        deviceRepository.status().catch(() => ({ authorized: false, device: null })),
      ]);
      setVideo(nextVideo);
      setDevice(nextDevice);
      const resumePosition = rawInitialPos > 0 ? rawInitialPos : Math.max(0, nextVideo.lastPositionSeconds || 0);
      setStartPosition(resumePosition);
      setCurrentPos(resumePosition);
      setDragPos(resumePosition);
      const nextAccess = rawAccess;
      setAccessState(nextAccess);
      if (nextAccess) {
        const { remaining, categoryReached } = reminderRemainingForVideo(nextAccess, nextVideo);
        remainingSecsRef.current = remaining;
        if (nextAccess.state === "PAUSED_BY_PARENT") {
          setParentPaused(true);
        } else if (categoryReached || nextAccess.state === "DAILY_LIMIT_REACHED") {
          setTimeUp(true);
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "影片暫時載入不了。");
    }
  }, [videoId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(async () => {
      try {
        const nextAccess = await contentRepository.getAccessState();
        setAccessState(nextAccess);
        if (nextAccess.state === "PAUSED_BY_PARENT") {
          playerRef.current?.pause();
          setParentPaused(true);
        } else {
          setParentPaused(false);
          const state = video ? reminderRemainingForVideo(nextAccess, video) : { remaining: nextAccess.remainingSeconds, categoryReached: false };
          remainingSecsRef.current = state.remaining;
          if (state.categoryReached || nextAccess.state === "DAILY_LIMIT_REACHED") {
            if (!inGrace) {
              setInGrace(true);
            }
          }
        }
      } catch { /* offline tolerance */ }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [load, inGrace, video]);

  const ensureSession = useCallback(async () => {
    if (!video || !device?.authorized) return null;
    if (capabilityRef.current) return capabilityRef.current;
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = activityRepository.startViewSession(video.id, clientSessionIdRef.current)
        .then(({ id, writeToken }) => {
          capabilityRef.current = { id, writeToken };
          return capabilityRef.current;
        })
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
        } catch {
          break;
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, []);

  const flushTracking = useCallback(async (status: "active" | "ended" = "active", keepalive = false) => {
    const nowPerf = performance.now();
    const nowIso = new Date().toISOString();
    if (playingStartPerfRef.current !== null) {
      const elapsedMs = Math.max(0, nowPerf - playingStartPerfRef.current);
      accumulatedPlayMsRef.current += elapsedMs;
      playingStartPerfRef.current = nowPerf;
    }
    const deltaSeconds = Math.floor(accumulatedPlayMsRef.current / 1000);
    if (deltaSeconds > 0) accumulatedPlayMsRef.current -= deltaSeconds * 1000;

    if (deltaSeconds > 0) {
      remainingSecsRef.current = Math.max(0, remainingSecsRef.current - deltaSeconds);
      if (remainingSecsRef.current <= 0 && !inGrace) setInGrace(true);
      if (inGrace) {
        graceSecsUsedRef.current += deltaSeconds;
        const maxGrace = accessState?.gracePeriodSeconds || 300;
        if (graceSecsUsedRef.current >= maxGrace) {
          playerRef.current?.pause();
          setTimeUp(true);
        }
      }
    }

    if (!device?.authorized) return;
    const capability = capabilityRef.current || await ensureSession();
    if (!capability) return;
    const payload: UpdateViewSessionInput = {
      writeToken: capability.writeToken,
      heartbeatSeq: ++heartbeatSeqRef.current,
      deltaSeconds,
      positionSeconds: Math.max(0, Math.round(playerRef.current?.getCurrentTime() || currentPos)),
      intervalStartedAt: playingStartWallRef.current,
      intervalEndedAt: playingStartWallRef.current ? nowIso : null,
      status,
    };
    playingStartWallRef.current = playingStartPerfRef.current === null ? null : nowIso;
    queueRef.current.push({ sessionId: capability.id, payload, keepalive });
    void drainQueue();
  }, [accessState?.gracePeriodSeconds, currentPos, device?.authorized, drainQueue, ensureSession, inGrace]);

  const handlePlayerState = useCallback((state: PlayerState) => {
    playerStateRef.current = state;
    setIsPlaying(state === "PLAYING");
    if (state === "PLAYING") {
      setIsEnded(false);
      setPausePrompts([]);
      if (playingStartPerfRef.current === null) {
        playingStartPerfRef.current = performance.now();
        playingStartWallRef.current = new Date().toISOString();
      }
      void ensureSession();
    } else if (state === "ENDED") {
      setIsEnded(true);
      setPausePrompts([]);
      setEndPrompts(getRandomThinkingPrompts(5));
      void flushTracking("ended");
      playingStartPerfRef.current = null;
      playingStartWallRef.current = null;
      if (inGrace || remainingSecsRef.current <= 0) {
        setTimeUp(true);
      }
    } else if (state === "PAUSED") {
      void flushTracking("active");
      playingStartPerfRef.current = null;
      playingStartWallRef.current = null;
      const cur = playerRef.current?.getCurrentTime() || 0;
      if (cur > 2) {
        setPausePrompts(getRandomThinkingPrompts(5));
      }
    }
  }, [ensureSession, flushTracking, inGrace]);

  const handleNativeProgress = useCallback((time: number, duration: number) => {
    if (!isDragging) setCurrentPos(time);
    if (duration > 0) setTotalDuration((previous) => previous === duration ? previous : duration);
  }, [isDragging]);

  useEffect(() => {
    if (timeUp) {
      playerRef.current?.pause();
      void flushTracking("active");
    }
  }, [timeUp, flushTracking]);

  // Timed edge mask lifecycle: cleanly starts a 5-second countdown on isPlaying===true
  useEffect(() => {
    if (isPlaying) {
      setShowEdgeMasks(true);
      const timer = window.setTimeout(() => {
        setShowEdgeMasks(false);
      }, 5000);
      return () => window.clearTimeout(timer);
    } else {
      setShowEdgeMasks(false);
    }
  }, [isPlaying]);

  useEffect(() => {
    const progressInterval = window.setInterval(() => {
      if (playerStateRef.current === "PLAYING") {
        if (playerRef.current) {
          const time = playerRef.current.getCurrentTime();
          if (!isDragging) setCurrentPos(time);
          const dur = playerRef.current.getDuration();
          if (dur > 0 && dur !== totalDuration) setTotalDuration(dur);
        }
      }
    }, 500);
    const heartbeatInterval = window.setInterval(() => {
      if (playerStateRef.current === "PLAYING") void flushTracking();
      else void drainQueue();
    }, 10_000);
    const onVisibility = () => { if (document.visibilityState === "hidden") void flushTracking("active", true); };
    const onPageHide = () => { void flushTracking("active", true); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(progressInterval);
      window.clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [drainQueue, flushTracking, isDragging, totalDuration]);

  const togglePlay = () => {
    if (playerStateRef.current === "PLAYING") {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const restartVideo = () => {
    setIsEnded(false);
    playerRef.current?.seekTo(0);
    setCurrentPos(0);
    playerRef.current?.play();
  };

  const seekRelative = (delta: number) => {
    const current = playerRef.current?.getCurrentTime() ?? currentPos;
    const max = totalDuration > 0 ? totalDuration : 999999;
    const target = Math.max(0, Math.min(max, current + delta));
    playerRef.current?.seekTo(target);
    setCurrentPos(target);
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
  };

  if (!video && !loadError) return <main className="watch-page watch-loading"><LoadingCard label="正在準備播放器…" /></main>;
  if (loadError) return <main className="kid-shell"><KidError message={loadError} retry={() => void load()} /></main>;
  if (!video) return <Navigate to="/" replace />;

  const activePos = isDragging ? dragPos : currentPos;
  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (activePos / totalDuration) * 100)) : 0;
  const isYouTube = video.source === "youtube";
  const hasPlayableSource = isYouTube ? !!video.youtubeVideoId : !!video.mediaUrl && !!video.mediaType;

  return (
    <main className="watch-page">
      <section className="player-surface">
        <div className={cn("player-stage", !isYouTube && "player-stage-local")}>
          {/* Keep the selected player mounted so playback and reminder timing stay continuous. */}
          {isYouTube && video.youtubeVideoId ? (
            <YouTubePlayer
              ref={playerRef}
              videoId={video.youtubeVideoId}
              startAt={startPosition}
              volume={volume}
              onStateChange={handlePlayerState}
              onError={() => setPlayerError(true)}
            />
          ) : video.mediaUrl && video.mediaType ? (
            <NativeMediaPlayer
              ref={playerRef}
              src={video.mediaUrl}
              mediaType={video.mediaType}
              poster={video.thumbnailUrl}
              startAt={startPosition}
              volume={volume}
              onStateChange={handlePlayerState}
              onProgress={handleNativeProgress}
              onError={() => setPlayerError(true)}
            />
          ) : null}

          {/* Transparent touch/click interceptor */}
          <div
            className="stage-click-capture"
            onClick={togglePlay}
            aria-label={isPlaying ? "暫停影片" : "播放影片"}
          />

          {/* Timed edge masks for initial 5s chrome suppression */}
          {isYouTube && <div className={cn("player-edge-top", !showEdgeMasks && "player-edge-hidden")} aria-hidden="true" />}
          {isYouTube && <div className={cn("player-edge-bottom", !showEdgeMasks && "player-edge-hidden")} aria-hidden="true" />}

          {/* Opaque poster: covers the entire iframe when not playing */}
          <div
            className={cn("poster-overlay", (isPlaying || isEnded) && "poster-hidden")}
            onClick={togglePlay}
            aria-hidden={isPlaying || isEnded}
          >
            <img
              src={video.thumbnailUrl}
              alt=""
              className="poster-thumb"
              draggable={false}
              onError={showThumbnailFallback}
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

          {/* Grace Period gentle prompt (Spec #23, #25) */}
          {inGrace && !timeUp && !isEnded && (
            <div className="grace-toast" role="status">
              今天快結束囉 🌙 這一段看完就休息囉。
            </div>
          )}

          {/* 家長暫停畫面 (Spec #20, #35) */}
          {parentPaused && (
            <div className="ended-overlay" role="region" aria-label="家長暫停">
              <div className="ended-content">
                <span className="ended-badge" aria-hidden="true">🌱</span>
                <h1>今天先休息一下</h1>
                <p>等等再來看看。</p>
                <div className="ended-buttons">
                  <Link className={buttonVariants({ variant: "secondary", size: "large" })} to="/">
                    回首頁
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 時間結束畫面 (Spec #25, #26) */}
          {timeUp && !parentPaused && (
            <div className="ended-overlay" role="region" aria-label="時間到了">
              <div className="ended-content">
                <span className="ended-badge" aria-hidden="true">🌙</span>
                <h1>時間到了，今天先休息囉！</h1>
                <p>今天的觀看時間已經結束囉。<br /><span style={{ color: "#b7e3ca", fontWeight: "bold" }}>✨ 休息前，想想今天最有趣的新發現吧！</span></p>

                <div className="ended-questions-box">
                  <span className="ended-questions-title">💭 休息前想一想：</span>
                  <div className="ended-questions-list">
                    {endPrompts.map((q) => (
                      <div className="ended-question-btn" key={q.text}>
                        <span className="question-icon">{q.icon}</span>
                        <span className="question-text">{q.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ended-buttons">
                  <Link className={buttonVariants({ variant: "secondary", size: "large" })} to="/">
                    回首頁
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 暫停時提醒與 5 組隨機思考問題 */}
          {!isPlaying && !isEnded && !timeUp && !parentPaused && pausePrompts.length > 0 && currentPos > 2 && (
            <div className="pause-reminder-overlay" role="region" aria-label="暫停思考提示">
              <div className="pause-reminder-card">
                <div className="pause-reminder-header">
                  <span className="pause-icon-badge">⏸️</span>
                  <div className="pause-reminder-titles">
                    <strong>影片暫停中</strong>
                    <span>停一下，選一題想想看 ✨</span>
                  </div>
                </div>
                <div className="pause-questions-list">
                  {pausePrompts.map((q) => (
                    <div className="pause-question-btn" key={q.text}>
                      <span className="question-icon">{q.icon}</span>
                      <span className="question-text">{q.text}</span>
                    </div>
                  ))}
                </div>
                <div className="pause-reminder-actions">
                  <Button size="large" variant="secondary" onClick={togglePlay}>
                    <Play /> 繼續播放
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 自訂播放結束畫面 (看完提醒 + 5 組隨機問題清單) */}
          {isEnded && !timeUp && !parentPaused && (
            <div className="ended-overlay" role="region" aria-label="播放完畢與心得提醒">
              <div className="ended-content">
                <span className="ended-badge" aria-hidden="true">🎉</span>
                <h1>看完了！想一想今天的新發現 ✨</h1>
                <p className="ended-reminder-sub">
                  可以挑一題，跟爸爸媽媽聊聊看！
                </p>

                <div className="ended-questions-box">
                  <span className="ended-questions-title">💭 選一題聊聊看：</span>
                  <div className="ended-questions-list">
                    {endPrompts.map((q) => (
                      <div className="ended-question-btn" key={q.text}>
                        <span className="question-icon">{q.icon}</span>
                        <span className="question-text">{q.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ended-buttons">
                  <Button size="large" variant="secondary" onClick={restartVideo}>
                    <RotateCcw /> 再看一次
                  </Button>
                  <Link className={buttonVariants({ variant: "quiet", size: "large" })} to={`/category/${video.categoryId}`}>
                    回到影片列表
                  </Link>
                </div>
              </div>
            </div>
          )}

          {(playerError || !hasPlayableSource) && (
            <div className="player-error" role="alert">
              <p>{isYouTube ? "影片暫時載入不了。" : "目前連不到家裡的影片。請確認 Mac 與 Tailscale 都在線上。"}</p>
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

            <div className="volume-control" onClick={(e) => e.stopPropagation()}>
              <Volume2 aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                className="volume-slider"
                aria-label="音量"
                onChange={(event) => setVolume(Number(event.target.value))}
              />
              <span>{Math.round(volume * 100)}%</span>
            </div>

          </footer>
        </div>
      </section>
    </main>
  );
}
