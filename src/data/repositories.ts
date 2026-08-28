import { categories, videos } from "./fixtures";
import type { SaveNoteInput, TodayDashboard, UpdateViewSessionInput, VideoFixture } from "../types";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || "目前連不上資料，請再試一次。");
  return payload as T;
}

export const contentRepository = {
  getCategories() {
    return [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },
  getVideos(categoryId: string) {
    return videos.filter((video) => video.categoryId === categoryId).sort((a, b) => a.sortOrder - b.sortOrder);
  },
  getVideo(videoId: string): VideoFixture | undefined {
    return videos.find((video) => video.id === videoId);
  },
};

export const activityRepository = {
  async saveNote(input: SaveNoteInput) {
    return readJson<{ id: string }>(await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }));
  },
  async startViewSession(videoId: string) {
    return readJson<{ id: string }>(await fetch("/api/view-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId }),
    }));
  },
  async updateViewSession(id: string, input: UpdateViewSessionInput, keepalive = false) {
    return readJson<{ ok: true }>(await fetch(`/api/view-sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      keepalive,
    }));
  },
  async getTodayDashboard(start: string, end: string) {
    const query = new URLSearchParams({ start, end });
    return readJson<TodayDashboard>(await fetch(`/api/today?${query}`));
  },
};
