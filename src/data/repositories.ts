import type {
  AdminCategory,
  AdminVideo,
  CalendarHistory,
  Category,
  ChildAccessState,
  ChildDevice,
  DailyOverride,
  DeviceStatus,
  NoteSearchResult,
  SummaryAnalytics,
  TodayDashboard,
  TodayPick,
  UpdateViewSessionInput,
  UsageRule,
  VideoFixture,
  VideoHistoryResponse,
} from "../types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) throw new ApiError(payload?.error || "目前連不上資料，請再試一次。", response.status, payload?.code);
  return payload as T;
}

async function api<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return readJson<T>(await fetch(path, { cache: "no-store", ...init, headers }));
}

const write = <T>(path: string, method: string, body: unknown) => api<T>(path, { method, body: JSON.stringify(body) });

export const contentRepository = {
  getCategories: () => api<Category[]>("/api/content/categories"),
  getVideos: (categoryId: string) => api<VideoFixture[]>(`/api/content/categories/${encodeURIComponent(categoryId)}/videos`),
  getVideo: (videoId: string) => api<VideoFixture>(`/api/content/videos/${encodeURIComponent(videoId)}`),
  getAccessState: () => api<ChildAccessState>("/api/child/access-state"),
  getTodayPicks: () => api<TodayPick[]>("/api/child/today-picks"),
  getResume: () => api<{ resume: import("../types").ResumeInfo | null }>("/api/content/resume"),
  getRecents: () => api<import("../types").RecentVideo[]>("/api/content/recents"),
  setLearned: (videoId: string, learned: boolean) => write<{ ok: true; videoId: string; isLearned: boolean; learnedAt: string | null }>(
    `/api/child/videos/${encodeURIComponent(videoId)}/learned`, "PUT", { learned },
  ),
};

export const deviceRepository = {
  status: () => api<DeviceStatus>("/api/device/status"),
};

export const activityRepository = {
  startViewSession(videoId: string, clientSessionId: string, playbackMode: "video" | "listen" = "video") {
    return write<{ id: string; writeToken: string; startedAt: string }>("/api/view-sessions", "POST", {
      videoId,
      clientSessionId,
      playbackMode,
    });
  },
  updateViewSession(id: string, input: UpdateViewSessionInput, keepalive = false) {
    return api<{ ok: true }>(`/api/view-sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      keepalive,
    });
  },
};

export interface VideoPreview {
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  availabilityStatus: string;
  metadataError: string | null;
  duplicate: { id: string; parentLabel: string } | null;
}

export const parentRepository = {
  session: () => api<{ authenticated: boolean; expiresAt?: string }>("/api/parent/session"),
  login: (password: string) => write<{ authenticated: true; expiresAt: string }>("/api/parent/session", "POST", { password }),
  logout: () => write<{ ok: true }>("/api/parent/session", "DELETE", {}),
  dashboard(start: string, end: string) {
    return api<TodayDashboard>(`/api/parent/history?${new URLSearchParams({ start, end })}`);
  },
  calendarHistory(month?: string) {
    const q = month ? `?month=${encodeURIComponent(month)}` : "";
    return api<CalendarHistory>(`/api/parent/history/calendar${q}`);
  },
  summaryAnalytics(range: "7d" | "30d" = "7d") {
    return api<SummaryAnalytics>(`/api/parent/summary?range=${range}`);
  },
  searchNotes(query: string) {
    return api<{ query: string; total: number; results: NoteSearchResult[] }>(`/api/parent/notes/search?q=${encodeURIComponent(query)}`);
  },
  deleteNote(id: string) {
    return api<{ ok: true }>(`/api/parent/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  categories: () => api<AdminCategory[]>("/api/parent/categories"),
  createCategory: (body: { name: string; icon: string; seriesType?: "learning" | "leisure"; dailyLimitSeconds?: number | null }) => write<{ id: string }>("/api/parent/categories", "POST", body),
  updateCategory: (id: string, body: Partial<Pick<AdminCategory, "name" | "icon" | "imageUrl" | "isActive" | "dailyLimitSeconds" | "seriesType">>) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(id)}`, "PATCH", body),
  archiveCategory: (id: string) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(id)}/archive`, "POST", {}),
  restoreCategory: (id: string) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(id)}/restore`, "POST", {}),
  orderCategories: (ids: string[]) => write<{ ok: true }>("/api/parent/categories/order", "PUT", { ids }),
  videos: (params?: { category_id?: string; status?: string; q?: string }) => {
    const q = new URLSearchParams();
    if (params?.category_id) q.set("category_id", params.category_id);
    if (params?.status) q.set("status", params.status);
    if (params?.q) q.set("q", params.q);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return api<AdminVideo[]>(`/api/parent/videos${qs}`);
  },
  videoHistory: (videoId: string) => api<VideoHistoryResponse>(`/api/parent/videos/${encodeURIComponent(videoId)}/history`),
  previewVideo: (url: string) => write<VideoPreview>("/api/parent/videos/preview", "POST", { url }),
  createVideo: (body: { url: string; parentLabel: string; categoryIds: string[] }) => write<{ id: string }>("/api/parent/videos", "POST", body),
  updateVideo: (id: string, body: { parentLabel?: string; categoryIds?: string[]; isActive?: boolean }) => write<{ ok: true }>(`/api/parent/videos/${encodeURIComponent(id)}`, "PATCH", body),
  batchVideos: (videoIds: string[], action: "hide" | "show" | "archive") => write<{ ok: true; count: number }>("/api/parent/videos/batch", "POST", { videoIds, action }),
  refreshVideo: (id: string) => write<VideoPreview>(`/api/parent/videos/${encodeURIComponent(id)}/metadata`, "POST", {}),
  archiveVideo: (id: string) => write<{ ok: true }>(`/api/parent/videos/${encodeURIComponent(id)}/archive`, "POST", {}),
  restoreVideo: (id: string) => write<{ ok: true }>(`/api/parent/videos/${encodeURIComponent(id)}/restore`, "POST", {}),
  orderCategoryVideos: (categoryId: string, ids: string[]) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(categoryId)}/videos/order`, "PUT", { ids }),
  runHealthCheck: (forceAll = false) => write<{ ok: true; checkedCount: number; healthyCount: number; unhealthyCount: number }>("/api/parent/health-check", "POST", { forceAll }),
  settings: () => api<Record<string, unknown>>("/api/parent/settings"),
  updateSettings: (body: { timezone?: string; playback?: { completionThreshold?: number; recentLimit?: number } }) => write<{ ok: true }>("/api/parent/settings", "PATCH", body),
  changePassword: (currentPassword: string, newPassword: string) => write<{ ok: true }>("/api/parent/password", "POST", { currentPassword, newPassword }),
  devices: () => api<ChildDevice[]>("/api/parent/devices"),
  authorizeDevice: (name: string) => write<{ id: string; name: string }>("/api/parent/devices", "POST", { name }),
  updateDevice: (id: string, name: string) => write<{ ok: true }>(`/api/parent/devices/${encodeURIComponent(id)}`, "PATCH", { name }),
  revokeDevice: (id: string) => write<{ ok: true }>(`/api/parent/devices/${encodeURIComponent(id)}`, "DELETE", {}),
  rules: () => api<{ rules: UsageRule[]; todayOverride: DailyOverride | null }>("/api/parent/rules"),
  updateRules: (rules: Array<Partial<UsageRule> & { id: string }>) => write<{ ok: true }>("/api/parent/rules", "PUT", { rules }),
  addBonusMinutes: (minutes: number) => write<{ ok: true; accessState: ChildAccessState }>("/api/parent/today/bonus", "POST", { minutes }),
  pauseToday: () => write<{ ok: true; accessState: ChildAccessState }>("/api/parent/today/pause", "POST", {}),
  resumeToday: () => write<{ ok: true; accessState: ChildAccessState }>("/api/parent/today/resume", "POST", {}),
  todayPicks: () => api<TodayPick[]>("/api/parent/today/picks"),
  updateTodayPicks: (videoIds: string[]) => write<TodayPick[]>("/api/parent/today/picks", "PUT", { videoIds }),
  toggleTodayPick: (videoId: string) => write<TodayPick[]>(`/api/parent/today/picks/${encodeURIComponent(videoId)}/toggle`, "POST", {}),
};
