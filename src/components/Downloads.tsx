import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Category, VideoFixture } from "../types";
import { downloadSeries, localMedia, removeSeries, savedSeries } from "../lib/downloads";
import { deviceRepository } from "../data/repositories";

export function SeriesDownload({ category, videos }: { category: Category; videos: VideoFixture[] }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (!videos.some(v => v.source === "self_hosted")) return null;
  const run = async () => {
    if (!confirm("下載整個系列到這台裝置？建議先連接 Wi-Fi 與 Tailscale。請保持此頁開啟；離頁會暫停，已完成影片會保留。")) return;
    setBusy(true);
    const task = new AbortController(); controller.current = task;
    try {
      if (!(await deviceRepository.status()).authorized) throw new Error("請家長先授權這台裝置。");
      if (!navigator.storage?.getDirectory || !navigator.locks) throw new Error("這個瀏覽器不支援下載儲存，請使用新版 Safari／Chrome／Edge。");
      const persistent = await navigator.storage.persist?.();
      setStorageMessage(persistent ? "已啟用持久儲存。" : "瀏覽器未核准持久儲存；檔案可能被回收。");
      await downloadSeries(category, videos, task.signal, setMessage);
    } catch (error) {
      setMessage(task.signal.aborted ? "已暫停，已完成影片保留；未完成的單部影片會重新下載。" : error instanceof Error ? error.message : "下載失敗，請重試。");
    } finally { setBusy(false); }
  };
  return <section className="download-panel" aria-label="系列下載">
    <button disabled={busy} onClick={() => void run()}>下載／繼續下載整個系列</button>
    {busy && <button onClick={() => controller.current?.abort()}>暫停下載</button>}
    <Link to="/downloads">已下載</Link>
    <p role="status">{message}</p>
    <small>{storageMessage}</small>
  </section>;
}

export function DownloadsPage() {
  const [series, setSeries] = useState(savedSeries);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setSeries(savedSeries());
    window.addEventListener("downloads-changed", update);
    return () => window.removeEventListener("downloads-changed", update);
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all(series.flatMap(s => s.videos).map(async v => [v.id, !!await localMedia(v.id)] as const))
      .then(entries => { if (alive) setAvailable(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [series]);
  return <main className="downloads-page"><Link to="/">← 孩子首頁</Link><h1>已下載</h1>
    <p>只儲存在這台裝置。播放優先使用本機檔案；清除網站資料後需要重新下載。Safari 與加入主畫面後的版本是兩個不同儲存空間，請固定從同一個入口使用。</p>
    {error && <p role="alert">{error}</p>}
    {!series.length && <p>尚未下載。請到分類頁下載 Mac 影音系列。</p>}
    {series.map(s => <section key={s.category.id}>
      <h2>{s.category.name}</h2>
      <p>{s.videos.filter(v => available[v.id]).length}/{s.videos.length} 部可離線播放 · {(Object.values(s.completed).reduce((a,b) => a+b,0)/1048576).toFixed(1)} MB 已記錄</p>
      <SeriesDownload category={s.category} videos={s.videos} />
      <button onClick={async () => {
        if (!confirm(`刪除這台裝置的「${s.category.name}」下載？Mac 原檔與觀看紀錄不受影響。`)) return;
        try { await removeSeries(s.category.id); } catch (error) { setError(error instanceof Error ? error.message : "刪除失敗，請稍後重試。"); }
      }}>刪除整個系列下載</button>
      <ul>{s.videos.map(v => <li key={v.id}>{v.parentLabel}　{v.isSelectable === false ? <span>先從前五部選擇（連網後更新）</span> : available[v.id] ? <>
        <Link to={`/watch/${v.id}?mode=video`}>觀看</Link>　<Link to={`/watch/${v.id}?mode=listen`}>純聽</Link>
      </> : <span>尚未下載／需要重新下載</span>}</li>)}</ul>
    </section>)}
  </main>;
}
