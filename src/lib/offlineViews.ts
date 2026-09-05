import { offlineViewRepository } from "../data/repositories";
import type { PlaybackMode } from "../types";

const KEY = "kids-offline-video-views-v1";

interface OfflineViewMarker {
  videoId: string;
  playbackMode: PlaybackMode;
  seenAt: string;
}

let syncing: Promise<void> | null = null;

function read(): OfflineViewMarker[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function write(items: OfflineViewMarker[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function rememberOfflineView(videoId: string, playbackMode: PlaybackMode, seenAt = new Date().toISOString()) {
  const items = read().filter((item) => item.videoId !== videoId);
  items.push({ videoId, playbackMode, seenAt });
  write(items.slice(-100));
}

export function syncOfflineViews() {
  if (syncing || !navigator.onLine) return syncing || Promise.resolve();
  syncing = (async () => {
    while (navigator.onLine) {
      const batch = read().slice(0, 100);
      if (!batch.length) return;
      await offlineViewRepository.sync(batch);
      const sent = new Map(batch.map((item) => [item.videoId, item.seenAt]));
      write(read().filter((item) => sent.get(item.videoId) !== item.seenAt));
    }
  })().catch(() => {}).finally(() => { syncing = null; });
  return syncing;
}
