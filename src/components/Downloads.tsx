import { AlertCircle, CheckCircle2, Download, HardDrive, Pause, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { contentRepository, deviceRepository } from "../data/repositories";
import { downloadSeries, localMedia, refreshSavedSeriesMetadata, removeSeries, savedSeries, type DownloadSeries } from "../lib/downloads";
import type { Category, DeviceStatus, VideoFixture } from "../types";
import { Button } from "./ui/button";

interface ManagedSeries { category: Category; videos: VideoFixture[] }

function formatBytes(bytes: number) {
  if (bytes <= 0) return "尚未使用空間";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function SeriesDownloadManager({ category, videos, authorized }: ManagedSeries & { authorized: boolean }) {
  const eligible = videos.filter((video) => video.source === "self_hosted" && video.mediaUrl);
  const [saved, setSaved] = useState<DownloadSeries | undefined>(() => savedSeries().find((item) => item.category.id === category.id));
  const [availableCount, setAvailableCount] = useState(0);
  const [message, setMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const nextSaved = savedSeries().find((item) => item.category.id === category.id);
    setSaved(nextSaved);
    const count = nextSaved
      ? (await Promise.all(nextSaved.videos.map(async (video) => !!await localMedia(video.id)))).filter(Boolean).length
      : 0;
    setAvailableCount(count);
  }, [category.id]);

  useEffect(() => {
    void refresh();
    window.addEventListener("downloads-changed", refresh);
    return () => {
      controller.current?.abort();
      window.removeEventListener("downloads-changed", refresh);
    };
  }, [refresh]);

  const run = async () => {
    if (!authorized) { setMessage("請先到「設定」授權目前裝置。"); return; }
    if (!saved && !confirm(`下載「${category.name}」整個系列到這台裝置？建議先連接 Wi-Fi 與 Tailscale。`)) return;
    setBusy(true);
    setMessage("");
    const task = new AbortController();
    controller.current = task;
    try {
      if (!navigator.storage?.getDirectory || !navigator.locks) throw new Error("這個瀏覽器不支援下載儲存，請使用新版 Safari／Chrome／Edge。");
      const persistent = await navigator.storage.persist?.();
      setStorageMessage(persistent ? "已啟用持久儲存" : "瀏覽器未核准持久儲存，檔案仍可能被系統回收");
      await downloadSeries(category, videos, task.signal, setMessage);
      await refresh();
    } catch (error) {
      setMessage(task.signal.aborted ? "下載已暫停；完成的影片會保留。" : error instanceof Error ? error.message : "下載失敗，請重試。");
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`刪除這台裝置的「${category.name}」下載？Mac 原檔與觀看紀錄不受影響。`)) return;
    try {
      setMessage("");
      await removeSeries(category.id);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "刪除失敗，請稍後重試。"); }
  };

  const total = eligible.length || saved?.videos.length || 0;
  const complete = total > 0 && availableCount === total;
  const partial = availableCount > 0 && !complete;
  const bytes = Object.values(saved?.completed || {}).reduce((sum, value) => sum + value, 0);

  return <article className="offline-series-card">
    <div className="offline-series-icon" aria-hidden="true">{category.icon}</div>
    <div className="offline-series-main">
      <div className="offline-series-title">
        <h3>{category.name}</h3>
        <span className={complete ? "download-state complete" : partial ? "download-state partial" : "download-state"}>
          {complete ? <CheckCircle2 /> : <HardDrive />}{complete ? "已下載完成" : partial ? "尚未完成" : "尚未下載"}
        </span>
      </div>
      <p>{availableCount} / {total} 部可離線播放 · {formatBytes(bytes)}</p>
      {message && <p className="download-progress-message" role="status">{message}</p>}
      {storageMessage && <small>{storageMessage}</small>}
    </div>
    <div className="offline-series-actions">
      {busy
        ? <Button variant="secondary" onClick={() => controller.current?.abort()}><Pause />暫停</Button>
        : <Button disabled={!authorized || total === 0} onClick={() => void run()}><Download />{complete ? "檢查／補齊" : partial ? "繼續下載" : "下載整個系列"}</Button>}
      {saved && <Button variant="quiet" className="download-delete" onClick={() => void remove()}><Trash2 />刪除</Button>}
    </div>
  </article>;
}

export function ParentDownloadsPage() {
  const [series, setSeries] = useState<ManagedSeries[] | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [categories, nextDevice] = await Promise.all([contentRepository.getCategories(), deviceRepository.status()]);
      const remote = await Promise.all(categories.map(async (category) => ({ category, videos: await contentRepository.getVideos(category.id) })));
      for (const item of remote) refreshSavedSeriesMetadata(item.category, item.videos);
      const downloadable = remote.filter((item) => item.videos.some((video) => video.source === "self_hosted"));
      const savedOnly = savedSeries()
        .filter((item) => !downloadable.some((remoteItem) => remoteItem.category.id === item.category.id))
        .map((item) => ({ category: item.category, videos: item.videos }));
      setSeries([...downloadable, ...savedOnly]);
      setDevice(nextDevice);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "離線下載資料暫時載入不了。"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="parent-content parent-downloads-page">
    <div className="parent-section-heading">
      <div><p>目前裝置</p><h2>離線下載</h2></div>
      <span className="current-download-device"><Smartphone />{device?.device?.name || "這台裝置"}</span>
    </div>
    <p className="parent-page-intro">影片只會儲存在目前這台裝置；其他手機或 iPad 必須分別進入此頁下載。</p>
    {device && !device.authorized && <div className="download-device-warning" role="status">
      <AlertCircle /><div><strong>目前裝置尚未授權</strong><p>先完成家庭裝置授權，才能下載與離線播放。</p></div><Link to="/parent/settings">前往設定</Link>
    </div>}
    {error && <div className="form-error" role="alert">{error}<Button variant="secondary" onClick={() => void load()}>再試一次</Button></div>}
    {!series && !error && <p>正在讀取可下載系列…</p>}
    {series?.length === 0 && <p className="empty-state">目前沒有可下載的 Mac 影音系列。</p>}
    <section className="offline-series-list" aria-label="可下載系列">
      {series?.map((item) => <SeriesDownloadManager key={item.category.id} {...item} authorized={!!device?.authorized} />)}
    </section>
  </div>;
}
