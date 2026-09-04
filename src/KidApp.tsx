import { ArrowLeft, Clock, Clock3, Headphones, Pause, Play, RefreshCw, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { NativeMediaPlayer } from "./components/NativeMediaPlayer";
import { YouTubePlayer, type PlayerState, type YouTubePlayerHandle } from "./components/YouTubePlayer";
import { Button, buttonVariants } from "./components/ui/button";
import { activityRepository, ApiError, contentRepository, deviceRepository } from "./data/repositories";
import { advancePlaybackQueue, modeForVideo, readPlaybackQueue, savePlaybackQueue, syncPlaybackQueue } from "./lib/playbackQueue";
import { PlaybackDiagnostics } from "./lib/playbackDiagnostics";
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

function CategoryThumbnail({ src, alt, categoryName }: { src: string; alt: string; categoryName: string }) {
  const [isPlaceholder, setIsPlaceholder] = useState(src === "/local-media-placeholder.svg");
  useEffect(() => setIsPlaceholder(src === "/local-media-placeholder.svg"), [src]);
  return (
    <>
      <img
        src={src}
        alt={alt}
        onError={(event) => {
          showThumbnailFallback(event);
          setIsPlaceholder(true);
        }}
      />
      {isPlaceholder && <span className="category-thumbnail-label">{categoryName}</span>}
    </>
  );
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

function formatCategoryPlayedTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "今日 0 分鐘";
  const mins = Math.floor(seconds / 60);
  if (mins === 0) return "今日 < 1 分鐘";
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) {
    return remMins > 0 ? `今日 ${hours} 小時 ${remMins} 分鐘` : `今日 ${hours} 小時`;
  }
  return `今日 ${mins} 分鐘`;
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

function PlaybackModeSelector({ mode, onChange, label = "播放模式" }: {
  mode: PlaybackMode;
  onChange: (mode: PlaybackMode) => void;
  label?: string;
}) {
  return (
    <div className="playback-mode-selector" role="group" aria-label={label}>
      <button type="button" className={mode === "video" ? "active" : ""} aria-pressed={mode === "video"} onClick={() => onChange("video")}>
        <Play />觀看
      </button>
      <button type="button" className={mode === "listen" ? "active" : ""} aria-pressed={mode === "listen"} onClick={() => onChange("listen")}>
        <Headphones />純聽
      </button>
    </div>
  );
}

function preferredModeKey(seriesType: "learning" | "leisure") {
  return seriesType === "learning" ? "kid_learning_mode" : "kid_leisure_mode";
}

function readPreferredMode(seriesType: "learning" | "leisure"): PlaybackMode {
  if (typeof window === "undefined") return "video";
  const key = preferredModeKey(seriesType);
  return window.localStorage.getItem(key) === "listen" || window.sessionStorage.getItem(key) === "listen"
    ? "listen"
    : "video";
}

function savePreferredMode(seriesType: "learning" | "leisure", mode: PlaybackMode) {
  const key = preferredModeKey(seriesType);
  window.localStorage.setItem(key, mode);
  window.sessionStorage.setItem(key, mode);
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
  const [learningMode, setLearningMode] = useState<PlaybackMode>(() => readPreferredMode("learning"));
  const [leisureMode, setLeisureMode] = useState<PlaybackMode>(() => readPreferredMode("leisure"));

  const changeLearningMode = (mode: PlaybackMode) => {
    setLearningMode(mode);
    savePreferredMode("learning", mode);
  };

  const changeLeisureMode = (mode: PlaybackMode) => {
    setLeisureMode(mode);
    savePreferredMode("leisure", mode);
  };

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
          <div className="resume-header"><span className="resume-tag">{resume.playbackMode === "listen" ? <Headphones /> : <Play />}{resume.playbackMode === "listen" ? "繼續聽" : "繼續看"}</span></div>
          <Link className="resume-card" to={`/watch/${resume.videoId}?mode=${resume.playbackMode}&t=${Math.round(resume.lastPositionSeconds)}`}>
            <div className="resume-thumb-wrapper">
              <img src={resume.thumbnailUrl} alt="" onError={showThumbnailFallback} />
              <span className="resume-pos-pill">{resume.playbackMode === "listen" ? "聽到 " : "看到 "}{formatPosition(resume.lastPositionSeconds)}</span>
            </div>
            <div className="resume-content"><h2>{resume.parentLabel}</h2><span className="resume-action-btn">{resume.playbackMode === "listen" ? <Headphones /> : <Play />}{resume.playbackMode === "listen" ? "繼續聽" : "繼續播放"}</span></div>
          </Link>
        </section>
      )}

      {!isOutsideWindow && recents.length > 0 && (
        <section className="recents-section" aria-label="最近看過">
          <h2 className="recents-title">最近看過</h2>
          <div className="recents-scroll-row">
            {recents.map((recent) => (
              <Link className="recent-card" to={`/watch/${recent.id}?mode=${recent.playbackMode}&t=${Math.round(recent.lastPositionSeconds)}`} key={recent.id}>
                <div className="recent-thumb-wrapper"><img src={recent.thumbnailUrl} alt="" onError={showThumbnailFallback} /><span className="recent-mode-badge">{recent.playbackMode === "listen" ? <><Headphones />純聽</> : <><Play />觀看</>}</span></div>
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
          <div className="series-heading">
            <h2>{group.title}</h2>
            {group.type === "learning" ? (
              <div className="series-heading-right">
                <span className="series-subtitle">不限休閒額度 · 看 2 分鐘，多 1 分鐘休閒</span>
                <PlaybackModeSelector mode={learningMode} onChange={changeLearningMode} label="學習系列播放模式" />
              </div>
            ) : (
              <PlaybackModeSelector mode={leisureMode} onChange={changeLeisureMode} label="休閒系列播放模式" />
            )}
          </div>
          <div className={`category-grid ${isOutsideWindow ? "is-disabled" : ""}`}>
            {group.items.map((category) => {
              const catState = accessState?.categoryStates?.find((cs) => cs.categoryId === category.id);
              const playedSeconds = catState?.todayPlayedSeconds || 0;
              const currentMode = group.type === "learning" ? learningMode : leisureMode;
              return isOutsideWindow ? (
                <div className={`category-card tone-${category.tone} disabled-card`} key={category.id}>
                  <span className="category-icon" aria-hidden="true">{category.icon}</span>
                  <span className="category-name-text">{category.name}</span>
                  <span className="category-time-pill">
                    ⏱️ {formatCategoryPlayedTime(playedSeconds)}
                  </span>
                </div>
              ) : (
                <Link className={`category-card tone-${category.tone}`} to={`/category/${category.id}?mode=${currentMode}`} key={category.id}>
                  <span className="category-icon" aria-hidden="true">{category.icon}</span>
                  <span className="category-name-text">{category.name}</span>
                  <span className="category-time-pill">
                    ⏱️ {formatCategoryPlayedTime(playedSeconds)}
                  </span>
                  {group.type === "leisure" && leisureReached && <span className="cat-reached-pill">一般觀看時間已到 · 純聽仍可用</span>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {device?.authorized && <p className="device-ready">這台裝置已同步觀看紀錄 ✓</p>}

    </main>
  );
}

export function CategoryPage() {
  const { categoryId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryMode: PlaybackMode = searchParams.get("mode") === "listen" ? "listen" : "video";
  const categoryModeParam = searchParams.get("mode");
  const [category, setCategory] = useState<Category | null>(null);
  const [videos, setVideos] = useState<VideoFixture[] | null>(null);
  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [error, setError] = useState("");
  const [savingLearnedId, setSavingLearnedId] = useState("");
  const [confirmVideo, setConfirmVideo] = useState<VideoFixture | null>(null);

  const resumeVideo = useMemo(() => {
    if (!videos || videos.length === 0) return null;
    const played = videos
      .filter((v) => v.lastPlayedAt || (v.lastPositionSeconds && v.lastPositionSeconds > 0))
      .sort((a, b) => {
        if (a.lastPlayedAt && b.lastPlayedAt) {
          return new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime();
        }
        if (a.lastPlayedAt) return -1;
        if (b.lastPlayedAt) return 1;
        return (b.lastPositionSeconds || 0) - (a.lastPositionSeconds || 0);
      });
    return played[0] || null;
  }, [videos]);

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

  useEffect(() => {
    if (!category) return;
    if (categoryModeParam === "video" || categoryModeParam === "listen") {
      savePreferredMode(category.seriesType, categoryModeParam);
      return;
    }
    setSearchParams({ mode: readPreferredMode(category.seriesType) }, { replace: true });
  }, [category, categoryModeParam, setSearchParams]);

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
        <Link className="video-card-main" to={`/watch/${video.id}?mode=${categoryMode}`}>
          <div className="video-thumb-container">
            <CategoryThumbnail src={video.thumbnailUrl} alt={`${video.parentLabel}影片縮圖`} categoryName={category?.name || "本機影片"} />
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
          <div className="video-thumb-container"><CategoryThumbnail src={video.thumbnailUrl} alt="" categoryName={category?.name || "本機影片"} /><span className="locked-badge">🔒 先從前五部選擇</span></div>
          <div><h2>{video.parentLabel}</h2><p>{video.youtubeTitle}</p></div>
        </div>
      )}
      <button
        type="button"
        className={cn("learned-toggle", video.isLearned && "checked")}
        disabled={!device?.authorized || savingLearnedId === video.id}
        onClick={() => setConfirmVideo(video)}
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
            <PlaybackModeSelector
              mode={categoryMode}
              onChange={(mode) => {
                savePreferredMode(category.seriesType, mode);
                setSearchParams({ mode });
              }}
              label={`${category.name}播放模式`}
            />
          </header>

          {!device?.authorized && (
            <div className="device-notice" role="status">
              <div><strong>請家長先授權這台裝置</strong><p>可以先看看有哪些影片；授權後才能播放、同步進度與標記學會。</p></div>
              <Link to="/parent/settings">家長設定</Link>
            </div>
          )}

          {resumeVideo && (
            <section className="resume-section category-resume-section" aria-label="上次播放位置">
              <div className="resume-header">
                <span className="resume-tag">
                  {resumeVideo.mediaType === "audio" || categoryMode === "listen" ? <Headphones /> : <Play />}
                  {resumeVideo.mediaType === "audio" || categoryMode === "listen" ? "上次聽到這裡" : "上次看到這裡"}
                </span>
              </div>
              <Link
                className="resume-card category-resume-card"
                to={`/watch/${resumeVideo.id}?mode=${categoryMode}&t=${Math.round(resumeVideo.lastPositionSeconds || 0)}`}
              >
                <div className="resume-thumb-wrapper">
                  <CategoryThumbnail
                    src={resumeVideo.thumbnailUrl}
                    alt={resumeVideo.parentLabel}
                    categoryName={category.name}
                  />
                  {!!resumeVideo.lastPositionSeconds && (
                    <span className="resume-pos-pill">
                      {resumeVideo.mediaType === "audio" || categoryMode === "listen" ? "聽到 " : "看到 "}
                      {formatPosition(resumeVideo.lastPositionSeconds)}
                    </span>
                  )}
                </div>
                <div className="resume-content">
                  <h2>{resumeVideo.parentLabel}</h2>
                  <p className="resume-subtitle">{resumeVideo.youtubeTitle}</p>
                  <span className="resume-action-btn">
                    {resumeVideo.mediaType === "audio" || categoryMode === "listen" ? <Headphones /> : <Play />}
                    {resumeVideo.mediaType === "audio" || categoryMode === "listen" ? "繼續聽" : "繼續播放"}
                  </span>
                </div>
              </Link>
            </section>
          )}

          <section className="learning-status-group" aria-label="今天的學習開始囉，好好動動大腦吧!!">
            <div className="learning-status-heading"><h2>🌱 今天的學習開始囉，好好動動大腦吧!!</h2><span>{videos.filter((video) => !video.isLearned).length} 部</span></div>
            <div className="video-grid">{videos.filter((video) => !video.isLearned).map(renderVideoCard)}</div>
          </section>

          {videos.some((video) => video.isLearned) && (
            <section className="learning-status-group learned-group" aria-label="已學會">
              <div className="learning-status-heading"><h2>✅ 已學會</h2><span>{videos.filter((video) => video.isLearned).length} 部</span></div>
              <div className="video-grid">{videos.filter((video) => video.isLearned).map(renderVideoCard)}</div>
            </section>
          )}

          {confirmVideo && (
            <div className="dialog-overlay" onClick={() => setConfirmVideo(null)}>
              <div
                className="dialog-content learned-confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="learned-dialog-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="learned-dialog-title" className="dialog-title">
                  {confirmVideo.isLearned ? "取消學會標記？" : "🌟 標記學會了？"}
                </h2>
                <p className="dialog-description">
                  {confirmVideo.isLearned
                    ? `要將「${confirmVideo.parentLabel}」改回未學會嗎？`
                    : `確定已經學會「${confirmVideo.parentLabel}」了嗎？標記後會移到「已學會」清單喔！`}
                </p>
                <div className="dialog-footer">
                  <button
                    type="button"
                    className="ui-button ui-button-secondary"
                    onClick={() => setConfirmVideo(null)}
                  >
                    先不要
                  </button>
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    disabled={savingLearnedId === confirmVideo.id}
                    onClick={() => {
                      const v = confirmVideo;
                      setConfirmVideo(null);
                      void toggleLearned(v);
                    }}
                  >
                    {confirmVideo.isLearned ? "確定取消" : "確定學會了 ✓"}
                  </button>
                </div>
              </div>
            </div>
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawInitialPos = Math.max(0, Number(searchParams.get("at") || searchParams.get("t") || 0) || 0);
  const hasExplicitResumePosition = searchParams.has("at") || searchParams.has("t");
  const forceFreshStart = searchParams.get("fresh") === "1";
  const requestedMode: PlaybackMode = modeForVideo(searchParams, videoId);
  const isAutoplay = searchParams.get("autoplay") === "1";

  const [video, setVideo] = useState<VideoFixture | null>(null);
  const [categoryVideos, setCategoryVideos] = useState<VideoFixture[]>([]);
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
  const diagnosticsRef = useRef<PlaybackDiagnostics | null>(null);
  const bufferingDiagnosticTimerRef = useRef<number | null>(null);

  const [playerError, setPlayerError] = useState(false);
  const [mediaRetryKey, setMediaRetryKey] = useState(0);
  const [autoRetryActive, setAutoRetryActive] = useState(false);
  const [autoRetrySecondsLeft, setAutoRetrySecondsLeft] = useState(60);
  const retryDeadlineRef = useRef(0);
  const autoRetryActiveRef = useRef(false);
  const mediaRetryAttemptRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentPos, setCurrentPos] = useState(rawInitialPos);
  const currentPosRef = useRef(rawInitialPos);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(rawInitialPos);
  const [showEdgeMasks, setShowEdgeMasks] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("video");

  const [accessState, setAccessState] = useState<ChildAccessState | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [parentPaused, setParentPaused] = useState(false);
  const [outsideWindow, setOutsideWindow] = useState(false);
  const [pausePrompts, setPausePrompts] = useState<Array<{ icon: string; text: string; shortText: string; prompt: string }>>([]);
  const [endPrompts, setEndPrompts] = useState<Array<{ icon: string; text: string; shortText: string; prompt: string }>>(() => getRandomThinkingPrompts(5));
  const remainingSecsRef = useRef<number>(999999);

  const nextTrack = useMemo(() => {
    if (!categoryVideos.length || !video) return null;
    const currentIndex = categoryVideos.findIndex((v) => v.id === video.id);
    if (currentIndex >= 0 && currentIndex < categoryVideos.length - 1) {
      return categoryVideos[currentIndex + 1];
    }
    return null;
  }, [categoryVideos, video]);

  const nextListenTrack = useMemo(() => {
    if (nextTrack) return nextTrack;
    if (categoryVideos.length > 1 && video && categoryVideos[0]?.id !== video.id) return categoryVideos[0];
    return null;
  }, [categoryVideos, nextTrack, video]);

  const nextTrackRef = useRef<VideoFixture | null>(null);
  nextTrackRef.current = nextTrack;
  const nextListenTrackRef = useRef<VideoFixture | null>(null);
  nextListenTrackRef.current = nextListenTrack;
  const youtubeListenPlaylist = useMemo(() => {
    if (playbackMode !== "listen" || video?.source !== "youtube" || video.seriesType !== "leisure") return [];
    return categoryVideos
      .filter((item) => item.source === "youtube" && !!item.youtubeVideoId)
      .map((item) => item.youtubeVideoId!);
  }, [categoryVideos, playbackMode, video?.seriesType, video?.source]);
  const usesYouTubeListenPlaylist = youtubeListenPlaylist.length > 1 && !!video?.youtubeVideoId
    && youtubeListenPlaylist.includes(video.youtubeVideoId);
  const usesYouTubeListenPlaylistRef = useRef(false);
  usesYouTubeListenPlaylistRef.current = usesYouTubeListenPlaylist;
  const playbackModeRef = useRef<PlaybackMode>(playbackMode);
  playbackModeRef.current = playbackMode;

  // A route can advance to another episode without unmounting WatchPage. Each
  // episode still needs its own write capability and heartbeat sequence.
  useEffect(() => {
    capabilityRef.current = null;
    sessionPromiseRef.current = null;
    clientSessionIdRef.current = crypto.randomUUID();
    heartbeatSeqRef.current = 0;
    accumulatedPlayMsRef.current = 0;
    playingStartPerfRef.current = null;
    playingStartWallRef.current = null;
    playerStateRef.current = "READY";
    setIsEnded(false);
    setTimeUp(false);
    setPlayerError(false);
    setTotalDuration(0);
  }, [videoId]);

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
      const initialMode: PlaybackMode = nextVideo.mediaType === "audio" || requestedMode === "listen" ? "listen" : "video";
      let nextCategoryVideos: VideoFixture[] = [];
      if (nextVideo.categoryId) {
        nextCategoryVideos = await contentRepository.getVideos(nextVideo.categoryId).catch(() => []);
        syncPlaybackQueue(nextVideo.categoryId, initialMode, nextCategoryVideos, nextVideo.id);
      }
      // Load the category queue before mounting YouTube. Pure-listening mode
      // can then cue the complete playlist before the child's first play tap.
      setCategoryVideos(nextCategoryVideos);
      setPlaybackMode(initialMode);
      setVideo(nextVideo);
      const resumePosition = forceFreshStart || !hasExplicitResumePosition ? 0 : rawInitialPos;
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
  }, [forceFreshStart, hasExplicitResumePosition, rawInitialPos, requestedMode, videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!video || !device?.authorized) return;
    const diagnostics = new PlaybackDiagnostics(device, video, playbackMode);
    diagnosticsRef.current = diagnostics;
    diagnostics.event("player_created", { state: video.source });
    if (video.source === "self_hosted" && video.mediaUrl) void diagnostics.probeMedia(video.mediaUrl, "playback_start");
    const onWindowError = (event: ErrorEvent) => diagnostics.event(
      "javascript_error", { message: event.error?.name || "window_error" }, "JAVASCRIPT_ERROR", currentPosRef.current,
    );
    const onUnhandled = (event: PromiseRejectionEvent) => diagnostics.event(
      "javascript_error", { message: event.reason instanceof Error ? event.reason.name : "unhandled_rejection" },
      "UNHANDLED_REJECTION", currentPosRef.current,
    );
    const onPageHide = () => { void diagnostics.finish(true); };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("pagehide", onPageHide);
    const autoplayTimer = isAutoplay ? window.setTimeout(() => {
      if (!diagnostics.hasPlayedSuccessfully()) diagnostics.event(
        "autoplay_blocked", { state: playerStateRef.current }, "AUTOPLAY_NOT_STARTED", currentPosRef.current,
      );
    }, 4_000) : null;
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("pagehide", onPageHide);
      if (autoplayTimer !== null) window.clearTimeout(autoplayTimer);
      if (bufferingDiagnosticTimerRef.current !== null) {
        window.clearTimeout(bufferingDiagnosticTimerRef.current);
        bufferingDiagnosticTimerRef.current = null;
      }
      if (diagnosticsRef.current === diagnostics) diagnosticsRef.current = null;
      void diagnostics.finish(true);
    };
  }, [device?.authorized, device?.device?.id, isAutoplay, playbackMode, video?.id]);

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
    mediaRetryAttemptRef.current = 1;
    setAutoRetrySecondsLeft(60);
    setAutoRetryActive(true);
    setPlayerError(true);
    diagnosticsRef.current?.event("retry_started", { retryNumber: mediaRetryAttemptRef.current, networkOnline: navigator.onLine }, undefined, retryPosition);
    if (video?.mediaUrl) void diagnosticsRef.current?.probeMedia(video.mediaUrl, "retry_start");
    setMediaRetryKey((key) => key + 1);
  }, [video?.mediaUrl]);

  const handleMediaError = useCallback((mediaError?: MediaError | null) => {
    setPlayerError(true);
    const code = mediaError?.code ? `MEDIA_ERROR_${mediaError.code}` : "MEDIA_ERROR";
    diagnosticsRef.current?.event("media_error", { mediaErrorCode: mediaError?.code || 0, networkOnline: navigator.onLine }, code, currentPosRef.current);
    if (video?.mediaUrl) void diagnosticsRef.current?.probeMedia(video.mediaUrl, "media_error");
    if (video?.source !== "self_hosted" || autoRetryActiveRef.current) return;
    startMediaRetry();
  }, [startMediaRetry, video?.mediaUrl, video?.source]);

  const handleMediaReady = useCallback(() => {
    const recoveredFromRetry = autoRetryActiveRef.current;
    retryDeadlineRef.current = 0;
    autoRetryActiveRef.current = false;
    setAutoRetryActive(false);
    setAutoRetrySecondsLeft(60);
    setPlayerError(false);
    if (recoveredFromRetry) {
      diagnosticsRef.current?.event("retry_succeeded", { retryNumber: mediaRetryAttemptRef.current }, undefined, currentPosRef.current);
    }
  }, []);

  const retryMediaNow = useCallback(() => {
    if (autoRetryActive) {
      mediaRetryAttemptRef.current += 1;
      diagnosticsRef.current?.event("retry_started", {
        retryNumber: mediaRetryAttemptRef.current,
        networkOnline: navigator.onLine,
      }, undefined, currentPosRef.current);
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
      if (Date.now() < retryDeadlineRef.current) {
        mediaRetryAttemptRef.current += 1;
        diagnosticsRef.current?.event("retry_started", {
          retryNumber: mediaRetryAttemptRef.current,
          networkOnline: navigator.onLine,
        }, undefined, currentPosRef.current);
        setMediaRetryKey((key) => key + 1);
      }
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

  const restartVideo = useCallback(() => {
    setIsEnded(false);
    playerRef.current?.seekTo(0);
    setCurrentPos(0);
    playerRef.current?.play();
  }, []);

  const handlePlayerState = useCallback((state: PlayerState) => {
    playerStateRef.current = state;
    setIsPlaying(state === "PLAYING");
    const diagnosticEvent = ({ READY: "player_ready", PLAYING: "playing", PAUSED: "paused", BUFFERING: "buffering", ENDED: "ended" } as const)[state];
    diagnosticsRef.current?.event(diagnosticEvent, {
      state,
      ...(playerRef.current?.getAudioState?.() || {}),
    }, undefined, currentPosRef.current);
    if (state === "PLAYING") void diagnosticsRef.current?.flush();
    if (state === "BUFFERING") {
      if (bufferingDiagnosticTimerRef.current !== null) window.clearTimeout(bufferingDiagnosticTimerRef.current);
      bufferingDiagnosticTimerRef.current = window.setTimeout(() => {
        diagnosticsRef.current?.event("media_error", { state: "buffering_timeout", networkOnline: navigator.onLine }, "BUFFERING_OVER_8S", currentPosRef.current);
      }, 8_000);
    } else if (bufferingDiagnosticTimerRef.current !== null) {
      window.clearTimeout(bufferingDiagnosticTimerRef.current);
      bufferingDiagnosticTimerRef.current = null;
    }
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
      if (playbackModeRef.current === "video" && video?.seriesType === "leisure" && remainingSecsRef.current <= 0) {
        setTimeUp(true);
      } else if (playbackModeRef.current === "listen" || video?.mediaType === "audio") {
        if (video?.seriesType === "learning") {
          // 學習系列純聽模式：重複播放當前的內容
          restartVideo();
        } else if (!usesYouTubeListenPlaylistRef.current) {
          // 休閒系列純聽模式：自動接續播放下一集
          if (nextListenTrackRef.current) {
            const queue = readPlaybackQueue();
            const targetId = queue?.mode === "listen"
              ? advancePlaybackQueue(queue, video!.id) || nextListenTrackRef.current.id
              : nextListenTrackRef.current.id;
            if (queue) savePlaybackQueue({ ...queue, mode: "listen", currentVideoId: targetId });
            diagnosticsRef.current?.event("next_requested", { state: targetId }, undefined, currentPosRef.current);
            navigate(`/watch/${targetId}?mode=listen&autoplay=1&fresh=1`, { replace: true });
          }
        }
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
  }, [ensureSession, flushTracking, navigate, restartVideo, video?.mediaType, video?.seriesType]);

  const handleYouTubePlaylistVideoChange = useCallback((youtubeVideoId: string) => {
    if (!usesYouTubeListenPlaylistRef.current || youtubeVideoId === video?.youtubeVideoId) return;
    const target = categoryVideos.find((item) => item.youtubeVideoId === youtubeVideoId);
    if (!target) return;
    const queue = readPlaybackQueue();
    if (queue) savePlaybackQueue({ ...queue, mode: "listen", currentVideoId: target.id });
    diagnosticsRef.current?.event("next_requested", { state: target.id, transition: "youtube_playlist" }, undefined, currentPosRef.current);
    navigate(`/watch/${target.id}?mode=listen&autoplay=1&fresh=1`, { replace: true });
  }, [categoryVideos, navigate, video?.youtubeVideoId]);

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
    const onVisibility = () => {
      diagnosticsRef.current?.event(document.visibilityState === "hidden" ? "visibility_hidden" : "visibility_visible", {
        state: document.visibilityState, networkOnline: navigator.onLine,
      }, undefined, currentPosRef.current);
      if (document.visibilityState === "hidden") {
        void diagnosticsRef.current?.flush(true);
        void flushTracking("active", true);
      }
    };
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
    diagnosticsRef.current?.event("play_requested", { state: playerStateRef.current }, undefined, currentPosRef.current);
    if (playerStateRef.current === "PLAYING") {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const seekRelative = useCallback((delta: number) => {
    const current = playerRef.current?.getCurrentTime() ?? currentPos;
    const max = totalDuration > 0 ? totalDuration : 999999;
    const target = Math.max(0, Math.min(max, current + delta));
    playerRef.current?.seekTo(target);
    setCurrentPos(target);
    diagnosticsRef.current?.event("seeked", { state: delta < 0 ? "backward_10" : "forward_10" }, undefined, target);
  }, [currentPos, totalDuration]);

  useEffect(() => {
    const handleKeyboardSeek = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      seekRelative(event.key === "ArrowLeft" ? -10 : 10);
    };

    window.addEventListener("keydown", handleKeyboardSeek);
    return () => window.removeEventListener("keydown", handleKeyboardSeek);
  }, [seekRelative]);

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(event.target.value);
    setDragPos(val);
    setCurrentPos(val);
  };

  const handleSliderCommit = (val: number) => {
    setIsDragging(false);
    playerRef.current?.seekTo(val);
    setCurrentPos(val);
    diagnosticsRef.current?.event("seeked", { state: "scrubber" }, undefined, val);
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
              playbackRate={playbackRate}
              autoPlay={isAutoplay}
              playlist={usesYouTubeListenPlaylist ? youtubeListenPlaylist : undefined}
              playlistStartIndex={usesYouTubeListenPlaylist ? youtubeListenPlaylist.indexOf(video.youtubeVideoId) : 0}
              onVideoChange={handleYouTubePlaylistVideoChange}
              onStateChange={handlePlayerState}
              onError={(code) => {
                setPlayerError(true);
                diagnosticsRef.current?.event("youtube_error", { youtubeErrorCode: code || 0 }, `YT_ERROR_${code || "UNKNOWN"}`, currentPosRef.current);
              }}
            />
          ) : video.mediaUrl && video.mediaType ? (
            <NativeMediaPlayer
              key={mediaRetryKey}
              ref={playerRef}
              src={withMediaRetry(video.mediaUrl, mediaRetryKey)}
              mediaType={playbackMode === "listen" ? "audio" : video.mediaType}
              poster={video.thumbnailUrl}
              startAt={startPosition}
              volume={volume}
              playbackRate={playbackRate}
              autoPlay={isAutoplay}
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
              <small>
                {video.seriesType === "learning"
                  ? "學習系列 · 重複播放當前內容 🔁"
                  : "休閒系列 · 自動接續下一集 ⏭️"}
              </small>
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
                  {nextTrack && (
                    <Button
                      size="large"
                      onClick={() => navigate(`/watch/${nextTrack.id}?mode=${playbackMode}&autoplay=1&fresh=1`)}
                    >
                      <Play /> 下一集：{nextTrack.parentLabel}
                    </Button>
                  )}
                  <Button size="large" variant="secondary" onClick={restartVideo}>
                    <RotateCcw /> 再看一次
                  </Button>
                  <Link className={buttonVariants({ variant: "secondary", size: "large" })} to="/">
                    回首頁
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 暫停時提醒與 5 組隨機思考問題 */}
          {!isPlaying && !isEnded && !timeUp && !parentPaused && !outsideWindow && pausePrompts.length > 0 && currentPos > 2 && (
            <div className="pause-reminder-overlay" role="region" aria-label="暫停思考提示" onClick={togglePlay}>
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
                  <Button size="large" variant="secondary" onClick={(event) => {
                    event.stopPropagation();
                    togglePlay();
                  }}>
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
                  {nextTrack && (
                    <Button
                      size="large"
                      onClick={() => navigate(`/watch/${nextTrack.id}?mode=${playbackMode}&autoplay=1&fresh=1`)}
                    >
                      <Play /> 下一集：{nextTrack.parentLabel}
                    </Button>
                  )}
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
            <div className="player-left-group" onClick={(e) => e.stopPropagation()}>
              <Link
                className="player-back"
                to={`/category/${video.categoryId}?mode=${playbackMode}`}
                onClick={() => {
                  playerRef.current?.pause();
                  void flushTracking("ended");
                }}
              >
                <ArrowLeft />回去
              </Link>

              <div className="speed-control" title="播放速度">
                <select
                  id="playback-speed-select"
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  className="speed-select"
                  aria-label="播放速度"
                >
                  <option value={0.6}>0.6</option>
                  <option value={0.8}>0.8</option>
                  <option value={1.0}>1.0</option>
                </select>
              </div>
            </div>

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

              {nextTrack && (
                <Button
                  type="button"
                  variant="secondary"
                  className="seek-btn next-track-btn"
                  aria-label="下一集"
                  title={`下一集：${nextTrack.parentLabel}`}
                  onClick={() => {
                    diagnosticsRef.current?.event("next_requested", { state: nextTrack.id }, undefined, currentPosRef.current);
                    navigate(`/watch/${nextTrack.id}?mode=${playbackMode}&autoplay=1&fresh=1`);
                  }}
                >
                  <span>下一集 ⏭️</span>
                </Button>
              )}
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
