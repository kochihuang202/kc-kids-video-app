import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowUp, Check, Clock3, Eye, EyeOff, Film, GripVertical, Home, LogOut,
  MessageCircle, Play, Plus, RefreshCw, RotateCcw, Save, Settings, Smartphone, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { parentRepository, type VideoPreview } from "./data/repositories";
import { formatClock, formatPosition, getDayRangeInTimeZone } from "./lib/utils";
import type { AdminCategory, AdminVideo, ChildDevice, TodayDashboard } from "./types";

function formatPlayedDuration(seconds: number) {
  if (seconds <= 0) return "0 分鐘";
  if (seconds < 60) return "少於 1 分鐘";
  return `${Math.round(seconds / 60)} 分鐘`;
}

function ParentState({ children, error, retry }: { children?: ReactNode; error?: string; retry?: () => void }) {
  return <div className={`dashboard-state ${error ? "error-state" : ""}`} role={error ? "alert" : "status"}>
    {children || <p>{error}</p>}{error && retry && <Button variant="secondary" onClick={retry}><RefreshCw />再試一次</Button>}
  </div>;
}

export function ParentLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try { await parentRepository.login(password); navigate("/parent/today", { replace: true }); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "登入失敗。"); }
    finally { setLoading(false); }
  };
  return <main className="parent-login-shell">
    <form className="parent-login-card" onSubmit={(event) => void submit(event)}>
      <div className="brand-mark">小</div><p className="parent-kicker">小小選片 · 家長</p><h1>家長登入</h1>
      <p>登入後可以管理白名單、查看筆記與授權家庭裝置。</p>
      <label>家長密碼<input type="password" autoComplete="current-password" minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button size="large" type="submit" disabled={loading || password.length < 10}>{loading ? "登入中…" : "登入"}</Button>
      <Link to="/">回孩子首頁</Link>
    </form>
  </main>;
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
  const logout = async () => { await parentRepository.logout().catch(() => undefined); navigate("/parent/login", { replace: true }); };
  return <main className="parent-shell">
    <header className="parent-topbar">
      <div><p className="parent-kicker">小小選片 · 家長</p><h1>管理中心</h1></div>
      <div className="parent-top-actions"><Link className="parent-home" to="/"><Home />孩子首頁</Link><button onClick={() => void logout()}><LogOut />登出</button></div>
    </header>
    <nav className="parent-nav" aria-label="家長功能">
      <NavLink to="/parent/today">今天</NavLink><NavLink to="/parent/videos">影片</NavLink><NavLink to="/parent/categories">分類</NavLink><NavLink to="/parent/settings">設定</NavLink>
    </nav>
    {children}
  </main>;
}

function TodayPage() {
  const [dashboard, setDashboard] = useState<TodayDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const settings = await parentRepository.settings();
      const timezone = typeof settings.timezone === "string" ? settings.timezone : "Asia/Taipei";
      const { start, end } = getDayRangeInTimeZone(timezone);
      setDashboard(await parentRepository.dashboard(start, end));
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "今天的資料載入不了。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <ParentState>正在整理今天的紀錄…</ParentState>;
  if (error) return <ParentState error={error} retry={() => void load()} />;
  if (!dashboard) return null;
  return <div className="parent-content">
    <header className="parent-page-title"><div><p>今日家庭摘要</p><h2>今天</h2></div><Button variant="secondary" onClick={() => void load()}><RefreshCw />重新整理</Button></header>
    <section className="notes-section"><p className="section-label">孩子今天說了什麼？</p>
      {dashboard.errors.notes ? <ParentState error={dashboard.errors.notes} retry={() => void load()} /> : dashboard.notes.length ? <div className="note-card-list">{dashboard.notes.map((note) => <article className="parent-note-card" key={note.id}>
        <div className="note-meta"><time>{formatClock(note.createdAt)}</time><span>{note.videoLabel}</span></div><blockquote>「{note.content}」</blockquote>
        <footer><span>影片位置 {formatPosition(note.videoPositionSeconds)}</span><Link to={`/watch/${note.videoId}?t=${Math.round(note.videoPositionSeconds)}`}><Play />從這裡看</Link></footer>
      </article>)}</div> : <div className="empty-notes"><MessageCircle /><p>今天還沒有留下想法。</p><span>孩子存下第一段話後，會出現在這裡。</span></div>}
    </section>
    <section className="summary-section" aria-label="今日摘要">
      {dashboard.errors.summary ? <ParentState error={dashboard.errors.summary} retry={() => void load()} /> : <>
        <div className="summary-card summary-main"><Clock3 /><span>今天影片播放</span><strong>{formatPlayedDuration(dashboard.summary.totalPlayedSeconds)}</strong></div>
        <div className="summary-card"><Film /><strong>{dashboard.summary.playedVideoCount}</strong><span>部影片</span></div>
        <div className="summary-card"><Play /><strong>{dashboard.summary.sessionCount}</strong><span>次播放</span></div>
        <div className="summary-card"><MessageCircle /><strong>{dashboard.summary.noteCount}</strong><span>個想法</span></div>
      </>}
    </section>
    <section className="timeline-section"><p className="section-label">今天的觀看足跡</p>
      {dashboard.errors.timeline ? <ParentState error={dashboard.errors.timeline} retry={() => void load()} /> : dashboard.timeline.length ? <ol className="timeline-list">{dashboard.timeline.map((session) => <li key={session.id}><time>{formatClock(session.startedAt)}</time><div><h2>{session.videoLabel}</h2><p>播放 {formatPlayedDuration(session.playedSeconds)}</p>{session.noteCount > 0 && <span><MessageCircle />留下 {session.noteCount} 個想法</span>}</div></li>)}</ol> : <p className="timeline-empty">今天還沒有播放紀錄。</p>}
    </section>
  </div>;
}

function SortableCategoryRow({ category, index, count, onChange, onMove, onArchive, onRestore }: {
  category: AdminCategory; index: number; count: number;
  onChange: (id: string, body: Partial<Pick<AdminCategory, "name" | "icon" | "isActive">>) => void;
  onMove: (index: number, direction: -1 | 1) => void; onArchive: (id: string) => void; onRestore: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id, disabled: !!category.archivedAt });
  const [name, setName] = useState(category.name); const [icon, setIcon] = useState(category.icon);
  useEffect(() => { setName(category.name); setIcon(category.icon); }, [category]);
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`admin-list-row ${isDragging ? "is-dragging" : ""} ${category.archivedAt ? "is-archived" : ""}`}>
    <button className="drag-handle" aria-label={`拖曳 ${category.name}`} {...attributes} {...listeners}><GripVertical /></button>
    <input className="emoji-input" aria-label="圖示" value={icon} maxLength={12} onChange={(event) => setIcon(event.target.value)} />
    <input aria-label="分類名稱" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
    <span className={`status-chip ${category.archivedAt ? "archived" : category.isActive ? "active" : "hidden"}`}>{category.archivedAt ? "Archived" : category.isActive ? "Active" : "Hidden"}</span>
    <div className="row-actions">
      {!category.archivedAt && <><button aria-label="上移" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp /></button><button aria-label="下移" disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowDown /></button>
        <button aria-label="儲存" onClick={() => onChange(category.id, { name, icon })}><Save /></button><button aria-label={category.isActive ? "隱藏" : "顯示"} onClick={() => onChange(category.id, { isActive: !category.isActive })}>{category.isActive ? <EyeOff /> : <Eye />}</button><button aria-label="封存" onClick={() => onArchive(category.id)}><Trash2 /></button></>}
      {category.archivedAt && <Button variant="secondary" onClick={() => onRestore(category.id)}><RotateCcw />復原</Button>}
    </div>
  </article>;
}

function CategoriesPage() {
  const [items, setItems] = useState<AdminCategory[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [name, setName] = useState(""); const [icon, setIcon] = useState("✨");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems(await parentRepository.categories()); } catch (e) { setError(e instanceof Error ? e.message : "分類載入失敗。"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const active = items.filter((item) => !item.archivedAt); const archived = items.filter((item) => item.archivedAt);
  const persistOrder = async (next: AdminCategory[]) => { setItems([...next, ...archived]); try { await parentRepository.orderCategories(next.map((item) => item.id)); } catch (e) { setError(e instanceof Error ? e.message : "排序未儲存。"); void load(); } };
  const move = (index: number, direction: -1 | 1) => { const nextIndex = index + direction; if (nextIndex >= 0 && nextIndex < active.length) void persistOrder(arrayMove(active, index, nextIndex)); };
  const dragEnd = (event: DragEndEvent) => { if (!event.over || event.active.id === event.over.id) return; const from = active.findIndex((item) => item.id === event.active.id); const to = active.findIndex((item) => item.id === event.over!.id); void persistOrder(arrayMove(active, from, to)); };
  const change = async (id: string, body: Partial<Pick<AdminCategory, "name" | "icon" | "isActive">>) => { await parentRepository.updateCategory(id, body).then(load).catch((e) => setError(e.message)); };
  const create = async (event: FormEvent) => { event.preventDefault(); await parentRepository.createCategory({ name, icon }).then(() => { setName(""); setIcon("✨"); return load(); }).catch((e) => setError(e.message)); };
  return <div className="parent-content"><header className="parent-page-title"><div><p>孩子首頁內容</p><h2>分類管理</h2></div></header>
    <form className="inline-create-form" onSubmit={(event) => void create(event)}><input className="emoji-input" value={icon} maxLength={12} onChange={(e) => setIcon(e.target.value)} aria-label="新分類圖示" /><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="新分類名稱" required /><Button type="submit"><Plus />建立分類</Button></form>
    {loading && <ParentState>正在載入分類…</ParentState>}{error && <ParentState error={error} retry={() => void load()} />}
    {!loading && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={active.map((item) => item.id)} strategy={verticalListSortingStrategy}><section className="admin-list">{active.map((category, index) => <SortableCategoryRow key={category.id} category={category} index={index} count={active.length} onChange={(id, body) => void change(id, body)} onMove={move} onArchive={(id) => void parentRepository.archiveCategory(id).then(load)} onRestore={(id) => void parentRepository.restoreCategory(id).then(load)} />)}</section></SortableContext></DndContext>}
    {!!archived.length && <section className="archived-section"><h3>已封存</h3>{archived.map((category) => <SortableCategoryRow key={category.id} category={category} index={0} count={1} onChange={() => undefined} onMove={() => undefined} onArchive={() => undefined} onRestore={(id) => void parentRepository.restoreCategory(id).then(load)} />)}</section>}
  </div>;
}

function VideoForm({ categories, onCreated }: { categories: AdminCategory[]; onCreated: () => void }) {
  const [url, setUrl] = useState(""); const [preview, setPreview] = useState<VideoPreview | null>(null); const [parentLabel, setParentLabel] = useState(""); const [categoryIds, setCategoryIds] = useState<string[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const inspect = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(""); try { const next = await parentRepository.previewVideo(url); setPreview(next); setParentLabel(next.youtubeTitle); } catch (e) { setError(e instanceof Error ? e.message : "預覽失敗。"); } finally { setLoading(false); } };
  const add = async () => { setLoading(true); setError(""); try { await parentRepository.createVideo({ url, parentLabel, categoryIds }); setUrl(""); setPreview(null); setParentLabel(""); setCategoryIds([]); onCreated(); } catch (e) { setError(e instanceof Error ? e.message : "新增失敗。"); } finally { setLoading(false); } };
  return <section className="video-add-panel"><h3><Plus />新增 YouTube 影片</h3><form onSubmit={(event) => void inspect(event)}><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="貼上 watch、youtu.be 或 shorts 網址" required /><Button type="submit" disabled={loading}>{loading ? "檢查中…" : "預覽"}</Button></form>{error && <p className="form-error">{error}</p>}
    {preview && <div className="video-preview"><img src={preview.thumbnailUrl} alt="新增影片預覽" /><div><p className="eyebrow">YouTube Preview</p><h4>{preview.youtubeTitle}</h4><p>{Math.round(preview.durationSeconds / 60)} 分鐘 · {preview.availabilityStatus}</p>{preview.duplicate && <p className="duplicate-warning">已存在：<a href={`#video-${preview.duplicate.id}`}>{preview.duplicate.parentLabel}</a></p>}</div>
      {!preview.duplicate && <div className="preview-fields"><label>孩子看到的短名稱<input value={parentLabel} maxLength={120} onChange={(e) => setParentLabel(e.target.value)} /></label><fieldset><legend>放入分類</legend>{categories.filter((c) => !c.archivedAt).map((category) => <label key={category.id}><input type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds(categoryIds.includes(category.id) ? categoryIds.filter((id) => id !== category.id) : [...categoryIds, category.id])} />{category.icon} {category.name}</label>)}</fieldset><Button onClick={() => void add()} disabled={loading || !parentLabel.trim() || !categoryIds.length}><Check />確認加入</Button></div>}
    </div>}
  </section>;
}

function VideoRow({ video, categories, selectedCategory, onReload, onMove }: { video: AdminVideo; categories: AdminCategory[]; selectedCategory: string; onReload: () => void; onMove: (video: AdminVideo, direction: -1 | 1) => void }) {
  const [label, setLabel] = useState(video.parentLabel); const [categoryIds, setCategoryIds] = useState(video.categoryIds); const [error, setError] = useState("");
  useEffect(() => { setLabel(video.parentLabel); setCategoryIds(video.categoryIds); }, [video]);
  const save = async () => { setError(""); try { await parentRepository.updateVideo(video.id, { parentLabel: label, categoryIds }); onReload(); } catch (e) { setError(e instanceof Error ? e.message : "儲存失敗。"); } };
  const action = (promise: Promise<unknown>) => promise.then(onReload).catch((e) => setError(e.message));
  return <article className={`admin-video-card ${video.archivedAt ? "is-archived" : ""}`} id={`video-${video.id}`}><img src={video.thumbnailUrl} alt="" /><div className="video-admin-main"><div className="video-admin-heading"><div><input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} aria-label="影片短名稱" /><p>{video.youtubeTitle}</p></div><span className={`status-chip ${video.archivedAt ? "archived" : video.isActive ? "active" : "hidden"}`}>{video.archivedAt ? "Archived" : video.isActive ? "Active" : "Hidden"}</span></div>
    <div className="category-checkboxes">{categories.filter((c) => !c.archivedAt).map((category) => <label key={category.id}><input type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds(categoryIds.includes(category.id) ? categoryIds.filter((id) => id !== category.id) : [...categoryIds, category.id])} />{category.name}</label>)}</div>
    {video.metadataError && <p className="metadata-error">{video.metadataError}</p>}{error && <p className="form-error">{error}</p>}
    <div className="video-admin-actions">{!video.archivedAt && <><Button variant="secondary" onClick={() => void save()}><Save />儲存</Button><Button variant="secondary" onClick={() => void action(parentRepository.updateVideo(video.id, { isActive: !video.isActive }))}>{video.isActive ? <EyeOff /> : <Eye />}{video.isActive ? "隱藏" : "顯示"}</Button><Button variant="secondary" onClick={() => void action(parentRepository.refreshVideo(video.id))}><RefreshCw />檢查 Metadata</Button>{selectedCategory !== "all" && <><button aria-label="分類內上移" onClick={() => onMove(video, -1)}><ArrowUp /></button><button aria-label="分類內下移" onClick={() => onMove(video, 1)}><ArrowDown /></button></>}<Button variant="danger" onClick={() => void action(parentRepository.archiveVideo(video.id))}><Trash2 />封存</Button></>}{video.archivedAt && <Button variant="secondary" onClick={() => void action(parentRepository.restoreVideo(video.id))}><RotateCcw />復原為隱藏</Button>}</div>
  </div></article>;
}

function VideosPage() {
  const [videos, setVideos] = useState<AdminVideo[]>([]); const [categories, setCategories] = useState<AdminCategory[]>([]); const [category, setCategory] = useState("all"); const [status, setStatus] = useState("all"); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [nextVideos, nextCategories] = await Promise.all([parentRepository.videos(), parentRepository.categories()]); setVideos(nextVideos); setCategories(nextCategories); } catch (e) { setError(e instanceof Error ? e.message : "影片載入失敗。"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => videos.filter((video) => (category === "all" || video.categoryIds.includes(category)) && (status === "all" || (status === "archived" ? !!video.archivedAt : status === "active" ? video.isActive && !video.archivedAt : !video.isActive && !video.archivedAt))).sort((a, b) => category === "all" ? a.parentLabel.localeCompare(b.parentLabel, "zh-Hant") : (a.categorySortOrders[category] || 999) - (b.categorySortOrders[category] || 999)), [videos, category, status]);
  const move = async (video: AdminVideo, direction: -1 | 1) => { if (category === "all") return; const scope = videos.filter((item) => item.categoryIds.includes(category)).sort((a, b) => (a.categorySortOrders[category] || 999) - (b.categorySortOrders[category] || 999)); const from = scope.findIndex((item) => item.id === video.id); const to = from + direction; if (to < 0 || to >= scope.length) return; try { await parentRepository.orderCategoryVideos(category, arrayMove(scope, from, to).map((item) => item.id)); void load(); } catch (e) { setError(e instanceof Error ? e.message : "排序失敗。"); } };
  return <div className="parent-content"><header className="parent-page-title"><div><p>白名單與 Metadata</p><h2>影片管理</h2></div></header><VideoForm categories={categories} onCreated={() => void load()} /><div className="filter-row"><label>分類<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">全部分類</option>{categories.filter((c) => !c.archivedAt).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>狀態<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">全部狀態</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label></div>
    {loading && <ParentState>正在載入影片…</ParentState>}{error && <ParentState error={error} retry={() => void load()} />}{!loading && <section className="admin-video-list">{filtered.map((video) => <VideoRow key={video.id} video={video} categories={categories} selectedCategory={category} onReload={() => void load()} onMove={(item, direction) => void move(item, direction)} />)}</section>}
  </div>;
}

function DeviceSettingsRow({ device, run }: { device: ChildDevice; run: (job: Promise<unknown>, success: string) => Promise<void> }) {
  const [name, setName] = useState(device.name);
  useEffect(() => setName(device.name), [device.name]);
  return <article className={device.revokedAt ? "is-revoked" : ""}>
    <div className="device-name-block">
      {device.revokedAt ? <strong>{device.name}</strong> : <input aria-label="裝置名稱" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />}
      <span>{device.isCurrent && "目前裝置 · "}最後使用：{new Date(device.lastUsedAt).toLocaleString("zh-TW")}</span>
    </div>
    {!device.revokedAt && <div className="device-row-actions"><Button variant="secondary" disabled={!name.trim() || name === device.name} onClick={() => void run(parentRepository.updateDevice(device.id, name), "裝置名稱已更新。")}>儲存名稱</Button><Button variant="danger" onClick={() => void run(parentRepository.revokeDevice(device.id), "裝置授權已撤銷。")}>撤銷</Button></div>}
  </article>;
}

function SettingsPage() {
  const [timezone, setTimezone] = useState("Asia/Taipei"); const [devices, setDevices] = useState<ChildDevice[]>([]); const [deviceName, setDeviceName] = useState("家庭 iPad"); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); try { const [settings, nextDevices] = await Promise.all([parentRepository.settings(), parentRepository.devices()]); if (typeof settings.timezone === "string") setTimezone(settings.timezone); setDevices(nextDevices); } catch (e) { setError(e instanceof Error ? e.message : "設定載入失敗。"); } }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (job: Promise<unknown>, success: string) => { setError(""); setMessage(""); try { await job; setMessage(success); await load(); } catch (e) { setError(e instanceof Error ? e.message : "操作失敗。"); } };
  return <div className="parent-content"><header className="parent-page-title"><div><p>家庭安全與偏好</p><h2>設定</h2></div></header>{error && <ParentState error={error} retry={() => void load()} />}{message && <p className="settings-success"><Check />{message}</p>}
    <section className="settings-card"><h3><Clock3 />時區</h3><p>Today Dashboard 會依此時區切分一天。</p><div className="settings-inline"><select value={timezone} onChange={(e) => setTimezone(e.target.value)}><option value="Asia/Taipei">Asia/Taipei（台北）</option><option value="Asia/Tokyo">Asia/Tokyo（東京）</option><option value="America/Los_Angeles">America/Los_Angeles（洛杉磯）</option></select><Button onClick={() => void run(parentRepository.updateSettings({ timezone }), "時區已更新。")}>儲存</Button></div></section>
    <section className="settings-card"><h3><Smartphone />家庭裝置</h3><p>授權後，即使家長登出，這台裝置仍能保存筆記與播放紀錄；可隨時撤銷。</p>{!devices.some((device) => device.isCurrent && !device.revokedAt) && <div className="settings-inline"><input value={deviceName} maxLength={80} onChange={(e) => setDeviceName(e.target.value)} /><Button onClick={() => void run(parentRepository.authorizeDevice(deviceName), "目前裝置已授權。")}>授權目前裝置</Button></div>}<div className="device-list">{devices.map((device) => <DeviceSettingsRow key={device.id} device={device} run={run} />)}</div></section>
    <section className="settings-card"><h3><Settings />變更家長密碼</h3><p>新密碼至少 10 個字元。更新後，其他家長 Session 會立即失效。</p><label>目前密碼<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label><label>新密碼<input type="password" minLength={10} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label><Button disabled={currentPassword.length < 10 || newPassword.length < 10} onClick={() => void run(parentRepository.changePassword(currentPassword, newPassword), "密碼已更新，其他登入已撤銷。")}>更新密碼</Button></section>
  </div>;
}

export default function ParentApp() {
  return <Routes>
    <Route path="login" element={<ParentLogin />} />
    <Route path="*" element={<ParentGuard><ParentLayout><Routes>
      <Route index element={<Navigate to="today" replace />} /><Route path="today" element={<TodayPage />} /><Route path="videos" element={<VideosPage />} /><Route path="categories" element={<CategoriesPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="today" replace />} />
    </Routes></ParentLayout></ParentGuard>} />
  </Routes>;
}
