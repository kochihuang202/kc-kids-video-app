import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Calendar, Check,
  ChevronLeft, ChevronRight, Clock3, Download, Eye, EyeOff, Film, GripVertical, History,
  Home, LogOut, MessageCircle, Play, Plus, RefreshCw, RotateCcw, Save, Search, Settings,
  Smartphone, Sparkles, Star, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, buttonVariants } from "./components/ui/button";
import { parentRepository, type VideoPreview } from "./data/repositories";
import { formatClock, formatPosition, getDayRangeInTimeZone } from "./lib/utils";
import type {
  AdminCategory, AdminVideo, AllowedWindow, ChildDevice, DailyBar, DailyOverride, NoteSearchResult, SummaryAnalytics,
  TodayDashboard, TodayPick, UsageRule, VideoHistoryResponse,
} from "./types";

function formatPlayedDuration(seconds: number) {
  if (seconds <= 0) return "0 分鐘";
  if (seconds < 60) return "少於 1 分鐘";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小時 ${minutes} 分`;
  return `${minutes} 分鐘`;
}

function formatExactDuration(seconds: number) {
  if (seconds <= 0) return "0 秒";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSecs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} 小時`);
  if (minutes > 0) parts.push(`${minutes} 分`);
  if (remainingSecs > 0 || parts.length === 0) parts.push(`${remainingSecs} 秒`);
  return parts.join(" ");
}

function ParentState({ children, error, retry }: { children?: ReactNode; error?: string; retry?: () => void }) {
  return (
    <div className={`dashboard-state ${error ? "error-state" : ""}`} role={error ? "alert" : "status"}>
      {children || <p>{error}</p>}
      {error && retry && <Button variant="secondary" onClick={retry}><RefreshCw />再試一次</Button>}
    </div>
  );
}

export function ParentLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await parentRepository.login(password);
      navigate("/parent/today", { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登入失敗。");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="parent-login-shell">
      <form className="parent-login-card" onSubmit={(event) => void submit(event)}>
        <div className="brand-mark">小</div>
        <p className="parent-kicker">小小選片 · 家長</p>
        <h1>家長登入</h1>
        <p>登入後可以管理白名單、觀看時段與提醒設定。</p>
        <label>
          家長密碼
          <input
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button size="large" type="submit" disabled={loading || password.length < 8}>
          {loading ? "登入中…" : "登入"}
        </Button>
        <Link to="/">回孩子首頁</Link>
      </form>
    </main>
  );
}

function ParentGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "yes" | "no">("loading");
  useEffect(() => {
    let active = true;
    parentRepository.session().then((result) => { if (active) setState(result.authenticated ? "yes" : "no"); }).catch(() => { if (active) setState("no"); });
    return () => { active = false; };
  }, [location.pathname]);
  if (state === "loading") return <main className="parent-shell"><ParentState>正在確認家長登入…</ParentState></main>;
  if (state === "no") return <Navigate to="/parent/login" replace state={{ from: location.pathname }} />;
  return children;
}

function ParentLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const logout = async () => {
    await parentRepository.logout().catch(() => undefined);
    navigate("/parent/login", { replace: true });
  };
  return (
    <main className="parent-shell">
      <header className="parent-topbar">
        <div><p className="parent-kicker">小小選片 · 家長</p><h1>管理中心</h1></div>
        <div className="parent-top-actions">
          <Link className="parent-home" to="/"><Home />孩子首頁</Link>
          <button onClick={() => void logout()}><LogOut />登出</button>
        </div>
      </header>
      <nav className="parent-nav" aria-label="家長功能">
        <NavLink to="/parent/today">觀看紀錄</NavLink>
        <NavLink to="/parent/rules">提醒與時段</NavLink>
        <NavLink to="/parent/videos">影片管理</NavLink>
        <NavLink to="/parent/categories">分類管理</NavLink>
        <NavLink to="/parent/settings">設定</NavLink>
      </nav>
      {children}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. History & Today Page (Spec #18 ~ #22)
// ─────────────────────────────────────────────────────────────────────────────

function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get("date") || "";

  const [dashboard, setDashboard] = useState<TodayDashboard | null>(null);
  const [calendarDates, setCalendarDates] = useState<string[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Taipei");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString("zh-TW", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
  }, [timezone]);

  const activeDateStr = dateParam || todayStr;
  const isToday = activeDateStr === todayStr;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const settings = await parentRepository.settings();
      const tz = typeof settings.timezone === "string" ? settings.timezone : "Asia/Taipei";
      setTimezone(tz);

      const target = new Date(`${activeDateStr}T12:00:00+08:00`);
      const { start, end } = getDayRangeInTimeZone(tz, target);

      const [dashData, calData] = await Promise.all([
        parentRepository.dashboard(start, end),
        parentRepository.calendarHistory().catch(() => ({ month: "all", dates: [] })),
      ]);

      setDashboard(dashData);
      setCalendarDates(calData.dates || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "資料載入失敗。");
    } finally {
      setLoading(false);
    }
  }, [activeDateStr]);

  useEffect(() => { void load(); }, [load]);

  const changeDateDelta = (deltaDays: number) => {
    const current = new Date(`${activeDateStr}T12:00:00+08:00`);
    current.setDate(current.getDate() + deltaDays);
    const nextStr = current.toLocaleDateString("zh-TW", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    if (nextStr > todayStr) return;
    setSearchParams(nextStr === todayStr ? {} : { date: nextStr });
  };

  const selectCalendarDate = (dateStr: string) => {
    if (dateStr > todayStr) return;
    setCalendarOpen(false);
    setSearchParams(dateStr === todayStr ? {} : { date: dateStr });
  };

  const handleBonus = async (minutes: number) => {
    try {
      await parentRepository.addBonusMinutes(minutes);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "加時失敗");
    }
  };

  const handlePause = async () => {
    try {
      await parentRepository.pauseToday();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "暫停失敗");
    }
  };

  const handleResume = async () => {
    try {
      await parentRepository.resumeToday();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "恢復失敗");
    }
  };

  return (
    <div className="parent-content">
      {/* Date Navigation & Calendar (Spec #19, #20) */}
      <div className="date-nav-bar">
        <Button variant="secondary" onClick={() => changeDateDelta(-1)}>
          <ChevronLeft /> 前一天
        </Button>

        <div className="date-display-wrapper">
          <button
            type="button"
            className="date-center-btn"
            onClick={() => setCalendarOpen(!calendarOpen)}
            aria-expanded={calendarOpen}
          >
            <Calendar />
            <strong>{activeDateStr} {isToday ? "（今天）" : ""}</strong>
          </button>

          {!isToday && (
            <Button variant="quiet" onClick={() => setSearchParams({})}>
              回到今天
            </Button>
          )}
        </div>

        <Button
          variant="secondary"
          disabled={isToday}
          onClick={() => changeDateDelta(1)}
        >
          後一天 <ChevronRight />
        </Button>
      </div>

      {/* Quick Parent Control Bar (Spec #30 ~ #38) */}
      {isToday && dashboard && dashboard.ruleState && (
        <div className="quick-control-bar">
          <div className="quick-control-status">
            <span className="control-indicator">
              {dashboard.ruleState.isPaused ? "⏸️ 孩子端目前已暫停" : "🌱 孩子端運行中"}
            </span>
            <strong className="control-progress">
              今日播放 {Math.round(dashboard.ruleState.todayPlayedSeconds / 60)} / {Math.round(dashboard.ruleState.dailyLimitSeconds / 60)} 分鐘
              {dashboard.ruleState.bonusSeconds > 0 && ` (含加時 ${Math.round(dashboard.ruleState.bonusSeconds / 60)} 分)`}
              ，剩餘約 {Math.round(dashboard.ruleState.remainingSeconds / 60)} 分鐘
            </strong>
          </div>
          <div className="quick-control-actions">
            <Button variant="secondary" onClick={() => void handleBonus(10)}>+10 分鐘</Button>
            <Button variant="secondary" onClick={() => void handleBonus(20)}>+20 分鐘</Button>
            {dashboard.ruleState.isPaused ? (
              <Button variant="primary" onClick={() => void handleResume()}>恢復觀看</Button>
            ) : (
              <Button variant="danger" onClick={() => void handlePause()}>暫停觀看</Button>
            )}
          </div>
        </div>
      )}

      {/* Calendar View with Dot Indicators (Spec #20) */}
      {calendarOpen && (
        <div className="calendar-popover">
          <div className="calendar-popover-header">
            <h4>選擇日期（● 表示當天有紀錄）</h4>
            <Button variant="quiet" onClick={() => setCalendarOpen(false)}>關閉</Button>
          </div>
          <div className="calendar-date-chips">
            {calendarDates.map((date) => (
              <button
                key={date}
                type="button"
                className={`cal-chip ${date === activeDateStr ? "is-selected" : ""}`}
                onClick={() => selectCalendarDate(date)}
              >
                <span>●</span> {date.slice(5)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <ParentState>正在載入 {activeDateStr} 的紀錄…</ParentState>}
      {error && <ParentState error={error} retry={() => void load()} />}

      {!loading && dashboard && (
        <>
          {/* Summary Cards */}
          <section className="summary-section" aria-label="當日摘要">
            {dashboard.errors.summary ? (
              <ParentState error={dashboard.errors.summary} retry={() => void load()} />
            ) : (
              <>
                <div className="summary-card summary-main">
                  <Clock3 />
                  <span>影片播放</span>
                  <strong>{formatPlayedDuration(dashboard.summary.totalPlayedSeconds)}</strong>
                </div>
                <div className="summary-card">
                  <Film />
                  <strong>{dashboard.summary.playedVideoCount}</strong>
                  <span>部不同影片</span>
                </div>
                <div className="summary-card">
                  <Play />
                  <strong>{dashboard.summary.sessionCount}</strong>
                  <span>次播放</span>
                </div>
              </>
            )}
          </section>

          {/* 分類時間統計 (Category Breakdown) */}
          {dashboard.categoryStats && dashboard.categoryStats.length > 0 && (
            <section className="category-stats-section">
              <div className="section-header-block">
                <p className="section-label">{activeDateStr} 各分類觀看時間統計</p>
              </div>
              <div className="category-stats-grid">
                {dashboard.categoryStats.map((cat) => (
                  <div className={`cat-stat-card tone-${cat.tone}`} key={cat.categoryId}>
                    <div className="cat-stat-top">
                      <div className="cat-stat-heading">
                        <span className="cat-stat-icon">{cat.icon}</span>
                        <strong className="cat-stat-name">{cat.name}</strong>
                      </div>
                      <span className="cat-stat-pct">佔比 {cat.percentage}%</span>
                    </div>
                    <div className="cat-stat-bar-track">
                      <div className="cat-stat-bar-fill" style={{ width: `${Math.max(4, cat.percentage)}%` }} />
                    </div>
                    <div className="cat-stat-bottom">
                      <strong className="cat-stat-time">{formatExactDuration(cat.playedSeconds)}</strong>
                      <span className="cat-stat-counts">{cat.videoCount} 部影片 · {cat.sessionCount} 次播放</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 裝置播放統計 (若有多台裝置) */}
          {dashboard.deviceStats && dashboard.deviceStats.length > 1 && (
            <section className="category-stats-section">
              <div className="section-header-block">
                <p className="section-label">{activeDateStr} 各裝置播放分佈</p>
              </div>
              <div className="category-stats-grid">
                {dashboard.deviceStats.map((dev) => (
                  <div className="cat-stat-card tone-sky" key={dev.deviceId}>
                    <div className="cat-stat-top">
                      <div className="cat-stat-heading">
                        <Smartphone />
                        <strong className="cat-stat-name">{dev.deviceName}</strong>
                      </div>
                      <span className="cat-stat-pct">佔比 {dev.percentage}%</span>
                    </div>
                    <div className="cat-stat-bar-track">
                      <div className="cat-stat-bar-fill" style={{ width: `${Math.max(4, dev.percentage)}%` }} />
                    </div>
                    <div className="cat-stat-bottom">
                      <strong className="cat-stat-time">{formatExactDuration(dev.playedSeconds)}</strong>
                      <span className="cat-stat-counts">{dev.videoCount} 部影片 · {dev.sessionCount} 次播放</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 已播放過的清單 (Play History List) */}
          <section className="timeline-section">
            <div className="section-header-block">
              <p className="section-label">{activeDateStr} 已播放過的清單</p>
              <span className="section-sub-tip">（已自動扣除暫停時間，跳離重進視為獨立紀錄）</span>
            </div>

            {dashboard.errors.timeline ? (
              <ParentState error={dashboard.errors.timeline} retry={() => void load()} />
            ) : dashboard.timeline.length ? (
              <div className="play-history-card-list">
                {dashboard.timeline.map((session) => (
                  <article className="play-history-card" key={session.id}>
                    <div className="play-history-top">
                      <div className="play-history-title-block">
                        <div className="play-history-badges">
                          {session.categoryNames && session.categoryNames.length > 0 ? (
                            session.categoryNames.map((cat, idx) => (
                              <span className="category-chip" key={idx}>{cat}</span>
                            ))
                          ) : (
                            <span className="category-chip muted">未分類</span>
                          )}
                          <span className="device-chip">
                            <Smartphone /> {session.deviceName || "家庭裝置"}
                          </span>
                          <span className="play-time-badge">
                            <Clock3 /> 開始於 {formatClock(session.startedAt)}
                          </span>
                        </div>
                        <h3 className="play-history-title">{session.videoLabel}</h3>
                      </div>

                      <Link className="play-review-btn" to={`/watch/${session.videoId}?t=${Math.round(session.lastPositionSeconds)}`}>
                        <Play /> 重看
                      </Link>
                    </div>

                    <div className="play-history-details">
                      <div className="play-detail-item">
                        <span className="detail-label">實際觀看時長：</span>
                        <strong className="detail-value played-time">
                          {formatExactDuration(session.playedSeconds)}
                        </strong>
                      </div>
                      <div className="play-detail-item">
                        <span className="detail-label">上次觀看位置：</span>
                        <span className="detail-value">{formatPosition(session.lastPositionSeconds)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-timeline-card">
                <Film />
                <p>{activeDateStr} 尚無播放紀錄。</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 7-Day & 30-Day Summary Analytics (Spec #23 ~ #26)
// ─────────────────────────────────────────────────────────────────────────────

function SummaryPage() {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [data, setData] = useState<SummaryAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await parentRepository.summaryAnalytics(range);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入統計失敗");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const maxPlayed = useMemo(() => {
    if (!data?.dailyBars?.length) return 1;
    return Math.max(1, ...data.dailyBars.map((b) => b.playedSeconds));
  }, [data]);

  return (
    <div className="parent-content">
      <header className="parent-page-title">
        <div>
          <p>長期成長與使用回顧</p>
          <h2>摘要回顧</h2>
        </div>
        <div className="range-toggle-tabs">
          <button
            type="button"
            className={`tab-btn ${range === "7d" ? "is-active" : ""}`}
            onClick={() => setRange("7d")}
          >
            最近 7 天
          </button>
          <button
            type="button"
            className={`tab-btn ${range === "30d" ? "is-active" : ""}`}
            onClick={() => setRange("30d")}
          >
            最近 30 天
          </button>
        </div>
      </header>

      {loading && <ParentState>正在彙整 {range === "7d" ? "7 天" : "30 天"} 摘要…</ParentState>}
      {error && <ParentState error={error} retry={() => void load()} />}

      {!loading && data && (
        <>
          {/* Summary Overview Cards */}
          <section className="summary-section">
            <div className="summary-card summary-main">
              <Clock3 />
              <span>{range === "7d" ? "7 天" : "30 天"} 總播放時數</span>
              <strong>{formatPlayedDuration(data.summary.totalPlayedSeconds)}</strong>
            </div>
            <div className="summary-card">
              <Film />
              <strong>{data.summary.playedVideoCount}</strong>
              <span>部不同影片</span>
            </div>
            <div className="summary-card">
              <MessageCircle />
              <strong>{data.summary.noteCount}</strong>
              <span>個累積想法</span>
            </div>
          </section>

          {/* Simple Clean Bar Chart (Spec #24) */}
          <section className="chart-card">
            <h3 className="section-label"><Clock3 /> 每日影片播放時間</h3>
            <div className="daily-bar-chart">
              {data.dailyBars.map((bar) => {
                const percent = Math.round((bar.playedSeconds / maxPlayed) * 100);
                return (
                  <div className="bar-col" key={bar.date}>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${percent}%` }} />
                    </div>
                    <span className="bar-val">{bar.playedSeconds > 0 ? `${Math.round(bar.playedSeconds / 60)}m` : "-"}</span>
                    <span className="bar-label">{bar.label.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 各分類累積觀看時間統計 */}
          {data.categoryStats && data.categoryStats.length > 0 && (
            <section className="chart-card">
              <h3 className="section-label"><Film /> {range === "7d" ? "最近 7 天" : "最近 30 天"} 各分類累積觀看時間</h3>
              <div className="category-stats-grid">
                {data.categoryStats.map((cat) => (
                  <div className={`cat-stat-card tone-${cat.tone}`} key={cat.categoryId}>
                    <div className="cat-stat-top">
                      <div className="cat-stat-heading">
                        <span className="cat-stat-icon">{cat.icon}</span>
                        <strong className="cat-stat-name">{cat.name}</strong>
                      </div>
                      <span className="cat-stat-pct">佔比 {cat.percentage}%</span>
                    </div>
                    <div className="cat-stat-bar-track">
                      <div className="cat-stat-bar-fill" style={{ width: `${Math.max(4, cat.percentage)}%` }} />
                    </div>
                    <div className="cat-stat-bottom">
                      <strong className="cat-stat-time">{formatPlayedDuration(cat.playedSeconds)}</strong>
                      <span className="cat-stat-counts">{cat.videoCount} 部影片 · {cat.noteCount} 個想法</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 各裝置播放時數分佈 */}
          {data.deviceStats && data.deviceStats.length > 1 && (
            <section className="chart-card">
              <h3 className="section-label"><Smartphone /> {range === "7d" ? "最近 7 天" : "最近 30 天"} 各裝置播放時數分佈</h3>
              <div className="category-stats-grid">
                {data.deviceStats.map((dev) => (
                  <div className="cat-stat-card tone-sky" key={dev.deviceId}>
                    <div className="cat-stat-top">
                      <div className="cat-stat-heading">
                        <Smartphone />
                        <strong className="cat-stat-name">{dev.deviceName}</strong>
                      </div>
                      <span className="cat-stat-pct">佔比 {dev.percentage}%</span>
                    </div>
                    <div className="cat-stat-bar-track">
                      <div className="cat-stat-bar-fill" style={{ width: `${Math.max(4, dev.percentage)}%` }} />
                    </div>
                    <div className="cat-stat-bottom">
                      <strong className="cat-stat-time">{formatPlayedDuration(dev.playedSeconds)}</strong>
                      <span className="cat-stat-counts">{dev.videoCount} 部影片 · {dev.sessionCount} 次播放</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Thinking Notes are 1st Priority (Spec #25, #26) */}
          <section className="notes-section">
            <h3 className="section-label"><MessageCircle /> 這段時間留下的所有想法（共 {data.notes.length} 則）</h3>
            {data.notes.length ? (
              <div className="note-card-list">
                {data.notes.map((note) => (
                  <article className="parent-note-card" key={note.id}>
                    <div className="note-meta">
                      <time>{note.createdAt.slice(0, 10)} · {formatClock(note.createdAt)}</time>
                      <strong>{note.videoLabel}</strong>
                    </div>
                    <blockquote>「{note.content}」</blockquote>
                    <footer>
                      <span>影片位置 {formatPosition(note.videoPositionSeconds)}</span>
                      <Link to={`/watch/${note.videoId}?t=${Math.round(note.videoPositionSeconds)}`}>
                        <Play /> 從這裡看
                      </Link>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-notes-text">這段時間沒有留下想法紀錄。</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Note Search Page (Spec #27 ~ #29)
// ─────────────────────────────────────────────────────────────────────────────

function NoteSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await parentRepository.searchNotes(query.trim());
      setResults(res.results || []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜尋失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="parent-content">
      <header className="parent-page-title">
        <div>
          <p>全站文字探索</p>
          <h2>搜尋孩子說過的內容</h2>
        </div>
      </header>

      <form className="search-box-form" onSubmit={(e) => void search(e)}>
        <Search />
        <input
          type="search"
          placeholder="搜尋想法文字、影片標題（例如：恐龍、太空、朋友）……"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? "搜尋中…" : "搜尋"}
        </Button>
      </form>

      {error && <ParentState error={error} retry={() => void search()} />}

      {searched && (
        <section className="search-results-section">
          <p className="search-count-label">
            找到 <strong>{results.length}</strong> 筆關於「{query}」的紀錄：
          </p>

          {results.length > 0 ? (
            <div className="note-card-list">
              {results.map((note) => (
                <article className="parent-note-card" key={note.id}>
                  <div className="note-meta">
                    <time>{note.createdAt.slice(0, 10)} {formatClock(note.createdAt)}</time>
                    <strong>{note.videoLabel}</strong>
                  </div>
                  <blockquote>「{note.content}」</blockquote>
                  <footer>
                    <span>影片位置 {formatPosition(note.videoPositionSeconds)}</span>
                    <Link to={`/watch/${note.videoId}?t=${Math.round(note.videoPositionSeconds)}`}>
                      <Play /> 從這裡看
                    </Link>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-notes">
              <p>沒有找到符合「{query}」的紀錄。</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Video Detail History Page (Spec #30 ~ #32)
// ─────────────────────────────────────────────────────────────────────────────

function VideoDetailPage() {
  const { videoId = "" } = useParams();
  const [data, setData] = useState<VideoHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await parentRepository.videoHistory(videoId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入影片歷程失敗");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="parent-shell"><ParentState>正在載入影片歷史歷程…</ParentState></main>;
  if (error) return <main className="parent-shell"><ParentState error={error} retry={() => void load()} /></main>;
  if (!data) return null;

  const { video, stats, notes, sessions } = data;

  return (
    <div className="parent-content video-detail-page">
      <Link className="back-link" to="/parent/videos"><ArrowLeft /> 返回影片管理</Link>

      <header className="video-detail-header">
        <img src={video.thumbnailUrl} alt="" className="detail-thumb" />
        <div className="detail-meta">
          <h2>{video.parentLabel}</h2>
          <p className="detail-yt-title">{video.youtubeTitle}</p>
          <div className="detail-badges">
            <span className={`status-chip ${video.healthStatus === "healthy" ? "active" : "hidden"}`}>
              {video.healthStatus === "healthy" ? "✓ 正常可播" : `⚠ ${video.healthStatus}`}
            </span>
            {stats.isWatched && <span className="watched-chip">✓ 看過</span>}
          </div>
        </div>
      </header>

      {/* Stats Summary */}
      <section className="summary-section">
        <div className="summary-card">
          <Clock3 />
          <span>累積播放</span>
          <strong>{formatPlayedDuration(stats.totalPlayedSeconds)}</strong>
        </div>
        <div className="summary-card">
          <Play />
          <span>播放次數</span>
          <strong>{stats.playCount} 次</strong>
        </div>
        <div className="summary-card">
          <MessageCircle />
          <span>留下的想法</span>
          <strong>{stats.noteCount} 個</strong>
        </div>
      </section>

      {/* Thinking Progression over Time (Spec #31, #32: 時間排序看見成長軌跡) */}
      <section className="notes-section">
        <h3 className="section-label"><MessageCircle /> 孩子留下的想法軌跡（按時間推進）</h3>
        {notes.length ? (
          <div className="note-card-list">
            {notes.map((note) => (
              <article className="parent-note-card" key={note.id}>
                <div className="note-meta">
                  <time>{note.createdAt.slice(0, 10)} {formatClock(note.createdAt)}</time>
                  <span>位置 {formatPosition(note.videoPositionSeconds)}</span>
                </div>
                <blockquote>「{note.content}」</blockquote>
                {note.parentAnnotation && (
                  <p className="parent-annotation">家長備註：{note.parentAnnotation}</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-notes-text">這部影片尚未留下想法紀錄。</p>
        )}
      </section>

      {/* Sessions Timeline */}
      <section className="timeline-section">
        <h3 className="section-label"><History /> 歷次播放紀錄</h3>
        {sessions.length ? (
          <ol className="timeline-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <time>{session.startedAt.slice(0, 10)} {formatClock(session.startedAt)}</time>
                <div>
                  <p>播放 {formatPlayedDuration(session.playedSeconds)} · 上次看到 {formatPosition(session.lastPositionSeconds)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="timeline-empty">尚無播放紀錄。</p>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Videos Management Page with Filters, Batch & Health Check (Spec #38 ~ #46, #57 ~ #60)
// ─────────────────────────────────────────────────────────────────────────────

function VideoForm({ categories, onCreated }: { categories: AdminCategory[]; onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [parentLabel, setParentLabel] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inspect = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const next = await parentRepository.previewVideo(url);
      setPreview(next);
      setParentLabel(next.youtubeTitle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "預覽失敗。");
    } finally {
      setLoading(false);
    }
  };

  const add = async () => {
    setLoading(true);
    setError("");
    try {
      await parentRepository.createVideo({ url, parentLabel, categoryIds });
      setUrl("");
      setPreview(null);
      setParentLabel("");
      setCategoryIds([]);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增失敗。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="video-add-panel">
      <h3><Plus /> 新增 YouTube 影片</h3>
      <form onSubmit={(event) => void inspect(event)}>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="貼上 watch、youtu.be 或 shorts 網址"
          required
        />
        <Button type="submit" disabled={loading}>{loading ? "檢查中…" : "預覽"}</Button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {preview && (
        <div className="video-preview">
          <img src={preview.thumbnailUrl} alt="新增影片預覽" />
          <div>
            <p className="eyebrow">YouTube Preview</p>
            <h4>{preview.youtubeTitle}</h4>
            <p>{Math.round(preview.durationSeconds / 60)} 分鐘 · {preview.availabilityStatus}</p>
            {preview.duplicate && (
              <p className="duplicate-warning">已存在：<a href={`#video-${preview.duplicate.id}`}>{preview.duplicate.parentLabel}</a></p>
            )}
          </div>
          {!preview.duplicate && (
            <div className="preview-fields">
              <label>
                孩子看到的短名稱
                <input value={parentLabel} maxLength={120} onChange={(e) => setParentLabel(e.target.value)} />
              </label>
              <fieldset>
                <legend>放入分類</legend>
                {categories.filter((c) => !c.archivedAt).map((category) => (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => setCategoryIds(categoryIds.includes(category.id) ? categoryIds.filter((id) => id !== category.id) : [...categoryIds, category.id])}
                    />
                    {category.icon} {category.name}
                  </label>
                ))}
              </fieldset>
              <Button onClick={() => void add()} disabled={loading || !parentLabel.trim() || !categoryIds.length}>
                <Check /> 確認加入
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Rules & Time Management Page (Phase 3: Spec #10 ~ #14, #43 ~ #45, #48)
// ─────────────────────────────────────────────────────────────────────────────

function RulesPage() {
  const [rules, setRules] = useState<UsageRule[]>([]);
  const [todayOverride, setTodayOverride] = useState<DailyOverride | null>(null);
  const [todayPicks, setTodayPicks] = useState<TodayPick[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rulesData, picksData, categoriesData] = await Promise.all([
        parentRepository.rules(),
        parentRepository.todayPicks(),
        parentRepository.categories(),
      ]);
      setRules(rulesData.rules || []);
      setTodayOverride(rulesData.todayOverride || null);
      setTodayPicks(picksData || []);
      setCategories((categoriesData || []).filter((c) => !c.archivedAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : "規則載入失敗。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateRuleField = (ruleId: "weekday" | "weekend", field: "dailyLimitMinutes" | "gracePeriodMinutes", val: number) => {
    setRules((prev) => prev.map((r) => {
      if (r.id !== ruleId) return r;
      if (field === "dailyLimitMinutes") return { ...r, dailyLimitSeconds: val * 60 };
      if (field === "gracePeriodMinutes") return { ...r, gracePeriodSeconds: val * 60 };
      return r;
    }));
  };

  const addWindow = (ruleId: "weekday" | "weekend") => {
    setRules((prev) => prev.map((r) => {
      if (r.id !== ruleId) return r;
      const newWin: AllowedWindow = {
        id: crypto.randomUUID(),
        usageRuleId: ruleId,
        startTime: "17:00",
        endTime: "19:30",
        sortOrder: r.allowedWindows.length + 1,
        isActive: true,
      };
      return { ...r, allowedWindows: [...r.allowedWindows, newWin] };
    }));
  };

  const updateWindow = (ruleId: "weekday" | "weekend", winId: string, field: "startTime" | "endTime", val: string) => {
    setRules((prev) => prev.map((r) => {
      if (r.id !== ruleId) return r;
      return {
        ...r,
        allowedWindows: r.allowedWindows.map((w) => w.id === winId ? { ...w, [field]: val } : w),
      };
    }));
  };

  const removeWindow = (ruleId: "weekday" | "weekend", winId: string) => {
    setRules((prev) => prev.map((r) => {
      if (r.id !== ruleId) return r;
      return {
        ...r,
        allowedWindows: r.allowedWindows.filter((w) => w.id !== winId),
      };
    }));
  };

  const saveRules = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await parentRepository.updateRules(rules);
      setMessage("使用規則與可觀看時段已儲存！");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存規則失敗。");
    } finally {
      setSaving(false);
    }
  };

  const removePick = async (videoId: string) => {
    try {
      const updated = await parentRepository.toggleTodayPick(videoId);
      setTodayPicks(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失敗");
    }
  };

  const updateCategoryLimit = async (id: string, limitSec: number | null) => {
    try {
      await parentRepository.updateCategory(id, { dailyLimitSeconds: limitSec });
      setCategories((prev) => prev.map((c) => c.id === id ? { ...c, dailyLimitSeconds: limitSec } : c));
      setMessage("分類上限已更新！");
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新分類上限失敗");
    }
  };

  const updateTodayReminder = async (action: "pause" | "resume" | "bonus", minutes = 0) => {
    try {
      if (action === "pause") await parentRepository.pauseToday();
      else if (action === "resume") await parentRepository.resumeToday();
      else await parentRepository.addBonusMinutes(minutes);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "今日提醒設定失敗。");
    }
  };

  return (
    <div className="parent-content">
      <header className="parent-page-title">
        <div><p>家庭使用規則與時間邊界</p><h2>規則與時段</h2></div>
      </header>

      {error && <ParentState error={error} retry={() => void load()} />}
      {message && <p className="settings-success"><Check /> {message}</p>}

      <section className="settings-card rule-card">
        <div className="rule-card-header">
          <h3><Clock3 /> 今天的即時提醒</h3>
        </div>
        <p>觀看時間只保存在孩子目前使用的裝置，不會上傳；這裡仍可暫停今天的播放或增加今日上限。</p>
        <div className="quick-control-bar">
          <div className="quick-control-status">
            <span className="control-indicator">{todayOverride?.isPaused ? "⏸️ 孩子端目前已暫停" : "🌱 孩子端可以播放"}</span>
            {todayOverride && todayOverride.bonusSeconds > 0 && <strong>今日已加時 {Math.round(todayOverride.bonusSeconds / 60)} 分鐘</strong>}
          </div>
          <div className="quick-control-actions">
            <Button variant="secondary" onClick={() => void updateTodayReminder("bonus", 10)}>+10 分鐘</Button>
            <Button variant="secondary" onClick={() => void updateTodayReminder("bonus", 20)}>+20 分鐘</Button>
            {todayOverride?.isPaused ? (
              <Button onClick={() => void updateTodayReminder("resume")}>恢復觀看</Button>
            ) : (
              <Button variant="danger" onClick={() => void updateTodayReminder("pause")}>暫停觀看</Button>
            )}
          </div>
        </div>
      </section>

      {rules.map((rule) => {
        const isWeekday = rule.id === "weekday";
        const title = isWeekday ? "平日（週一 ～ 週五）" : "週末（週六 ～ 週日）";
        const dailyLimitMinutes = Math.round(rule.dailyLimitSeconds / 60);
        const graceMinutes = Math.round(rule.gracePeriodSeconds / 60);

        return (
          <section className="settings-card rule-card" key={rule.id}>
            <div className="rule-card-header">
              <h3><Clock3 /> {title}</h3>
            </div>

            <div className="rule-config-grid">
              <div className="rule-config-item">
                <label>
                  <strong>每日播放上限</strong>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      step={5}
                      value={dailyLimitMinutes}
                      onChange={(e) => updateRuleField(rule.id, "dailyLimitMinutes", Number(e.target.value))}
                    />
                    <span>分鐘</span>
                  </div>
                </label>
              </div>

              <div className="rule-config-item">
                <label>
                  <strong>超時寬限期</strong>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      value={graceMinutes}
                      onChange={(e) => updateRuleField(rule.id, "gracePeriodMinutes", Number(e.target.value))}
                    />
                    <span>分鐘</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="allowed-windows-block">
              <div className="windows-header">
                <strong>可觀看時段（可設定多個區間）</strong>
                <Button variant="secondary" onClick={() => addWindow(rule.id)}>
                  <Plus /> 新增時段
                </Button>
              </div>

              {rule.allowedWindows.length === 0 ? (
                <p className="no-windows-text">未設定時段限制（全天均可依上限播放）。</p>
              ) : (
                <div className="windows-list">
                  {rule.allowedWindows.map((win) => (
                    <div className="window-row" key={win.id}>
                      <input
                        type="time"
                        value={win.startTime}
                        onChange={(e) => updateWindow(rule.id, win.id, "startTime", e.target.value)}
                      />
                      <span>～</span>
                      <input
                        type="time"
                        value={win.endTime}
                        onChange={(e) => updateWindow(rule.id, win.id, "endTime", e.target.value)}
                      />
                      <Button variant="danger" onClick={() => removeWindow(rule.id, win.id)}>
                        <Trash2 /> 刪除
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}

      <div className="rule-save-actions">
        <Button size="large" disabled={saving} onClick={() => void saveRules()}>
          <Save /> {saving ? "儲存中…" : "儲存使用規則"}
        </Button>
      </div>

      {/* Category-Specific Limits Section */}
      <section className="settings-card" style={{ marginTop: "36px" }}>
        <h3><Film /> 各分類每日播放上限</h3>
        <p>若個別分類有設定上限（例如卡通 15 分鐘、科普 30 分鐘），該分類播滿後會先鎖定，孩子仍可看其他分類；若填 0 或留空則不個別限制（受全域上限約束）。</p>
        <div className="cat-limits-grid">
          {categories.map((c) => (
            <div className="cat-limit-card" key={c.id}>
              <span className="cat-limit-title">{c.icon} {c.name}</span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min={0}
                  max={1440}
                  step={5}
                  value={c.dailyLimitSeconds ? Math.round(c.dailyLimitSeconds / 60) : ""}
                  placeholder="不限制"
                  onChange={(e) => updateCategoryLimit(c.id, e.target.value === "" ? null : Number(e.target.value) * 60)}
                />
                <span>分鐘</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Today Picks Section (Spec #46 ~ #56) */}
      <section className="settings-card" style={{ marginTop: "36px" }}>
        <h3><Sparkles /> 今天推薦影片（共 {todayPicks.length} 部）</h3>
        <p>家長今天特別推薦給孩子看的影片，會置頂出現在孩子首頁「今天推薦給你 🌱」。隔天會自動清空。</p>

        {todayPicks.length === 0 ? (
          <p className="no-windows-text">今天尚未推薦影片。可至「影片管理」點擊 ⭐ 加入推薦！</p>
        ) : (
          <div className="today-picks-manage-list">
            {todayPicks.map((pick, idx) => (
              <div className="today-pick-item" key={pick.id}>
                <span className="pick-order-num">{idx + 1}</span>
                <img src={pick.thumbnailUrl} alt="" className="pick-thumb" />
                <strong className="pick-title">{pick.parentLabel}</strong>
                <Button variant="secondary" onClick={() => void removePick(pick.videoId)}>
                  移除
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function VideoRow({
  video, categories, selectedCategory, isSelected, isTodayPick, onSelectToggle, onReload, onMove, onTogglePick,
}: {
  video: AdminVideo; categories: AdminCategory[]; selectedCategory: string; isSelected: boolean; isTodayPick: boolean;
  onSelectToggle: (id: string) => void; onReload: () => void; onMove: (video: AdminVideo, direction: -1 | 1) => void;
  onTogglePick: (videoId: string) => void;
}) {
  const [label, setLabel] = useState(video.parentLabel || "");
  const [categoryIds, setCategoryIds] = useState<string[]>(video.categoryIds || []);
  const [error, setError] = useState("");

  useEffect(() => {
    setLabel(video.parentLabel || "");
    setCategoryIds(video.categoryIds || []);
  }, [video]);

  const save = async () => {
    setError("");
    try {
      await parentRepository.updateVideo(video.id, { parentLabel: label, categoryIds });
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗。");
    }
  };

  const action = (promise: Promise<unknown>) => promise.then(onReload).catch((e) => setError(e.message));

  return (
    <article className={`admin-video-card ${video.archivedAt ? "is-archived" : ""}`} id={`video-${video.id}`}>
      <div className="video-card-select">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectToggle(video.id)}
          aria-label={`選取 ${video.parentLabel}`}
        />
      </div>
      <img src={video.thumbnailUrl} alt="" />
      <div className="video-admin-main">
        <div className="video-admin-heading">
          <div>
            <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} aria-label="影片短名稱" />
            <p>{video.youtubeTitle}</p>
          </div>
          <div className="status-chip-group">
            {video.healthStatus !== "healthy" && (
              <span className="status-chip unavailable">⚠ {video.healthStatus}</span>
            )}
            <span className={`status-chip ${video.archivedAt ? "archived" : video.isActive ? "active" : "hidden"}`}>
              {video.archivedAt ? "Archived" : video.isActive ? "Active" : "Hidden"}
            </span>
          </div>
        </div>

        <div className="category-checkboxes">
          {(categories || []).filter((c) => !c.archivedAt).map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                checked={(categoryIds || []).includes(category.id)}
                onChange={() => setCategoryIds((categoryIds || []).includes(category.id) ? (categoryIds || []).filter((id) => id !== category.id) : [...(categoryIds || []), category.id])}
              />
              {category.name}
            </label>
          ))}
        </div>

        {video.metadataError && <p className="metadata-error">{video.metadataError}</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="video-admin-actions">
          {!video.archivedAt && (
            <>
              <Button
                variant={isTodayPick ? "primary" : "secondary"}
                onClick={() => onTogglePick(video.id)}
                title="加入或移出今天推薦"
              >
                <Sparkles /> {isTodayPick ? "已推薦" : "今天推薦"}
              </Button>
              <Button variant="secondary" onClick={() => void save()}><Save /> 儲存</Button>
              <Button variant="secondary" onClick={() => void action(parentRepository.updateVideo(video.id, { isActive: !video.isActive }))}>
                {video.isActive ? <EyeOff /> : <Eye />} {video.isActive ? "隱藏" : "顯示"}
              </Button>
              <Button variant="secondary" onClick={() => void action(parentRepository.refreshVideo(video.id))}>
                <RefreshCw /> 同步 Metadata
              </Button>
              {selectedCategory !== "all" && (
                <>
                  <button aria-label="分類內上移" onClick={() => onMove(video, -1)}><ArrowUp /></button>
                  <button aria-label="分類內下移" onClick={() => onMove(video, 1)}><ArrowDown /></button>
                </>
              )}
              <Button variant="danger" onClick={() => void action(parentRepository.archiveVideo(video.id))}><Trash2 /> 封存</Button>
            </>
          )}
          {video.archivedAt && (
            <Button variant="secondary" onClick={() => void action(parentRepository.restoreVideo(video.id))}><RotateCcw /> 復原為隱藏</Button>
          )}
        </div>
      </div>
    </article>
  );
}

function VideosPage() {
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [todayPicks, setTodayPicks] = useState<TodayPick[]>([]);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthReport, setHealthReport] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextVideos, nextCategories, nextPicks] = await Promise.all([
        parentRepository.videos({ category_id: category === "all" ? undefined : category, status: status === "all" ? undefined : status, q: searchQuery }),
        parentRepository.categories(),
        parentRepository.todayPicks().catch(() => []),
      ]);
      setVideos(nextVideos);
      setCategories(nextCategories);
      setTodayPicks(nextPicks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "影片載入失敗。");
    } finally {
      setLoading(false);
    }
  }, [category, status, searchQuery]);

  useEffect(() => { void load(); }, [load]);

  const togglePick = async (videoId: string) => {
    try {
      const updated = await parentRepository.toggleTodayPick(videoId);
      setTodayPicks(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失敗");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === videos.length) setSelectedIds([]);
    else setSelectedIds(videos.map((v) => v.id));
  };

  const batchAction = async (action: "hide" | "show" | "archive") => {
    if (!selectedIds.length) return;
    try {
      await parentRepository.batchVideos(selectedIds, action);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批次操作失敗。");
    }
  };

  const move = async (video: AdminVideo, direction: -1 | 1) => {
    if (category === "all") return;
    const currentOrder = videos.map((v) => v.id);
    const fromIndex = currentOrder.indexOf(video.id);
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= currentOrder.length) return;
    const reordered = [...currentOrder];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setVideos(reordered.map((id) => videos.find((v) => v.id === id)!));
    try {
      await parentRepository.orderCategoryVideos(category, reordered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "排序更新失敗。");
      await load();
    }
  };

  const runHealth = async () => {
    setHealthChecking(true);
    setHealthReport(null);
    try {
      const res = await parentRepository.runHealthCheck(true);
      setHealthReport(`檢查完成！已檢查 ${res.checkedCount} 部影片，健康 ${res.healthyCount} 部，異常 ${res.unhealthyCount} 部。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "健康檢查失敗。");
    } finally {
      setHealthChecking(false);
    }
  };

  return (
    <div className="parent-content">
      <header className="parent-page-title">
        <div>
          <p>白名單與 Metadata</p>
          <h2>影片管理</h2>
        </div>
        <Button variant="secondary" onClick={() => void runHealth()} disabled={healthChecking}>
          <RefreshCw className={healthChecking ? "is-spinning" : ""} /> {healthChecking ? "檢查中…" : "一鍵健康檢查"}
        </Button>
      </header>

      {healthReport && <p className="settings-success"><Check />{healthReport}</p>}

      <VideoForm categories={categories} onCreated={() => void load()} />

      {/* Filter Row (Spec #57, #58) */}
      <div className="filter-toolbar">
        <div className="filter-row">
          <label>
            分類
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">全部分類</option>
              {categories.filter((c) => !c.archivedAt).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            狀態
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">全部狀態</option>
              <option value="available">可正常播放 (Available)</option>
              <option value="unavailable">無法播放 (Unavailable)</option>
              <option value="hidden">隱藏中 (Hidden)</option>
              <option value="archived">已封存 (Archived)</option>
            </select>
          </label>
          <input
            type="search"
            placeholder="搜尋影片標題……"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="filter-search-input"
          />
        </div>

        {/* Batch Actions Toolbar (Spec #60) */}
        {videos.length > 0 && (
          <div className="batch-actions-row">
            <Button variant="quiet" onClick={selectAll}>
              {selectedIds.length === videos.length ? "取消全選" : "全選"}
            </Button>
            {selectedIds.length > 0 && (
              <>
                <span className="selected-count">已選取 {selectedIds.length} 部：</span>
                <Button variant="secondary" onClick={() => void batchAction("show")}>批次顯示</Button>
                <Button variant="secondary" onClick={() => void batchAction("hide")}>批次隱藏</Button>
                <Button variant="danger" onClick={() => void batchAction("archive")}>批次封存</Button>
              </>
            )}
          </div>
        )}
      </div>

      {loading && <ParentState>正在載入影片…</ParentState>}
      {error && <ParentState error={error} retry={() => void load()} />}

      {!loading && (
        <section className="admin-video-list">
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              categories={categories}
              selectedCategory={category}
              isSelected={selectedIds.includes(video.id)}
              isTodayPick={todayPicks.some((p) => p.videoId === video.id)}
              onSelectToggle={toggleSelect}
              onReload={() => void load()}
              onMove={(item, direction) => void move(item, direction)}
              onTogglePick={(videoId) => void togglePick(videoId)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Categories Management Page
// ─────────────────────────────────────────────────────────────────────────────

function SortableCategoryRow({
  category, index, count, onChange, onMove, onArchive, onRestore,
}: {
  category: AdminCategory; index: number; count: number;
  onChange: (id: string, body: Partial<Pick<AdminCategory, "name" | "icon" | "isActive" | "dailyLimitSeconds">>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id, disabled: !!category.archivedAt });
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [limitMinutes, setLimitMinutes] = useState<string>(
    category.dailyLimitSeconds ? String(Math.round(category.dailyLimitSeconds / 60)) : ""
  );
  useEffect(() => {
    setName(category.name);
    setIcon(category.icon);
    setLimitMinutes(category.dailyLimitSeconds ? String(Math.round(category.dailyLimitSeconds / 60)) : "");
  }, [category]);

  const handleSave = () => {
    const parsedMin = limitMinutes.trim() === "" ? null : Number(limitMinutes);
    const dailyLimitSeconds = parsedMin !== null && !isNaN(parsedMin) && parsedMin > 0 ? parsedMin * 60 : null;
    onChange(category.id, { name, icon, dailyLimitSeconds });
  };

  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`admin-list-row ${isDragging ? "is-dragging" : ""} ${category.archivedAt ? "is-archived" : ""}`}>
      <button className="drag-handle" aria-label={`拖曳 ${category.name}`} {...attributes} {...listeners}><GripVertical /></button>
      <input className="emoji-input" aria-label="圖示" value={icon} maxLength={12} onChange={(event) => setIcon(event.target.value)} />
      <input aria-label="分類名稱" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      <div className="cat-limit-input-wrapper" title="每日播放上限（分鐘，留空或 0 代表不個別限制）">
        <input
          type="number"
          min={0}
          max={1440}
          step={5}
          placeholder="不限時"
          value={limitMinutes}
          onChange={(e) => setLimitMinutes(e.target.value)}
          className="cat-limit-field"
        />
        <span className="unit-label">分/天</span>
      </div>
      <span className={`status-chip ${category.archivedAt ? "archived" : category.isActive ? "active" : "hidden"}`}>
        {category.archivedAt ? "Archived" : category.isActive ? "Active" : "Hidden"}
      </span>
      <div className="row-actions">
        {!category.archivedAt && (
          <>
            <button aria-label="上移" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp /></button>
            <button aria-label="下移" disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowDown /></button>
            <button aria-label="儲存" onClick={handleSave}><Save /></button>
            <button aria-label={category.isActive ? "隱藏" : "顯示"} onClick={() => onChange(category.id, { isActive: !category.isActive })}>{category.isActive ? <EyeOff /> : <Eye />}</button>
            <button aria-label="封存" onClick={() => onArchive(category.id)}><Trash2 /></button>
          </>
        )}
        {category.archivedAt && (
          <Button variant="secondary" onClick={() => onRestore(category.id)}><RotateCcw /> 復原</Button>
        )}
      </div>
    </article>
  );
}

function CategoriesPage() {
  const [items, setItems] = useState<AdminCategory[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✨");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems(await parentRepository.categories()); } catch (e) { setError(e instanceof Error ? e.message : "分類載入失敗。"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const active = items.filter((item) => !item.archivedAt);
  const archived = items.filter((item) => item.archivedAt);
  const persistOrder = async (next: AdminCategory[]) => {
    setItems([...next, ...archived]);
    try { await parentRepository.orderCategories(next.map((item) => item.id)); } catch (e) { setError(e instanceof Error ? e.message : "排序未儲存。"); void load(); }
  };
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < active.length) void persistOrder(arrayMove(active, index, nextIndex));
  };
  const dragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = active.findIndex((item) => item.id === event.active.id);
    const to = active.findIndex((item) => item.id === event.over!.id);
    void persistOrder(arrayMove(active, from, to));
  };
  const change = async (id: string, body: Partial<Pick<AdminCategory, "name" | "icon" | "isActive">>) => {
    await parentRepository.updateCategory(id, body).then(load).catch((e) => setError(e.message));
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await parentRepository.createCategory({ name, icon }).then(() => { setName(""); setIcon("✨"); return load(); }).catch((e) => setError(e.message));
  };
  return (
    <div className="parent-content">
      <header className="parent-page-title"><div><p>孩子首頁內容</p><h2>分類管理</h2></div></header>
      <form className="inline-create-form" onSubmit={(event) => void create(event)}>
        <input className="emoji-input" value={icon} maxLength={12} onChange={(e) => setIcon(e.target.value)} aria-label="新分類圖示" />
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="新分類名稱" required />
        <Button type="submit"><Plus /> 建立分類</Button>
      </form>
      {loading && <ParentState>正在載入分類…</ParentState>}
      {error && <ParentState error={error} retry={() => void load()} />}
      {!loading && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={active.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <section className="admin-list">
              {active.map((category, index) => (
                <SortableCategoryRow
                  key={category.id}
                  category={category}
                  index={index}
                  count={active.length}
                  onChange={(id, body) => void change(id, body)}
                  onMove={move}
                  onArchive={(id) => void parentRepository.archiveCategory(id).then(load)}
                  onRestore={(id) => void parentRepository.restoreCategory(id).then(load)}
                />
              ))}
            </section>
          </SortableContext>
        </DndContext>
      )}
      {!!archived.length && (
        <section className="archived-section">
          <h3>已封存</h3>
          {archived.map((category) => (
            <SortableCategoryRow
              key={category.id}
              category={category}
              index={0}
              count={1}
              onChange={() => undefined}
              onMove={() => undefined}
              onArchive={() => undefined}
              onRestore={(id) => void parentRepository.restoreCategory(id).then(load)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Settings & Export Page (Spec #47 ~ #56)
// ─────────────────────────────────────────────────────────────────────────────

function DeviceSettingsRow({ device, run }: { device: ChildDevice; run: (job: Promise<unknown>, success: string) => Promise<void> }) {
  const [name, setName] = useState(device.name);
  useEffect(() => setName(device.name), [device.name]);
  return (
    <article className={device.revokedAt ? "is-revoked" : ""}>
      <div className="device-name-block">
        {device.revokedAt ? <strong>{device.name}</strong> : <input aria-label="裝置名稱" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />}
        <span>{device.isCurrent && "目前裝置 · "}最後使用：{new Date(device.lastUsedAt).toLocaleString("zh-TW")}</span>
      </div>
      {!device.revokedAt && (
        <div className="device-row-actions">
          <Button variant="secondary" disabled={!name.trim() || name === device.name} onClick={() => void run(parentRepository.updateDevice(device.id, name), "裝置名稱已更新。")}>儲存名稱</Button>
          <Button variant="danger" onClick={() => void run(parentRepository.revokeDevice(device.id), "裝置授權已撤銷。")}>撤銷</Button>
        </div>
      )}
    </article>
  );
}

function SettingsPage() {
  const [timezone, setTimezone] = useState("Asia/Taipei");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const settings = await parentRepository.settings();
      if (typeof settings.timezone === "string") setTimezone(settings.timezone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定載入失敗。");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (job: Promise<unknown>, success: string) => {
    setError("");
    setMessage("");
    try {
      await job;
      setMessage(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗。");
    }
  };

  return (
    <div className="parent-content">
      <header className="parent-page-title">
        <div><p>家庭偏好</p><h2>設定</h2></div>
      </header>

      {error && <ParentState error={error} retry={() => void load()} />}
      {message && <p className="settings-success"><Check />{message}</p>}

      {/* Timezone */}
      <section className="settings-card">
        <h3><Clock3 /> 時區</h3>
        <p>每日觀看提醒與可觀看時段會依此時區切分一天。</p>
        <div className="settings-inline">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="Asia/Taipei">Asia/Taipei（台北）</option>
            <option value="Asia/Tokyo">Asia/Tokyo（東京）</option>
            <option value="America/Los_Angeles">America/Los_Angeles（洛杉磯）</option>
          </select>
          <Button onClick={() => void run(parentRepository.updateSettings({ timezone }), "時區已更新。")}>儲存</Button>
        </div>
      </section>

      {/* Password Change */}
      <section className="settings-card">
        <h3><Settings /> 變更家長密碼</h3>
        <p>新密碼至少 8 個字元。更新後，其他家長 Session 會立即失效。</p>
        <label>目前密碼<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
        <label>新密碼<input type="password" minLength={8} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <Button disabled={currentPassword.length < 8 || newPassword.length < 8} onClick={() => void run(parentRepository.changePassword(currentPassword, newPassword), "密碼已更新，其他登入已撤銷。")}>
          更新密碼
        </Button>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Parent App Routes
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentApp() {
  return (
    <Routes>
      <Route path="login" element={<ParentLogin />} />
      <Route path="*" element={
        <ParentGuard>
          <ParentLayout>
            <Routes>
              <Route index element={<Navigate to="/parent/today" replace />} />
              <Route path="today" element={<HistoryPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route path="videos" element={<VideosPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/parent/today" replace />} />
            </Routes>
          </ParentLayout>
        </ParentGuard>
      } />
    </Routes>
  );
}
