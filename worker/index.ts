import {
  getDeviceStatus,
  getPublicCategories,
  getPublicCategoryVideos,
  getPublicVideo,
  heartbeatViewSession,
  saveNote,
  startViewSession,
} from "./content";
import { fail, HttpError, json, routeId } from "./http";
import {
  archiveCategory,
  archiveVideo,
  authorizeDevice,
  changePassword,
  createCategory,
  createVideo,
  getDashboard,
  getDevices,
  getParentCategories,
  getParentVideos,
  getSettings,
  loginParent,
  logoutParent,
  orderCategories,
  orderCategoryVideos,
  parentSessionStatus,
  previewVideo,
  refreshVideoMetadata,
  revokeDevice,
  updateCategory,
  updateDevice,
  updateSettings,
  updateVideo,
} from "./parent";
import type { AppEnv } from "./types";

async function route(request: Request, env: AppEnv) {
  const url = new URL(request.url);
  const { method } = request;
  const path = url.pathname;
  if (!path.startsWith("/api/")) throw new HttpError("Not Found", 404);

  if (method === "GET" && path === "/api/health") return json({ ok: true, phase: "1B" });
  if (method === "GET" && path === "/api/content/categories") return getPublicCategories(env);
  let id = routeId(path, /^\/api\/content\/categories\/([^/]+)\/videos$/);
  if (method === "GET" && id) return getPublicCategoryVideos(env, id);
  id = routeId(path, /^\/api\/content\/videos\/([^/]+)$/);
  if (method === "GET" && id) return getPublicVideo(env, id);
  if (method === "GET" && path === "/api/device/status") return getDeviceStatus(request, env);
  if (method === "POST" && path === "/api/view-sessions") return startViewSession(request, env);
  id = routeId(path, /^\/api\/view-sessions\/([^/]+)$/);
  if (method === "PATCH" && id) return heartbeatViewSession(request, env, id);
  if (method === "POST" && path === "/api/notes") return saveNote(request, env);

  if (path === "/api/parent/session") {
    if (method === "GET") return parentSessionStatus(request, env);
    if (method === "POST") return loginParent(request, env);
    if (method === "DELETE") return logoutParent(request, env);
  }
  if (method === "POST" && path === "/api/parent/password") return changePassword(request, env);
  if (method === "GET" && path === "/api/parent/dashboard/today") return getDashboard(request, env);

  if (path === "/api/parent/categories") {
    if (method === "GET") return getParentCategories(request, env);
    if (method === "POST") return createCategory(request, env);
  }
  if (method === "PUT" && path === "/api/parent/categories/order") return orderCategories(request, env);
  id = routeId(path, /^\/api\/parent\/categories\/([^/]+)$/);
  if (method === "PATCH" && id) return updateCategory(request, env, id);
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
  if (method === "POST" && path === "/api/parent/videos/preview") return previewVideo(request, env);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)$/);
  if (method === "PATCH" && id) return updateVideo(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/metadata$/);
  if (method === "POST" && id) return refreshVideoMetadata(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/archive$/);
  if (method === "POST" && id) return archiveVideo(request, env, id);
  id = routeId(path, /^\/api\/parent\/videos\/([^/]+)\/restore$/);
  if (method === "POST" && id) return archiveVideo(request, env, id, true);

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
