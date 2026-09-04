import type { PlaybackMode, VideoFixture } from "../types";

const STORAGE_KEY = "kid_playback_queue_v1";

export interface PlaybackQueue {
  categoryId: string;
  mode: PlaybackMode;
  videoIds: string[];
  currentVideoId: string;
}

export function readPlaybackQueue(): PlaybackQueue | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null") as Partial<PlaybackQueue> | null;
    if (!value || typeof value.categoryId !== "string" || (value.mode !== "video" && value.mode !== "listen")) return null;
    if (!Array.isArray(value.videoIds) || !value.videoIds.every((id) => typeof id === "string")) return null;
    if (typeof value.currentVideoId !== "string" || !value.videoIds.includes(value.currentVideoId)) return null;
    return value as PlaybackQueue;
  } catch {
    return null;
  }
}

export function savePlaybackQueue(queue: PlaybackQueue) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function syncPlaybackQueue(categoryId: string, mode: PlaybackMode, videos: VideoFixture[], currentVideoId: string) {
  const videoIds = videos.map((video) => video.id);
  if (!videoIds.includes(currentVideoId)) return null;
  const queue = { categoryId, mode, videoIds, currentVideoId } satisfies PlaybackQueue;
  savePlaybackQueue(queue);
  return queue;
}

export function advancePlaybackQueue(queue: PlaybackQueue, currentVideoId: string) {
  const currentIndex = queue.videoIds.indexOf(currentVideoId);
  if (currentIndex < 0 || queue.videoIds.length < 2) return null;
  const nextVideoId = queue.videoIds[(currentIndex + 1) % queue.videoIds.length];
  savePlaybackQueue({ ...queue, currentVideoId: nextVideoId });
  return nextVideoId;
}

export function modeForVideo(search: URLSearchParams, videoId: string): PlaybackMode {
  const explicit = search.get("mode");
  if (explicit === "listen" || explicit === "video") return explicit;
  const queue = readPlaybackQueue();
  return queue?.currentVideoId === videoId ? queue.mode : "video";
}
