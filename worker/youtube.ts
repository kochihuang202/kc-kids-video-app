import { HttpError } from "./http";
import type { AppEnv } from "./types";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeVideoId(input: string) {
  const raw = input.trim();
  if (VIDEO_ID_PATTERN.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError("請貼上有效的 YouTube 單支影片網址。", 400, "INVALID_YOUTUBE_URL");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else if (parts[0] === "shorts" || parts[0] === "embed") id = parts[1] || "";
  }
  if (!VIDEO_ID_PATTERN.test(id)) {
    throw new HttpError("只支援 YouTube 單支影片網址，不支援播放清單、頻道或搜尋頁。", 400, "INVALID_YOUTUBE_URL");
  }
  return id;
}

export function parseIsoDuration(value: string) {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) throw new HttpError("YouTube 回傳了無法辨識的影片時長。", 502, "INVALID_DURATION");
  return Math.round(Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0));
}

interface YouTubeItem {
  id: string;
  snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; embeddable?: boolean; uploadStatus?: string };
}

export interface VideoMetadata {
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  availabilityStatus: "available" | "unavailable" | "private" | "not_embeddable";
  metadataError: string | null;
  definitiveUnavailable: boolean;
}

export async function fetchYouTubeMetadata(input: string, env: AppEnv): Promise<VideoMetadata> {
  const youtubeVideoId = parseYouTubeVideoId(input);
  if (!env.YOUTUBE_API_KEY) throw new HttpError("尚未設定 YouTube API Key。", 503, "YOUTUBE_NOT_CONFIGURED");
  const query = new URLSearchParams({
    part: "snippet,contentDetails,status",
    id: youtubeVideoId,
    key: env.YOUTUBE_API_KEY,
  });
  let response: Response;
  try {
    response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${query}`);
  } catch {
    throw new HttpError("目前連不上 YouTube，既有影片狀態不會被更改。", 502, "YOUTUBE_TEMPORARY_ERROR");
  }
  if (!response.ok) {
    const status = response.status === 403 || response.status === 429 ? 503 : 502;
    throw new HttpError("YouTube Metadata 暫時無法取得，請稍後重試。", status, "YOUTUBE_TEMPORARY_ERROR");
  }
  const payload = await response.json() as { items?: YouTubeItem[] };
  const item = payload.items?.[0];
  if (!item) return {
    youtubeVideoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    youtubeTitle: "影片不存在",
    thumbnailUrl: `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`,
    durationSeconds: 0,
    availabilityStatus: "unavailable",
    metadataError: "YouTube 找不到這部影片。",
    definitiveUnavailable: true,
  };
  const privacy = item.status?.privacyStatus;
  const embeddable = item.status?.embeddable !== false;
  const availabilityStatus = privacy === "private" ? "private" : !embeddable ? "not_embeddable" : "available";
  const metadataError = privacy === "private" ? "影片為私人影片。" : !embeddable ? "影片不允許嵌入播放。" : null;
  const thumbnails = item.snippet?.thumbnails || {};
  const thumbnailUrl = thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  return {
    youtubeVideoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    youtubeTitle: item.snippet?.title || "未命名影片",
    thumbnailUrl,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration || "PT0S"),
    availabilityStatus,
    metadataError,
    definitiveUnavailable: availabilityStatus !== "available",
  };
}
