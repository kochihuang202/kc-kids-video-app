import type { PlaybackMode, VideoFixture } from "../types";
import { getStoredActiveChildId } from "./activeChild";

function getStorageKey(): string {
  const childId = getStoredActiveChildId();
  return childId ? `kid_playback_queue_v1_${childId}` : "kid_playback_queue_v1";
}

export interface PlaybackQueue {
  categoryId: string;
  mode: PlaybackMode;
  videoIds: string[];
  currentVideoId: string;
}

export function readPlaybackQueue(): PlaybackQueue | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(getStorageKey()) || "null") as Partial<PlaybackQueue> | null;
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
  window.sessionStorage.setItem(getStorageKey(), JSON.stringify(queue));
}

export function syncPlaybackQueue(categoryId: string, mode: PlaybackMode, videos: VideoFixture[], currentVideoId: string) {
  const videoIds = videos.filter((video) => video.isSelectable !== false).map((video) => video.id);
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

export function buildYouTubeListenPlaylist(videos: VideoFixture[], activeVideoId?: string): string[] {
  const all = videos
    .filter((item) => item.source === "youtube" && !!item.youtubeVideoId)
    .map((item) => item.youtubeVideoId!);
  if (!all.length) return [];
  if (!activeVideoId) return all.slice(0, 50);
  const currentIndex = all.indexOf(activeVideoId);
  if (currentIndex === -1) return all.slice(0, 50);
  return [...all.slice(currentIndex), ...all.slice(0, currentIndex)].slice(0, 50);
}
