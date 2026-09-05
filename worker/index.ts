import {
  getChildAccessState,
  getChildTodayPicks,
  getDeviceStatus,
  getPublicCategories,
  getPublicCategoryVideos,
  getPublicRecents,
  getPublicResume,
  getPublicVideo,
  heartbeatViewSession,
  startViewSession,
  updateLearnedState,
} from "./content";
import { exportSessions } from "./export";
import {
  addDiagnosticEvents, exportDiagnostics, finishDiagnosticSession, getDiagnosticsSummary,
  getParentDiagnosticDetail, getParentDiagnostics, startDiagnosticSession,
} from "./diagnostics";
import { runHealthCheck } from "./health";
import { fail, HttpError, json } from "./http";
import { serveMediaAsset } from "./media";
import {
  addParentTodayBonus,
  archiveCategory,
  archiveVideo,
  authorizeDevice,
  batchUpdateVideos,
  changePassword,
  createCategory,
  createVideo,
  getCalendarHistory,
  getDashboard,
  getDevices,
  getParentCategories,
  getParentRules,
  getParentTodayPicks,
  getParentVideos,
  getSettings,
  getSummaryAnalytics,
  getVideoHistory,
  loginParent,
  logoutParent,
  orderCategories,
  orderCategoryVideos,
  parentSessionStatus,
  previewVideo,
  refreshVideoMetadata,
  revokeDevice,
  setParentTodayPause,
  toggleParentTodayPick,
  updateCategory,
  updateDevice,
  updateParentRules,
  updateParentTodayPicks,
  updateSettings,
  updateVideo,
} from "./parent";
import type { AppEnv } from "./types";

function routeId(pathname: string, pattern: RegExp): string | null {
  const match = pathname.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}

async function route(request: Request, env: AppEnv) {
  const url = new URL(request.url);
  const { method } = request;
  const path = url.pathname;
  if (!path.startsWith("/api/")) {
    if ((method === "GET" || method === "HEAD") && env.ASSETS) return env.ASSETS.fetch(request);
    throw new HttpError("Not Found", 404);
  }
  if (method === "GET" && path.startsWith("/api/media/")) {
    const asset = await serveMediaAsset(path, env);
    if (!asset) throw new HttpError("找不到這張縮圖。", 404, "MEDIA_ASSET_NOT_FOUND");
    return asset;
  }
  const recordingEnabled = env.RECORDING_ENABLED !== "false";

  if (method === "GET" && path === "/api/health") return json({ ok: true, phase: "3" });
  if (method === "GET" && path === "/api/content/categories") return getPublicCategories(env);
  if (
    path === "/api/notes" || path.startsWith("/api/parent/notes") ||
    path === "/api/parent/export/notes"
  ) {
    throw new HttpError("孩子想法紀錄已停用。", 410, "NOTES_DISABLED");
  }
  if (!recordingEnabled && method === "GET" && path === "/api/content/resume") return json({ resume: null });
  if (!recordingEnabled && method === "GET" && path === "/api/content/recents") return json([]);
  if (!recordingEnabled && (
    path === "/api/view-sessions" || path.startsWith("/api/view-sessions/") ||
    path.startsWith("/api/parent/dashboard") || path.startsWith("/api/parent/history") ||
    path.startsWith("/api/parent/summary") || path === "/api/parent/export/sessions" ||
    /^\/api\/parent\/videos\/[^/]+\/history$/.test(path)
  )) {
    throw new HttpError("這個網站已停止保存播放與想法紀錄。", 410, "RECORDING_DISABLED");
  }
  if (method === "GET" && path === "/api/content/resume") return getPublicResume(request, env);
  if (method === "GET" && path === "/api/content/recents") return getPublicRecents(request, env);
  if (method === "GET" && path === "/api/child/access-state") return getChildAccessState(request, env);
  if (method === "GET" && path === "/api/child/today-picks") return getChildTodayPicks(request, env);
  let id = routeId(path, /^\/api\/content\/categories\/([^/]+)\/videos$/);
  if (method === "GET" && id) return getPublicCategoryVideos(request, env, id);
  id = routeId(path, /^\/api\/content\/videos\/([^/]+)$/);
  if (method === "GET" && id) return getPublicVideo(request, env, id);
  id = routeId(path, /^\/api\/child\/videos\/([^/]+)\/learned$/);
  if (method === "PUT" && id) return updateLearnedState(request, env, id);
  if (method === "GET" && path === "/api/device/status") return getDeviceStatus(request, env);
  if (method === "POST" && path === "/api/view-sessions") return startViewSession(request, env);
  id = routeId(path, /^\/api\/view-sessions\/([^/]+)$/);
  if (method === "PATCH" && id) return heartbeatViewSession(request, env, id);

  if (method === "POST" && path === "/api/diagnostics/sessions") return startDiagnosticSession(request, env);
  id = routeId(path, /^\/api\/diagnostics\/sessions\/([^/]+)\/events$/);
  if (method === "POST" && id) return addDiagnosticEvents(request, env, id);
  id = routeId(path, /^\/api\/diagnostics\/sessions\/([^/]+)$/);
  if (method === "PATCH" && id) return finishDiagnosticSession(request, env, id);
  if (method === "GET" && path === "/api/diagnostics/export") return exportDiagnostics(request, env);

  if (path === "/api/parent/session") {
    if (method === "GET") return parentSessionStatus(request, env);
    if (method === "POST") return loginParent(request, env);
    if (method === "DELETE") return logoutParent(request, env);
  }
  if (method === "POST" && path === "/api/parent/password") return changePassword(request, env);
  if (method === "GET" && (path === "/api/parent/dashboard/today" || path === "/api/parent/history")) return getDashboard(request, env);
  if (method === "GET" && path === "/api/parent/history/calendar") return getCalendarHistory(request, env);
  if (method === "GET" && path === "/api/parent/summary") return getSummaryAnalytics(request, env);
  if (method === "GET" && path === "/api/parent/diagnostics/summary") return getDiagnosticsSummary(request, env);
  if (method === "GET" && path === "/api/parent/diagnostics/sessions") return getParentDiagnostics(request, env);
  id = routeId(path, /^\/api\/parent\/diagnostics\/sessions\/([^/]+)$/);
  if (method === "GET" && id) return getParentDiagnosticDetail(request, env, id);

  if (path === "/api/parent/rules") {
    if (method === "GET") return getParentRules(request, env);
    if (method === "PUT") return updateParentRules(request, env);
  }
  if (method === "POST" && path === "/api/parent/today/bonus") return addParentTodayBonus(request, env);
  if (method === "POST" && path === "/api/parent/today/pause") return setParentTodayPause(request, env, true);
  if (method === "POST" && path === "/api/parent/today/resume") return setParentTodayPause(request, env, false);

  if (path === "/api/parent/today/picks") {
    if (method === "GET") return getParentTodayPicks(request, env);
    if (method === "PUT") return updateParentTodayPicks(request, env);
  }
  id = routeId(path, /^\/api\/parent\/today\/picks\/([^/]+)\/toggle$/);
  if (method === "POST" && id) return toggleParentTodayPick(request, env, id);

  if (path === "/api/parent/categories") {
    if (method === "GET") return getParentCategories(request, env);
    if (method === "POST") return createCategory(request, env);
  }
  if (method === "PUT" && path === "/api/parent/categories/order") return orderCategories(request, env);
  id = routeId(path, /^\/api\/parent\/categories\/([^/]+)$/);
  if ((method === "PATCH" || method === "PUT") && id) return updateCategory(request, env, id);
  id = routeId(path, /^\/api\/parent\/categories\/([^/]+)\/archive$/);
  if (method === "POST" && id) return archiveCategory(request, env, id);
  id = routeId(path, /^\/api\/parent\/categories\/([^/]+)\/restore$/);
  if (method === "POST" && id) return archiveCategory(request, env, id, true);
  id = routeId(path, /^\/api\/parent\/categories\/([^/]+)\/videos\/order$/);
  if (method === "PUT" && id) return orderCategoryVideos(request, env, id);

  if (path === "/api/parent/videos") {
    if (method === "GET") return getParentVideos(request, env);
    if (method === "POST") return createVideo(request, env);
  }
  if (method === "POST" && path === "/api/parent/videos/batch") return batchUpdateVideos(request, env);
  if (method === "POST" && path === "/api/parent/videos/preview") return previewVideo(request, env);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/history$/);
  if (method === "GET" && id) return getVideoHistory(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)$/);
  if (method === "PATCH" && id) return updateVideo(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/metadata$/);
  if (method === "POST" && id) return refreshVideoMetadata(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/archive$/);
  if (method === "POST" && id) return archiveVideo(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/restore$/);
  if (method === "POST" && id) return archiveVideo(request, env, id, true);

  if (path === "/api/parent/health-check") {
    if (method === "POST") return runHealthCheck(request, env);
  }

  if (path === "/api/parent/export/sessions") {
    if (method === "GET") return exportSessions(request, env);
  }

  if (path === "/api/parent/settings") {
    if (method === "GET") return getSettings(request, env);
    if (method === "PATCH") return updateSettings(request, env);
  }
  if (path === "/api/parent/devices") {
    if (method === "GET") return getDevices(request, env);
    if (method === "POST") return authorizeDevice(request, env);
  }
  id = routeId(path, /^\/api\/parent\/devices\/([^/]+)$/);
  if (method === "PATCH" && id) return updateDevice(request, env, id);
  if (method === "DELETE" && id) return revokeDevice(request, env, id);

  throw new HttpError("找不到這個功能。", 404, "NOT_FOUND");
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      return fail(error);
    }
  },
} satisfies ExportedHandler<AppEnv>;
