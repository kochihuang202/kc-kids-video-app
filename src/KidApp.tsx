import { ArrowLeft, Clock, Clock3, Headphones, Pause, Play, RefreshCw, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { NativeMediaPlayer } from "./components/NativeMediaPlayer";
import { YouTubePlayer, type PlayerState, type YouTubePlayerHandle } from "./components/YouTubePlayer";
import { Button, buttonVariants } from "./components/ui/button";
import { activityRepository, ApiError, contentRepository, deviceRepository } from "./data/repositories";
import { cn, formatPosition } from "./lib/utils";
import type {
  Category, ChildAccessState, DeviceStatus, PlaybackMode, RecentVideo, ResumeInfo, TodayPick,
  UpdateViewSessionInput, VideoFixture,
} from "./types";

function showThumbnailFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = "/local-media-placeholder.svg";
}

function withMediaRetry(src: string, retryKey: number) {
  if (retryKey === 0) return src;
  try {
    const url = new URL(src);
    url.searchParams.set("kc_retry", String(retryKey));
    return url.toString();
  } catch {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}kc_retry=${retryKey}`;
  }
}

function formatLearnedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "標記時間未記錄";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
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

  const isOutsideWindow = accessState?.state === "OUTSIDE_WINDOW";
  const learningCategories = categories?.filter((category) => category.seriesType === "learning") || [];
  const leisureCategories = categories?.filter((category) => category.seriesType === "leisure") || [];
  const leisureReached = !!accessState && accessState.remainingSeconds <= 0;

  return (
    <main className="kid-shell home-page">
      <header className="home-header">
        <ParentGate />
        <h1>今天想看什麼？</h1>
        {accessState && !isOutsideWindow && accessState.message && (
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

      {accessState && !isOutsideWindow && (
        <section className="leisure-balance" aria-label="今日休閒時間">
          <div><span>今日休閒剩餘</span><strong>{Math.max(0, Math.ceil(accessState.remainingSeconds / 60))} 分鐘</strong></div>
          <div><span>學習增加</span><strong>+{Math.floor((accessState.earnedBonusSeconds || 0) / 60)} 分鐘</strong></div>
          <div><span>休閒已用</span><strong>{Math.floor((accessState.leisureUsedSeconds || 0) / 60)} 分鐘</strong></div>
        </section>
      )}

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

      {categories && [
        { type: "learning", title: "📚 學習系列", items: learningCategories },
        { type: "leisure", title: "🎈 休閒系列", items: leisureCategories },
      ].map((group) => group.items.length > 0 && (
        <section className="series-group" aria-label={group.title} key={group.type}>
          <div className="series-heading"><h2>{group.title}</h2>{group.type === "learning" && <span>不限時間 · 看 2 分鐘，多 1 分鐘休閒</span>}</div>
          <div className={`category-grid ${isOutsideWindow ? "is-disabled" : ""}`}>
            {group.items.map((category) => isOutsideWindow ? (
              <div className={`category-card tone-${category.tone} disabled-card`} key={category.id}>
                <span className="category-icon" aria-hidden="true">{category.icon}</span><span className="category-name-text">{category.name}</span>
              </div>
            ) : (
              <Link className={`category-card tone-${category.tone}`} to={`/category/${category.id}`} key={category.id}>
                <span className="category-icon" aria-hidden="true">{category.icon}</span>
                <span className="category-name-text">{category.name}</span>
                {group.type === "leisure" && leisureReached && <span className="cat-reached-pill">一般觀看時間已到 · 純聽仍可用</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}

      {device?.authorized && <p className="device-ready">這台裝置已同步觀看紀錄 ✓</p>}

    </main>
  );
}

export function CategoryPage() {
  const { categoryId = "" } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [videos, setVideos] = useState<VideoFixture[] | null>(null);
  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [error, setError] = useState("");
  const [savingLearnedId, setSavingLearnedId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [categories, nextVideos, nextAccess, nextDevice] = await Promise.all([
        contentRepository.getCategories(),
        contentRepository.getVideos(categoryId),
        contentRepository.getAccessState().catch(() => null),
        deviceRepository.status().catch(() => ({ authorized: false, device: null })),
      ]);
      const nextCategory = categories.find((item) => item.id === categoryId);
      if (!nextCategory) throw new ApiError("找不到這個分類。", 404);
      setCategory(nextCategory);
      setVideos(nextVideos);
      setAccessState(nextAccess);
      setDevice(nextDevice);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "影片暫時載入不了。");
    }
  }, [categoryId]);

  useEffect(() => { void load(); }, [load]);

  const toggleLearned = async (video: VideoFixture) => {
    setSavingLearnedId(video.id);
    try {
      await contentRepository.setLearned(video.id, !video.isLearned);
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "學會狀態暫時無法更新。");
    } finally {
      setSavingLearnedId("");
    }
  };

  const renderVideoCard = (video: VideoFixture) => (
    <article className={cn("video-card", !video.isSelectable && "is-locked", video.isLearned && "is-learned")} key={video.id}>
      {video.isSelectable ? (
        <Link className="video-card-main" to={`/watch/${video.id}`}>
          <div className="video-thumb-container">
            <img src={video.thumbnailUrl} alt={`${video.parentLabel}影片縮圖`} onError={showThumbnailFallback} />
            {video.isLearned && <span className="learned-status-badge">✓ 已學會</span>}
            {video.isWatched && <span className="watched-badge">✓ 看過</span>}
            {!!video.lastPositionSeconds && !!video.durationSeconds && (
              <div className="mini-progress-track" aria-hidden="true"><div className="mini-progress-fill" style={{ width: `${Math.min(100, video.lastPositionSeconds / video.durationSeconds * 100)}%` }} /></div>
            )}
          </div>
          <div>
            <h2>{video.parentLabel}</h2><p>{video.youtubeTitle}</p>
            {video.isLearned && video.learnedAt && <p className="learned-at"><Clock3 />{formatLearnedAt(video.learnedAt)} 學會</p>}
          </div>
        </Link>
      ) : (
        <div className="video-card-main" aria-disabled="true">
          <div className="video-thumb-container"><img src={video.thumbnailUrl} alt="" onError={showThumbnailFallback} /><span className="locked-badge">🔒 先從前五部選擇</span></div>
          <div><h2>{video.parentLabel}</h2><p>{video.youtubeTitle}</p></div>
        </div>
      )}
      <button
        type="button"
        className={cn("learned-toggle", video.isLearned && "checked")}
        disabled={!device?.authorized || savingLearnedId === video.id}
        onClick={() => void toggleLearned(video)}
        aria-pressed={!!video.isLearned}
      >
        <span aria-hidden="true">{video.isLearned ? "✓" : ""}</span>{video.isLearned ? "取消學會" : "標記學會了"}
      </button>
    </article>
  );

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
            <span className={`series-type-pill ${category.seriesType}`}>{category.seriesType === "learning" ? "學習系列" : "休閒系列"}</span>
            {category.seriesType === "leisure" && accessState && (
              <span className="gentle-time-badge">
                <Clock3 /> 今日休閒剩餘 {Math.max(0, Math.ceil(accessState.remainingSeconds / 60))} 分鐘
              </span>
            )}
          </header>

          {!device?.authorized && (
            <div className="device-notice" role="status">
              <div><strong>請家長先授權這台裝置</strong><p>可以先看看有哪些影片；授權後才能播放、同步進度與標記學會。</p></div>
              <Link to="/parent/settings">家長設定</Link>
            </div>
          )}

          <section className="learning-status-group" aria-label="還沒學會">
            <div className="learning-status-heading"><h2>🌱 還沒學會</h2><span>{videos.filter((video) => !video.isLearned).length} 部</span></div>
            <div className="video-grid">{videos.filter((video) => !video.isLearned).map(renderVideoCard)}</div>
          </section>

          {videos.some((video) => video.isLearned) && (
            <section className="learning-status-group learned-group" aria-label="已學會">
              <div className="learning-status-heading"><h2>✅ 已學會</h2><span>{videos.filter((video) => video.isLearned).length} 部</span></div>
              <div className="video-grid">{videos.filter((video) => video.isLearned).map(renderVideoCard)}</div>
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
  const [mediaRetryKey, setMediaRetryKey] = useState(0);
  const [autoRetryActive, setAutoRetryActive] = useState(false);
  const [autoRetrySecondsLeft, setAutoRetrySecondsLeft] = useState(60);
  const retryDeadlineRef = useRef(0);
  const autoRetryActiveRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentPos, setCurrentPos] = useState(rawInitialPos);
  const currentPosRef = useRef(rawInitialPos);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(rawInitialPos);
  const [showEdgeMasks, setShowEdgeMasks] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("video");

  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [parentPaused, setParentPaused] = useState(false);
  const [outsideWindow, setOutsideWindow] = useState(false);
  const [pausePrompts, setPausePrompts] = useState<Array<{ icon: string; text: string; shortText: string; prompt: string }>>([]);
  const [endPrompts, setEndPrompts] = useState<Array<{ icon: string; text: string; shortText: string; prompt: string }>>(() => getRandomThinkingPrompts(5));
  const remainingSecsRef = useRef<number>(999999);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const nextDevice = await deviceRepository.status().catch(() => ({ authorized: false, device: null }));
      setDevice(nextDevice);
      if (!nextDevice.authorized) {
        setLoadError("DEVICE_AUTH_REQUIRED");
        return;
      }
      const [nextVideo, rawAccess] = await Promise.all([
        contentRepository.getVideo(videoId),
        contentRepository.getAccessState().catch(() => null),
      ]);
      setVideo(nextVideo);
      const initialMode: PlaybackMode = nextVideo.mediaType === "audio" ? "listen" : "video";
      setPlaybackMode(initialMode);
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
        } else if (nextAccess.state === "OUTSIDE_WINDOW") {
          setOutsideWindow(true);
        } else if (initialMode === "video" && nextVideo.seriesType === "leisure" && (categoryReached || nextAccess.state === "DAILY_LIMIT_REACHED")) {
          setTimeUp(true);
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "影片暫時載入不了。");
    }
  }, [videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const nextAccess = await contentRepository.getAccessState();
        setAccessState(nextAccess);
        if (nextAccess.state === "PAUSED_BY_PARENT") {
          playerRef.current?.pause();
          setParentPaused(true);
          setOutsideWindow(false);
        } else if (nextAccess.state === "OUTSIDE_WINDOW") {
          playerRef.current?.pause();
          setParentPaused(false);
          setOutsideWindow(true);
        } else {
          setParentPaused(false);
          setOutsideWindow(false);
          const state = video ? reminderRemainingForVideo(nextAccess, video) : { remaining: nextAccess.remainingSeconds, categoryReached: false };
          remainingSecsRef.current = state.remaining;
          if (playbackMode === "video" && video?.seriesType === "leisure" && (state.categoryReached || nextAccess.state === "DAILY_LIMIT_REACHED")) setTimeUp(true);
        }
      } catch { /* offline tolerance */ }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [playbackMode, video]);

  useEffect(() => {
    currentPosRef.current = currentPos;
  }, [currentPos]);

  const startMediaRetry = useCallback(() => {
    const retryPosition = playerRef.current?.getCurrentTime() || currentPosRef.current;
    setStartPosition(Math.max(0, retryPosition));
    retryDeadlineRef.current = Date.now() + 60_000;
    autoRetryActiveRef.current = true;
    setAutoRetrySecondsLeft(60);
    setAutoRetryActive(true);
    setPlayerError(true);
    setMediaRetryKey((key) => key + 1);
  }, []);

  const handleMediaError = useCallback(() => {
    setPlayerError(true);
    if (video?.source !== "self_hosted" || autoRetryActiveRef.current) return;
    startMediaRetry();
  }, [startMediaRetry, video?.source]);

  const handleMediaReady = useCallback(() => {
    retryDeadlineRef.current = 0;
    autoRetryActiveRef.current = false;
    setAutoRetryActive(false);
    setAutoRetrySecondsLeft(60);
    setPlayerError(false);
  }, []);

  const retryMediaNow = useCallback(() => {
    if (autoRetryActive) {
      setMediaRetryKey((key) => key + 1);
      return;
    }
    startMediaRetry();
  }, [autoRetryActive, startMediaRetry]);

  useEffect(() => {
    if (!autoRetryActive) return;
    const tick = () => {
      const remainingMs = retryDeadlineRef.current - Date.now();
      if (remainingMs <= 0) {
        autoRetryActiveRef.current = false;
        setAutoRetrySecondsLeft(0);
        setAutoRetryActive(false);
        return;
      }
      setAutoRetrySecondsLeft(Math.ceil(remainingMs / 1000));
    };
    tick();
    const countdown = window.setInterval(tick, 1000);
    const retry = window.setInterval(() => {
      if (Date.now() < retryDeadlineRef.current) setMediaRetryKey((key) => key + 1);
    }, 4000);
    return () => {
      window.clearInterval(countdown);
      window.clearInterval(retry);
    };
  }, [autoRetryActive]);

  const ensureSession = useCallback(async () => {
    if (!video || !device?.authorized) return null;
    if (capabilityRef.current) return capabilityRef.current;
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = activityRepository.startViewSession(video.id, clientSessionIdRef.current, playbackMode)
        .then(({ id, writeToken }) => {
          capabilityRef.current = { id, writeToken };
          return capabilityRef.current;
        })
        .catch(() => null)
        .finally(() => { sessionPromiseRef.current = null; });
    }
    return sessionPromiseRef.current;
  }, [device?.authorized, playbackMode, video]);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length) {
        const item = queueRef.current[0];
        try {
          await activityRepository.updateViewSession(item.sessionId, item.payload, item.keepalive);
          queueRef.current.shift();
        } catch (error) {
          if (error instanceof ApiError && [400, 403, 409, 410].includes(error.status)) {
            queueRef.current.shift();
            continue;
          }
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

    const consumesLeisure = playbackMode === "video" && video?.seriesType === "leisure";
    if (deltaSeconds > 0 && consumesLeisure) {
      remainingSecsRef.current = Math.max(0, remainingSecsRef.current - deltaSeconds);
      if (remainingSecsRef.current <= 0) {
        playerRef.current?.pause();
        setTimeUp(true);
      }
    }

    if (!device?.authorized) return;
    const capability = capabilityRef.current || await ensureSession();
    if (!capability) return;
    const payload: UpdateViewSessionInput = {
      writeToken: capability.writeToken,
      heartbeatSeq: ++heartbeatSeqRef.current,
      deltaSeconds,
      positionSeconds: Math.max(0, Math.round(playerRef.current?.getCurrentTime() || currentPosRef.current)),
      intervalStartedAt: playingStartWallRef.current,
      intervalEndedAt: playingStartWallRef.current ? nowIso : null,
      status,
    };
    playingStartWallRef.current = playingStartPerfRef.current === null ? null : nowIso;
    queueRef.current.push({ sessionId: capability.id, payload, keepalive });
    void drainQueue();
  }, [device?.authorized, drainQueue, ensureSession, playbackMode, video?.seriesType]);

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
      if (playbackMode === "video" && video?.seriesType === "leisure" && remainingSecsRef.current <= 0) {
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
  }, [ensureSession, flushTracking, playbackMode, video?.seriesType]);

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
    if (!device?.authorized || parentPaused || outsideWindow) return;
    if (playbackMode === "video" && video?.seriesType === "leisure" && remainingSecsRef.current <= 0) {
      setTimeUp(true);
      return;
    }
    if (playerStateRef.current === "PLAYING") {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const switchPlaybackMode = async (mode: PlaybackMode) => {
    if (mode === playbackMode || !video || video.source !== "self_hosted") return;
    playerRef.current?.pause();
    await flushTracking("ended");
    capabilityRef.current = null;
    sessionPromiseRef.current = null;
    clientSessionIdRef.current = crypto.randomUUID();
    heartbeatSeqRef.current = 0;
    queueRef.current = [];
    setPlaybackMode(mode);
    if (mode === "listen") {
      setTimeUp(false);
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
  if (loadError === "DEVICE_AUTH_REQUIRED") return (
    <main className="kid-shell"><div className="limit-card"><span className="ended-badge">🔐</span><h1>請家長先授權這台裝置</h1><p>授權一次後，孩子不需要登入，觀看紀錄與時間會自動同步。</p><Link className={buttonVariants({ size: "large" })} to="/parent/settings">前往家長設定</Link></div></main>
  );
  if (loadError) return <main className="kid-shell"><KidError message={loadError} retry={() => void load()} /></main>;
  if (!video) return <Navigate to="/" replace />;

  const activePos = isDragging ? dragPos : currentPos;
  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (activePos / totalDuration) * 100)) : 0;
  const isYouTube = video.source === "youtube";
  const hasPlayableSource = isYouTube ? !!video.youtubeVideoId : !!video.mediaUrl && !!video.mediaType;

  return (
    <main className="watch-page">
      <section className="player-surface">
        <div className={cn("player-stage", !isYouTube && "player-stage-local", playbackMode === "listen" && "player-stage-listen")}>
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
              key={mediaRetryKey}
              ref={playerRef}
              src={withMediaRetry(video.mediaUrl, mediaRetryKey)}
              mediaType={video.mediaType}
              poster={video.thumbnailUrl}
              startAt={startPosition}
              volume={volume}
              onStateChange={handlePlayerState}
              onProgress={handleNativeProgress}
              onError={handleMediaError}
              onReady={handleMediaReady}
            />
          ) : null}

          {playbackMode === "listen" && (
            <div className="listen-cover" aria-label="純聽模式">
              <Headphones aria-hidden="true" />
              <strong>純聽模式</strong>
              <span>{video.parentLabel}</span>
              <small>不顯示影片畫面，也不計入休閒時間</small>
            </div>
          )}

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

          {outsideWindow && !parentPaused && (
            <div className="ended-overlay" role="region" aria-label="目前不是可觀看時段">
              <div className="ended-content">
                <span className="ended-badge" aria-hidden="true">🕰️</span>
                <h1>現在先做別的事</h1>
                <p>{accessState?.message || "目前還沒到可觀看時段。"}</p>
                <div className="ended-buttons">
                  <Link className={buttonVariants({ variant: "secondary", size: "large" })} to="/">回首頁</Link>
                </div>
              </div>
            </div>
          )}

          {/* 時間結束畫面 (Spec #25, #26) */}
          {timeUp && !parentPaused && !outsideWindow && (
            <div className="ended-overlay" role="region" aria-label="時間到了">
              <div className="ended-content">
                <span className="ended-badge" aria-hidden="true">🌙</span>
                <h1>今天的休閒時間到了</h1>
                <p>可以回首頁選學習影片；自家影片也能切換成純聽。<br /><span style={{ color: "#b7e3ca", fontWeight: "bold" }}>✨ 休息前，想想今天最有趣的新發現吧！</span></p>

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
          {!isPlaying && !isEnded && !timeUp && !parentPaused && !outsideWindow && pausePrompts.length > 0 && currentPos > 2 && (
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
          {isEnded && !timeUp && !parentPaused && !outsideWindow && (
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
              <p>{isYouTube
                ? "影片暫時載入不了。"
                : autoRetryActive
                  ? `正在重新連線，最多再試 ${autoRetrySecondsLeft} 秒…`
                  : "目前連不到家裡的影片。請確認 Mac 與 Tailscale 都在線上。"}</p>
              <Button variant="secondary" onClick={isYouTube ? () => window.location.reload() : retryMediaNow}>
                <RotateCcw />{autoRetryActive ? "立即再試" : "再試一次"}
              </Button>
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

            {!isYouTube && video.mediaType === "video" && (
              <div className="mode-switch" role="group" aria-label="播放模式">
                <button className={playbackMode === "video" ? "active" : ""} onClick={() => void switchPlaybackMode("video")}><Play />觀看</button>
                <button className={playbackMode === "listen" ? "active" : ""} onClick={() => void switchPlaybackMode("listen")}><Headphones />純聽</button>
              </div>
            )}

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
