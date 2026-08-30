import type {
  AdminCategory,
  AdminVideo,
  Category,
  ChildDevice,
  DeviceStatus,
  SaveNoteInput,
  TodayDashboard,
  UpdateViewSessionInput,
  VideoFixture,
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
};

export const deviceRepository = {
  status: () => api<DeviceStatus>("/api/device/status"),
};

export const activityRepository = {
  saveNote: (input: SaveNoteInput) => write<{ id: string; createdAt: string }>("/api/notes", "POST", input),
  startViewSession(videoId: string, clientSessionId: string) {
    return write<{ id: string; writeToken: string; startedAt: string }>("/api/view-sessions", "POST", { videoId, clientSessionId });
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
    return api<TodayDashboard>(`/api/parent/dashboard/today?${new URLSearchParams({ start, end })}`);
  },
  categories: () => api<AdminCategory[]>("/api/parent/categories"),
  createCategory: (body: { name: string; icon: string }) => write<{ id: string }>("/api/parent/categories", "POST", body),
  updateCategory: (id: string, body: Partial<Pick<AdminCategory, "name" | "icon" | "imageUrl" | "isActive">>) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(id)}`, "PATCH", body),
  archiveCategory: (id: string) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(id)}/archive`, "POST", {}),
  restoreCategory: (id: string) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(id)}/restore`, "POST", {}),
  orderCategories: (ids: string[]) => write<{ ok: true }>("/api/parent/categories/order", "PUT", { ids }),
  videos: () => api<AdminVideo[]>("/api/parent/videos"),
  previewVideo: (url: string) => write<VideoPreview>("/api/parent/videos/preview", "POST", { url }),
  createVideo: (body: { url: string; parentLabel: string; categoryIds: string[] }) => write<{ id: string }>("/api/parent/videos", "POST", body),
  updateVideo: (id: string, body: { parentLabel?: string; categoryIds?: string[]; isActive?: boolean }) => write<{ ok: true }>(`/api/parent/videos/${encodeURIComponent(id)}`, "PATCH", body),
  refreshVideo: (id: string) => write<VideoPreview>(`/api/parent/videos/${encodeURIComponent(id)}/metadata`, "POST", {}),
  archiveVideo: (id: string) => write<{ ok: true }>(`/api/parent/videos/${encodeURIComponent(id)}/archive`, "POST", {}),
  restoreVideo: (id: string) => write<{ ok: true }>(`/api/parent/videos/${encodeURIComponent(id)}/restore`, "POST", {}),
  orderCategoryVideos: (categoryId: string, ids: string[]) => write<{ ok: true }>(`/api/parent/categories/${encodeURIComponent(categoryId)}/videos/order`, "PUT", { ids }),
  settings: () => api<Record<string, unknown>>("/api/parent/settings"),
  updateSettings: (body: { timezone: string }) => write<{ ok: true }>("/api/parent/settings", "PATCH", body),
  changePassword: (currentPassword: string, newPassword: string) => write<{ ok: true }>("/api/parent/password", "POST", { currentPassword, newPassword }),
  devices: () => api<ChildDevice[]>("/api/parent/devices"),
  authorizeDevice: (name: string) => write<{ id: string; name: string }>("/api/parent/devices", "POST", { name }),
  updateDevice: (id: string, name: string) => write<{ ok: true }>(`/api/parent/devices/${encodeURIComponent(id)}`, "PATCH", { name }),
  revokeDevice: (id: string) => write<{ ok: true }>(`/api/parent/devices/${encodeURIComponent(id)}`, "DELETE", {}),
};
