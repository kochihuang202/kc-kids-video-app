import type { Category, VideoFixture } from "../types";

const KEY = "kids-downloads-v1";
const SNAPSHOT = "kids-offline-metadata:";
export function rememberOffline(path: string, value: unknown) {
  try { localStorage.setItem(SNAPSHOT + path, JSON.stringify(value)); } catch { /* Online use must survive storage quota failures. */ }
}
export function offlineSnapshot<T>(path: string): T | undefined {
  try { const raw = localStorage.getItem(SNAPSHOT + path); return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
}
export interface DownloadSeries { category: Category; videos: VideoFixture[]; completed: Record<string, number>; mimeTypes?: Record<string, string> }
export function savedSeries(): DownloadSeries[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(series: DownloadSeries[]) {
  localStorage.setItem(KEY, JSON.stringify(series));
  window.dispatchEvent(new Event("downloads-changed"));
}
async function directory() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle("kids-media-v1", { create: true });
}
const filename = (id: string) => `${encodeURIComponent(id)}.media`;
export async function localMedia(id: string): Promise<Blob | null> {
  if (!savedSeries().some(s => s.completed[id])) return null;
  try {
    const file = await (await (await directory()).getFileHandle(filename(id))).getFile();
    const expected = savedSeries().find(s => s.completed[id])!.completed[id];
    const mime = savedSeries().find(s => s.completed[id])?.mimeTypes?.[id] || "application/octet-stream";
    return file.size === expected ? file.slice(0, file.size, mime) : null;
  } catch { return null; }
}
export function managedVideo(id: string) { return savedSeries().some(s => s.videos.some(v => v.id === id)); }
export async function removeSeries(id: string) {
  return navigator.locks.request("kids-download-write", { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("請先暫停下載，再刪除系列。");
    return removeSeriesFiles(id);
  });
}
async function removeSeriesFiles(id: string) {
  const all = savedSeries();
  const target = all.find(s => s.category.id === id);
  const rest = all.filter(s => s.category.id !== id);
  const dir = await directory();
  for (const video of target?.videos || []) {
    if (!rest.some(s => s.videos.some(v => v.id === video.id))) {
      await dir.removeEntry(filename(video.id)).catch(error => { if (error.name !== "NotFoundError") throw error; });
    }
  }
  save(rest);
}

// Sequential streaming writes avoid loading a whole lesson into JavaScript memory.
// A file is eligible for playback only after close() succeeds and its size is verified.
export async function downloadSeries(category: Category, videos: VideoFixture[], signal: AbortSignal, progress: (message: string) => void) {
  return navigator.locks.request("kids-download-write", { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("另一個頁面正在下載，請先暫停該下載。");
    return downloadSeriesFiles(category, videos, signal, progress);
  });
}
async function downloadSeriesFiles(category: Category, videos: VideoFixture[], signal: AbortSignal, progress: (message: string) => void) {
  const eligible = videos.filter(v => v.source === "self_hosted" && v.mediaUrl);
  if (!eligible.length) throw new Error("這個系列沒有可下載的 Mac 影音。");
  const all = savedSeries();
  const previous = all.find(s => s.category.id === category.id);
  const series: DownloadSeries = { category, videos: eligible, completed: previous?.completed || {}, mimeTypes: previous?.mimeTypes || {} };
  for (const video of eligible) rememberOffline(`/api/content/videos/${encodeURIComponent(video.id)}`, video);
  rememberOffline(`/api/content/categories/${encodeURIComponent(category.id)}/videos`, videos);
  save([...all.filter(s => s.category.id !== category.id), series]);
  const dir = await directory();
  for (let i = 0; i < eligible.length; i++) {
    signal.throwIfAborted();
    const video = eligible[i];
    if (await localMedia(video.id)) continue;
    progress(`下載 ${i + 1}/${eligible.length}：${video.parentLabel}`);
    const response = await fetch(video.mediaUrl!, { signal, cache: "no-store" });
    if (!response.ok || response.status === 206 || !response.body) throw new Error(`下載失敗（${response.status}），已完成的影片會保留。`);
    const type = response.headers.get("content-type") || "";
    if (type.includes("text/") || type.includes("json")) throw new Error("伺服器未傳回影音檔案。");
    const expected = Number(response.headers.get("content-length")) || 0;
    const space = await navigator.storage.estimate();
    if (expected && space.quota && expected > space.quota - (space.usage || 0)) throw new Error("這台裝置的可用儲存空間不足。");
    const handle = await dir.getFileHandle(filename(video.id), { create: true });
    if (!handle.createWritable) throw new Error("此瀏覽器不支援串流儲存。iPhone／iPad 請更新到 iOS／iPadOS 26 或以上。");
    const writer = await handle.createWritable();
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        await writer.write(part.value);
        bytes += part.value.byteLength;
        progress(`下載 ${i + 1}/${eligible.length}：${video.parentLabel} · ${(bytes / 1048576).toFixed(1)} MB${expected ? ` / ${(expected / 1048576).toFixed(1)} MB` : ""}`);
      }
      if (!bytes || (expected && bytes !== expected)) throw new Error("檔案不完整，請繼續下載重試。");
      await writer.close();
    } catch (error) {
      await reader.cancel().catch(() => {});
      await writer.abort().catch(() => {});
      throw error;
    }
    series.completed[video.id] = bytes;
    series.mimeTypes![video.id] = type || (video.mediaType === "audio" ? "audio/mpeg" : "video/mp4");
    save(savedSeries().map(s => s.category.id === category.id ? series : s));
  }
  progress("整個系列已下載完成。");
}
