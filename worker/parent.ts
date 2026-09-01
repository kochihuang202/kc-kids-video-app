import {
  assertSameOrigin,
  boolean,
  HttpError,
  integer,
  json,
  optionalText,
  readJson,
  stringArray,
  text,
} from "./http";
import { mediaDto } from "./media";
import {
  addTodayBonus,
  calculateSharedUsage,
  evaluateChildAccessState,
  getRules,
  getTodayPicks,
  setTodayPause,
  toggleTodayPick,
  updateRules,
  updateTodayPicks,
} from "./rules";
import {
  clearDeviceCookie,
  clearParentCookie,
  consumeRateLimit,
  deviceCookie,
  getChildDevice,
  makePasswordRecord,
  parentCookie,
  parseCookies,
  parsePasswordSecret,
  randomToken,
  rateKey,
  sessionExpiry,
  tokenHash,
  verifyParent,
  verifyPassword,
} from "./security";
import type { AppEnv, JsonObject, ParentSession } from "./types";
import { fetchYouTubeMetadata, parseYouTubeVideoId, type VideoMetadata } from "./youtube";
import { formatPosition, getDayRangeInTimeZone } from "../src/lib/utils";

const tones = ["sky", "apricot", "sage"] as const;
const seriesTypes = ["learning", "leisure"] as const;

async function validateCategorySeriesScope(env: AppEnv, categoryIds: string[]) {
  const uniqueIds = [...new Set(categoryIds)];
  if (!uniqueIds.length) throw new HttpError("請至少選擇一個分類。");
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, series_type FROM categories WHERE id IN (${placeholders}) AND archived_at IS NULL`,
  ).bind(...uniqueIds).all<{ id: string; series_type: "learning" | "leisure" }>();
  if ((rows.results || []).length !== uniqueIds.length) throw new HttpError("所選分類不存在。", 404, "CATEGORY_NOT_FOUND");
  const types = new Set((rows.results || []).map((row) => row.series_type));
  if (types.size !== 1) throw new HttpError("同一影片不能同時屬於學習與休閒分類。", 409, "SERIES_TYPE_CONFLICT");
  return [...types][0];
}

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}

async function requireParentMutation(request: Request, env: AppEnv) {
  assertSameOrigin(request, env.APP_ORIGIN);
  return verifyParent(request, env);
}

interface CredentialRow { password_hash: string; salt: string; iterations: number }

async function credential(env: AppEnv) {
  return env.DB.prepare(
    "SELECT password_hash, salt, iterations FROM admin_credentials WHERE id = 'family'",
  ).first<CredentialRow>();
}

async function validatePassword(password: string, env: AppEnv) {
  const stored = await credential(env);
  if (stored) return { valid: await verifyPassword(password, stored.password_hash, stored.salt, stored.iterations), bootstrap: null };
  const bootstrap = parsePasswordSecret(env.PARENT_PASSWORD_HASH);
  if (!bootstrap) throw new HttpError("家長密碼尚未完成設定。", 503, "PARENT_PASSWORD_NOT_CONFIGURED");
  return { valid: await verifyPassword(password, bootstrap.hash, bootstrap.salt, bootstrap.iterations), bootstrap };
}

export async function parentSessionStatus(request: Request, env: AppEnv) {
  try {
    const session = await verifyParent(request, env);
    return json({ authenticated: true, expiresAt: session.expiresAt });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return json({ authenticated: false });
    throw error;
  }
}

export async function loginParent(request: Request, env: AppEnv) {
  assertSameOrigin(request, env.APP_ORIGIN);
  const body = await readJson(request);
  const password = text(body.password, "密碼", 8, 128);
  const result = await validatePassword(password, env);
  if (!result.valid) {
    await consumeRateLimit(env, await rateKey(env, "login", clientIp(request)), 5, 15 * 60);
    throw new HttpError("密碼不正確。", 401, "INVALID_PASSWORD");
  }
  const now = new Date().toISOString();
  if (result.bootstrap) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO admin_credentials
        (id, password_hash, salt, iterations, created_at, updated_at)
      VALUES ('family', ?, ?, ?, ?, ?)
    `).bind(result.bootstrap.hash, result.bootstrap.salt, result.bootstrap.iterations, now, now).run();
  }
  const token = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = sessionExpiry();
  await env.DB.prepare(`
    INSERT INTO admin_sessions (id, token_hash, created_at, expires_at, last_used_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, await tokenHash(token, env), now, expiresAt, now).run();
  return json({ authenticated: true, expiresAt }, { headers: { "set-cookie": parentCookie(token) } });
}

export async function logoutParent(request: Request, env: AppEnv) {
  assertSameOrigin(request, env.APP_ORIGIN);
  const token = parseCookies(request).parent_session;
  if (token) {
    await env.DB.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(new Date().toISOString(), await tokenHash(token, env)).run();
  }
  return json({ ok: true }, { headers: { "set-cookie": clearParentCookie() } });
}

export async function changePassword(request: Request, env: AppEnv) {
  const session = await requireParentMutation(request, env);
  const body = await readJson(request);
  const currentPassword = text(body.currentPassword, "目前密碼", 8, 128);
  const newPassword = text(body.newPassword, "新密碼", 8, 128);
  const validCurrent = await validatePassword(currentPassword, env);
  if (!validCurrent.valid) throw new HttpError("目前密碼不正確。", 400, "INVALID_CURRENT_PASSWORD");
  const record = await makePasswordRecord(newPassword);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO admin_credentials (id, password_hash, salt, iterations, created_at, updated_at)
      VALUES ('family', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        password_hash = excluded.password_hash,
        salt = excluded.salt,
        iterations = excluded.iterations,
        updated_at = excluded.updated_at
    `).bind(record.hash, record.salt, record.iterations, now, now),
    env.DB.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE id != ? AND revoked_at IS NULL").bind(now, session.id),
  ]);
  return json({ ok: true });
}

export async function getParentCategories(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const result = await env.DB.prepare(`
    SELECT id, name, icon, image_url, tone, sort_order, is_active, daily_limit_seconds, series_type, created_at, updated_at, archived_at
    FROM categories
    ORDER BY sort_order, id
  `).all();
  return json((result.results || []).map((row: any) => ({
    id: row.id, name: row.name, icon: row.icon, imageUrl: row.image_url,
    tone: row.tone, sortOrder: row.sort_order, isActive: row.is_active === 1,
    dailyLimitSeconds: row.daily_limit_seconds ?? null,
    seriesType: row.series_type,
    createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at,
  })));
}

export async function createCategory(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const name = text(body.name, "分類名稱", 1, 80);
  const icon = text(body.icon || "✨", "分類圖示", 1, 8);
  const imageUrl = optionalText(body.imageUrl, "分類圖片網址", 500);
  const tone = text(body.tone || "sky", "色系", 3, 20) as typeof tones[number];
  if (!tones.includes(tone)) throw new HttpError("色系設定不正確。");
  const dailyLimitSeconds = body.dailyLimitSeconds ? integer(body.dailyLimitSeconds, "每日播放上限", 0, 86400) : null;
  const seriesType = text(body.seriesType || "leisure", "系列類型", 7, 8) as typeof seriesTypes[number];
  if (!seriesTypes.includes(seriesType)) throw new HttpError("系列類型設定不正確。");
  const id = text(body.id || name.toLowerCase().replace(/\s+/g, "-"), "分類識別碼", 1, 40);
  const nextOrder = (await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM categories").first<{ next_order: number }>())?.next_order || 1;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO categories (id, name, icon, image_url, tone, sort_order, is_active, daily_limit_seconds, series_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).bind(id, name, icon, imageUrl, tone, nextOrder, dailyLimitSeconds, seriesType, now, now).run();
  return json({ id, name, icon, imageUrl, tone, sortOrder: nextOrder, isActive: true, dailyLimitSeconds, seriesType, createdAt: now, updatedAt: now, archivedAt: null }, { status: 201 });
}

export async function updateCategory(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(id).first<any>();
  if (!current) throw new HttpError("找不到這個分類。", 404);
  const name = body.name !== undefined ? text(body.name, "分類名稱", 1, 80) : current.name;
  const icon = body.icon !== undefined ? text(body.icon, "分類圖示", 1, 8) : current.icon;
  const imageUrl = body.imageUrl !== undefined ? optionalText(body.imageUrl, "分類圖片網址", 500) : current.image_url;
  const tone = body.tone !== undefined ? text(body.tone, "色系", 3, 20) : current.tone;
  if (!tones.includes(tone as typeof tones[number])) throw new HttpError("色系設定不正確。");
  const isActive = body.isActive !== undefined ? (boolean(body.isActive, "啟用狀態") ? 1 : 0) : current.is_active;
  const dailyLimitSeconds = body.dailyLimitSeconds !== undefined
    ? (body.dailyLimitSeconds === null || body.dailyLimitSeconds === 0 ? null : integer(body.dailyLimitSeconds, "每日播放上限", 0, 86400))
    : current.daily_limit_seconds;
  const seriesType = body.seriesType !== undefined ? text(body.seriesType, "系列類型", 7, 8) : current.series_type;
  if (!seriesTypes.includes(seriesType as typeof seriesTypes[number])) throw new HttpError("系列類型設定不正確。");
  if (seriesType !== current.series_type) {
    const conflicting = await env.DB.prepare(`
      SELECT 1 AS found
      FROM category_videos cv
      JOIN category_videos other ON other.video_id = cv.video_id AND other.category_id != cv.category_id
      JOIN categories other_category ON other_category.id = other.category_id
      WHERE cv.category_id = ? AND other_category.archived_at IS NULL AND other_category.series_type != ?
      LIMIT 1
    `).bind(id, seriesType).first();
    if (conflicting) throw new HttpError("此分類含有同時出現在另一類系列的影片，請先調整影片分類。", 409, "SERIES_TYPE_CONFLICT");
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE categories SET name = ?, icon = ?, image_url = ?, tone = ?, is_active = ?, daily_limit_seconds = ?, series_type = ?, updated_at = ?
    WHERE id = ?
  `).bind(name, icon, imageUrl, tone, isActive, dailyLimitSeconds, seriesType, now, id).run();
  return json({ ok: true });
}

export async function archiveCategory(request: Request, env: AppEnv, id: string, restore = false) {
  await requireParentMutation(request, env);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE categories SET archived_at = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).bind(restore ? null : now, restore ? 1 : 0, now, id).run();
  if (!result.meta.changes) throw new HttpError("找不到這個分類。", 404);
  return json({ ok: true });
}

export async function orderCategories(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const ids = stringArray(body.ids || body.categoryIds, "分類順序清單");
  const activeCategories = await env.DB.prepare(
    "SELECT id FROM categories WHERE archived_at IS NULL ORDER BY sort_order, id",
  ).all<{ id: string }>();
  const activeIds = (activeCategories.results || []).map((c) => c.id);
  const activeSet = new Set(activeIds);
  if (ids.length !== activeIds.length || new Set(ids).size !== ids.length || ids.some((id) => !activeSet.has(id))) {
    throw new HttpError("排序清單不完整。", 409, "INCOMPLETE_SORT_SCOPE");
  }
  const now = new Date().toISOString();
  await env.DB.batch(ids.map((id, index) => env.DB.prepare(
    "UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?",
  ).bind(index + 1, now, id)));
  return json({ ok: true });
}

export async function orderCategoryVideos(request: Request, env: AppEnv, categoryId: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const ids = stringArray(body.ids || body.videoIds, "影片順序清單");
  const activeVideos = await env.DB.prepare(`
    SELECT v.id FROM category_videos cv
    JOIN videos v ON v.id = cv.video_id
    WHERE cv.category_id = ? AND v.is_active = 1 AND v.archived_at IS NULL
  `).bind(categoryId).all<{ id: string }>();
  const activeIds = (activeVideos.results || []).map((v) => v.id);
  const activeSet = new Set(activeIds);
  if (ids.length !== activeIds.length || new Set(ids).size !== ids.length || ids.some((id) => !activeSet.has(id))) {
    throw new HttpError("排序清單不完整。", 409, "INCOMPLETE_SORT_SCOPE");
  }
  await env.DB.batch(ids.map((videoId, index) => env.DB.prepare(
    "UPDATE category_videos SET sort_order = ? WHERE category_id = ? AND video_id = ?",
  ).bind(index + 1, categoryId, videoId)));
  return json({ ok: true });
}

export async function getParentVideos(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const categoryFilter = url.searchParams.get("category_id");
  const statusFilter = url.searchParams.get("status") || "all";
  const searchFilter = url.searchParams.get("q") || "";

  let query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_url, v.youtube_title,
      v.parent_label, v.thumbnail_url, v.duration_seconds, v.availability_status,
      v.media_type, v.media_path, v.thumbnail_path,
      v.health_status, v.last_health_check_at, v.metadata_synced_at,
      v.metadata_error, v.is_active, v.created_at, v.updated_at, v.archived_at
    FROM videos v
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (categoryFilter) {
    query += " AND EXISTS (SELECT 1 FROM category_videos cv WHERE cv.video_id = v.id AND cv.category_id = ?)";
    params.push(categoryFilter);
  }

  if (statusFilter === "available") {
    query += " AND v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'";
  } else if (statusFilter === "unavailable") {
    query += " AND (v.availability_status != 'available' OR v.health_status != 'healthy')";
  } else if (statusFilter === "hidden") {
    query += " AND v.is_active = 0 AND v.archived_at IS NULL";
  } else if (statusFilter === "archived") {
    query += " AND v.archived_at IS NULL";
  }

  if (searchFilter.trim()) {
    query += " AND (v.parent_label LIKE ? OR v.youtube_title LIKE ?)";
    const wildcard = `%${searchFilter.trim()}%`;
    params.push(wildcard, wildcard);
  }

  query += " ORDER BY v.updated_at DESC";

  const stmt = env.DB.prepare(query);
  const result = await (params.length ? stmt.bind(...params) : stmt).all();
  const videos = result.results || [];
  const mappings = await env.DB.prepare("SELECT category_id, video_id, sort_order FROM category_videos").all<any>();
  const mappingMap: Record<string, Record<string, number>> = {};
  for (const row of mappings.results || []) {
    if (!mappingMap[row.video_id]) mappingMap[row.video_id] = {};
    mappingMap[row.video_id][row.category_id] = row.sort_order;
  }
  return json(videos.map((row: any) => ({
    id: row.id,
    ...mediaDto(row, env),
    youtubeUrl: row.youtube_url,
    youtubeTitle: row.youtube_title,
    parentLabel: row.parent_label,
    durationSeconds: row.duration_seconds,
    availabilityStatus: row.availability_status,
    healthStatus: row.health_status || "healthy",
    lastHealthCheckAt: row.last_health_check_at,
    metadataSyncedAt: row.metadata_synced_at,
    metadataError: row.metadata_error,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    categoryIds: Object.keys(mappingMap[row.id] || {}),
    categorySortOrders: mappingMap[row.id] || {},
  })));
}

export async function previewVideo(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const body = await readJson(request);
  const url = text(body.url, "YouTube 網址", 1, 500);
  const youtubeVideoId = parseYouTubeVideoId(url);
  const duplicate = await env.DB.prepare(
    "SELECT id, parent_label FROM videos WHERE youtube_video_id = ? AND archived_at IS NULL",
  ).bind(youtubeVideoId).first<{ id: string; parent_label: string }>();

  let metadata: VideoMetadata;
  try {
    metadata = await fetchYouTubeMetadata(youtubeVideoId, env);
  } catch (err) {
    if (duplicate) {
      metadata = {
        youtubeVideoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        youtubeTitle: duplicate.parent_label,
        thumbnailUrl: "",
        durationSeconds: 0,
        availabilityStatus: "available",
        metadataError: null,
        definitiveUnavailable: false,
      };
    } else {
      throw err;
    }
  }

  return json({
    youtubeVideoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    youtubeTitle: metadata.youtubeTitle,
    thumbnailUrl: metadata.thumbnailUrl,
    durationSeconds: metadata.durationSeconds,
    availabilityStatus: metadata.availabilityStatus,
    isEmbeddable: metadata.availabilityStatus !== "not_embeddable",
    metadataError: metadata.metadataError || null,
    duplicate: duplicate ? { id: duplicate.id, parentLabel: duplicate.parent_label } : null,
  });
}

export async function createVideo(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const url = text(body.url, "YouTube 網址", 1, 500);
  const youtubeVideoId = parseYouTubeVideoId(url);
  const parentLabel = text(body.parentLabel, "影片標題", 1, 120);
  const categoryIds = stringArray(body.categoryIds, "所屬分類");
  await validateCategorySeriesScope(env, categoryIds);
  const metadata = await fetchYouTubeMetadata(youtubeVideoId, env);
  const now = new Date().toISOString();
  const id = text(body.id || youtubeVideoId, "影片識別碼", 1, 80);
  await env.DB.prepare(`
    INSERT INTO videos (
      id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
      thumbnail_url, duration_seconds, availability_status, health_status, is_active, created_at, updated_at
    ) VALUES (?, 'youtube', ?, ?, ?, ?, ?, ?, ?, 'healthy', 1, ?, ?)
  `).bind(
    id, youtubeVideoId, `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    metadata.youtubeTitle, parentLabel, metadata.thumbnailUrl, metadata.durationSeconds,
    metadata.availabilityStatus, now, now,
  ).run();
  await env.DB.batch(categoryIds.map((categoryId) => env.DB.prepare(`
    INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
    VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM category_videos WHERE category_id = ?), ?)
  `).bind(categoryId, id, categoryId, now)));
  return json({ id, parentLabel }, { status: 201 });
}

export async function updateVideo(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<any>();
  if (!current) throw new HttpError("找不到這部影片。", 404);
  const parentLabel = body.parentLabel !== undefined ? text(body.parentLabel, "影片標題", 1, 120) : current.parent_label;
  const isActive = body.isActive !== undefined ? (boolean(body.isActive, "啟用狀態") ? 1 : 0) : current.is_active;
  const now = new Date().toISOString();
  const queries: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE videos SET parent_label = ?, is_active = ?, updated_at = ? WHERE id = ?")
      .bind(parentLabel, isActive, now, id),
  ];
  if (body.categoryIds !== undefined) {
    const categoryIds = stringArray(body.categoryIds, "所屬分類");
    await validateCategorySeriesScope(env, categoryIds);
    queries.push(env.DB.prepare("DELETE FROM category_videos WHERE video_id = ?").bind(id));
    for (const categoryId of categoryIds) {
      queries.push(env.DB.prepare(`
        INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
        VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM category_videos WHERE category_id = ?), ?)
      `).bind(categoryId, id, categoryId, now));
    }
  }
  await env.DB.batch(queries);
  return json({ ok: true });
}

export async function batchUpdateVideos(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const ids = stringArray(body.videoIds, "影片 ID 清單");
  const action = text(body.action, "批次操作", 1, 20);
  const now = new Date().toISOString();

  if (action === "hide") {
    await env.DB.batch(ids.map((id) => env.DB.prepare("UPDATE videos SET is_active = 0, updated_at = ? WHERE id = ?").bind(now, id)));
  } else if (action === "show") {
    await env.DB.batch(ids.map((id) => env.DB.prepare("UPDATE videos SET is_active = 1, updated_at = ? WHERE id = ?").bind(now, id)));
  } else if (action === "archive") {
    await env.DB.batch(ids.map((id) => env.DB.prepare("UPDATE videos SET archived_at = ?, is_active = 0, updated_at = ? WHERE id = ?").bind(now, now, id)));
  } else {
    throw new HttpError("不支援的批次操作。");
  }

  return json({ ok: true, count: ids.length });
}

export async function refreshVideoMetadata(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const current = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<any>();
  if (!current || !current.youtube_video_id) throw new HttpError("找不到這部影片。", 404);
  const metadata = await fetchYouTubeMetadata(current.youtube_video_id, env);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE videos SET
      youtube_title = ?, thumbnail_url = ?, duration_seconds = ?, availability_status = ?,
      health_status = 'healthy', metadata_error = NULL, metadata_synced_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(metadata.youtubeTitle, metadata.thumbnailUrl, metadata.durationSeconds, metadata.availabilityStatus, now, now, id).run();
  return json({ ok: true, metadata });
}

export async function archiveVideo(request: Request, env: AppEnv, id: string, restore = false) {
  await requireParentMutation(request, env);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE videos SET archived_at = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).bind(restore ? null : now, restore ? 1 : 0, now, id).run();
  if (!result.meta.changes) throw new HttpError("找不到這部影片。", 404);
  return json({ ok: true });
}

export async function getSettings(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const result = await env.DB.prepare("SELECT key, value_json FROM settings").all<{ key: string; value_json: string }>();
  const values: Record<string, unknown> = {};
  for (const row of result.results || []) {
    try { values[row.key] = JSON.parse(row.value_json); } catch { values[row.key] = row.value_json; }
  }
  return json(values);
}

export async function updateSettings(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const allowed = ["timezone", "playback", "player"];
  const entries = Object.entries(body).filter(([key]) => allowed.includes(key));
  if (!entries.length) throw new HttpError("沒有可更新的設定。", 400);
  const now = new Date().toISOString();
  await env.DB.batch(entries.map(([key, value]) => {
    if (key === "timezone" && (typeof value !== "string" || !isValidTimezone(value))) throw new HttpError("時區不正確。");
    return env.DB.prepare(`
      INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).bind(key, JSON.stringify(value), now);
  }));
  return json({ ok: true });
}

function isValidTimezone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export async function getDevices(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const current = await getChildDevice(request, env, false);
  const result = await env.DB.prepare(`
    SELECT id, name, created_at, last_used_at, revoked_at FROM child_devices
    ORDER BY revoked_at IS NOT NULL, last_used_at DESC
  `).all<{ id: string; name: string; created_at: string; last_used_at: string; revoked_at: string | null }>();
  return json((result.results || []).map((row) => ({
    id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at, isCurrent: row.id === current?.id,
  })));
}

export async function authorizeDevice(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const name = text(body.name, "裝置名稱", 1, 80);
  const token = randomToken();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO child_devices (id, token_hash, name, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, await tokenHash(token, env), name, now, now).run();
  return json({ id, name }, { status: 201, headers: { "set-cookie": deviceCookie(token) } });
}

export async function updateDevice(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const name = text(body.name, "裝置名稱", 1, 80);
  const result = await env.DB.prepare("UPDATE child_devices SET name = ? WHERE id = ? AND revoked_at IS NULL").bind(name, id).run();
  if (!result.meta.changes) throw new HttpError("找不到這台裝置。", 404);
  return json({ ok: true });
}

export async function revokeDevice(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const current = await getChildDevice(request, env, false);
  const result = await env.DB.prepare("UPDATE child_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError("找不到可撤銷的裝置。", 404);
  return json({ ok: true }, current?.id === id ? { headers: { "set-cookie": clearDeviceCookie() } } : undefined);
}

interface DashboardNoteRow {
  id: string; video_id: string; video_label: string | null; content: string;
  video_position_seconds: number; created_at: string; view_session_id: string | null;
}
interface DashboardSessionRow {
  id: string; video_id: string; video_label: string | null; played_seconds: number;
  last_position_seconds: number; started_at: string; updated_at: string; ended_at: string | null;
  child_device_id: string | null; device_name: string | null;
  playback_mode: "video" | "listen"; series_type_snapshot: "learning" | "leisure" | null;
}
interface HeartbeatRow {
  view_session_id: string; delta_seconds: number; interval_started_at: string | null;
  interval_ended_at: string | null; received_at: string;
}

function validRange(start: string | null, end: string | null) {
  if (!start || !end) {
    return getDayRangeInTimeZone("Asia/Taipei", new Date());
  }
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
    throw new HttpError("日期範圍不正確。");
  }
  if (Date.parse(end) - Date.parse(start) > 48 * 60 * 60 * 1000) throw new HttpError("日期範圍過大。");
  return { start, end };
}

function heartbeatSeconds(row: HeartbeatRow, start: string, end: string) {
  if (!row.interval_started_at || !row.interval_ended_at) {
    return row.received_at >= start && row.received_at < end ? row.delta_seconds : 0;
  }
  const from = Date.parse(row.interval_started_at);
  const to = Date.parse(row.interval_ended_at);
  if (to <= from) {
    return from >= Date.parse(start) && from < Date.parse(end) ? row.delta_seconds : 0;
  }
  const overlap = Math.max(0, Math.min(to, Date.parse(end)) - Math.max(from, Date.parse(start)));
  const full = Math.max(1, to - from);
  return row.delta_seconds * Math.min(1, overlap / full);
}

export async function getDashboard(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const { start, end } = validRange(url.searchParams.get("start"), url.searchParams.get("end"));
  const errors: Record<string, string> = {};
  let notes: DashboardNoteRow[] = [];
  let sessions: DashboardSessionRow[] = [];
  let heartbeats: HeartbeatRow[] = [];
  try {
    const result = await env.DB.prepare(`
      SELECT n.id, n.video_id, v.parent_label AS video_label, n.content, n.video_position_seconds,
        n.created_at, n.view_session_id
      FROM notes n LEFT JOIN videos v ON v.id = n.video_id
      WHERE n.created_at >= ? AND n.created_at < ? AND n.deleted_at IS NULL
      ORDER BY n.created_at DESC
    `).bind(start, end).all<DashboardNoteRow>();
    notes = result.results || [];
  } catch { errors.notes = "筆記暫時無法載入。"; }
  try {
    const result = await env.DB.prepare(`
      SELECT s.id, s.video_id, v.parent_label AS video_label, s.played_seconds,
        s.last_position_seconds, s.started_at, s.updated_at, s.ended_at,
        s.child_device_id, COALESCE(cd.name, '家庭裝置') AS device_name,
        COALESCE(s.playback_mode, 'video') AS playback_mode, s.series_type_snapshot
      FROM view_sessions s
      LEFT JOIN videos v ON v.id = s.video_id
      LEFT JOIN child_devices cd ON cd.id = s.child_device_id
      WHERE s.started_at < ? AND COALESCE(s.ended_at, s.updated_at) >= ?
      ORDER BY s.started_at DESC
    `).bind(end, start).all<DashboardSessionRow>();
    sessions = result.results || [];
  } catch { errors.timeline = "觀看足跡暫時無法載入。"; errors.summary = "播放摘要暫時無法載入。"; }
  if (sessions.length) {
    try {
      const result = await env.DB.prepare(`
        SELECT view_session_id, delta_seconds, interval_started_at, interval_ended_at, received_at
        FROM view_heartbeats
        WHERE (interval_started_at IS NOT NULL AND interval_started_at < ? AND interval_ended_at >= ?)
          OR (interval_started_at IS NULL AND received_at >= ? AND received_at < ?)
      `).bind(end, start, start, end).all<HeartbeatRow>();
      heartbeats = result.results || [];
    } catch { errors.summary = "播放摘要暫時無法載入。"; }
  }

  const categoriesResult = await env.DB.prepare(`
    SELECT id, name, icon, tone, sort_order, daily_limit_seconds
    FROM categories
    WHERE archived_at IS NULL
    ORDER BY sort_order, id
  `).all<any>();
  const allCategories = categoriesResult.results || [];

  const catMappings = await env.DB.prepare(`
    SELECT cv.video_id, cv.category_id, c.name, c.icon, c.tone
    FROM category_videos cv
    JOIN categories c ON c.id = cv.category_id
    WHERE c.archived_at IS NULL
  `).all<any>();

  const catMap: Record<string, string[]> = {};
  const videoToCatIds: Record<string, string[]> = {};
  for (const row of catMappings.results || []) {
    if (!catMap[row.video_id]) catMap[row.video_id] = [];
    catMap[row.video_id].push(`${row.icon || ""} ${row.name}`.trim());
    if (!videoToCatIds[row.video_id]) videoToCatIds[row.video_id] = [];
    videoToCatIds[row.video_id].push(row.category_id);
  }

  const timeline = sessions.map((session) => {
    const matching = heartbeats.filter((heartbeat) => heartbeat.view_session_id === session.id);
    const played = matching.length
      ? matching.reduce((total, heartbeat) => total + heartbeatSeconds(heartbeat, start, end), 0)
      : (session.started_at >= start && session.started_at < end ? session.played_seconds : 0);
    return {
      id: session.id, videoId: session.video_id, videoLabel: session.video_label || "已封存影片",
      deviceName: session.device_name || "家庭裝置",
      categoryNames: catMap[session.video_id] || [],
      playedSeconds: Math.round(played), lastPositionSeconds: session.last_position_seconds,
      startedAt: session.started_at, updatedAt: session.updated_at,
      noteCount: notes.filter((note) => note.view_session_id === session.id).length,
      playbackMode: session.playback_mode,
      seriesType: session.series_type_snapshot,
    };
  }).filter((session) => session.playedSeconds > 0 || notes.some((note) => note.view_session_id === session.id));

  const sharedUsage = calculateSharedUsage(sessions, heartbeats, { start, end });
  const sessionsWithHeartbeats = new Set(heartbeats.map((heartbeat) => heartbeat.view_session_id));
  let fallbackLearningSeconds = 0;
  let fallbackLeisureSeconds = 0;
  let fallbackListenSeconds = 0;
  for (const session of timeline) {
    if (sessionsWithHeartbeats.has(session.id)) continue;
    if (session.playbackMode === "listen") fallbackListenSeconds += session.playedSeconds;
    else if (session.seriesType === "learning") fallbackLearningSeconds += session.playedSeconds;
    else fallbackLeisureSeconds += session.playedSeconds;
  }
  const learningSeconds = sharedUsage.learningSeconds + fallbackLearningSeconds;
  const leisureSeconds = sharedUsage.leisureUsedSeconds + fallbackLeisureSeconds;
  const listenSeconds = sharedUsage.listenSeconds + fallbackListenSeconds;
  const totalPlayedSeconds = sharedUsage.totalPlayedSeconds
    + fallbackLearningSeconds + fallbackLeisureSeconds + fallbackListenSeconds;

  // Compute Category Statistics for the day
  const catStatsMap: Record<string, { playedSeconds: number; videoIds: Set<string>; sessionCount: number; noteCount: number }> = {};
  for (const cat of allCategories) {
    catStatsMap[cat.id] = { playedSeconds: 0, videoIds: new Set(), sessionCount: 0, noteCount: 0 };
  }

  for (const session of timeline) {
    const catIds = videoToCatIds[session.videoId] || [];
    for (const cid of catIds) {
      if (!catStatsMap[cid]) catStatsMap[cid] = { playedSeconds: 0, videoIds: new Set(), sessionCount: 0, noteCount: 0 };
      catStatsMap[cid].playedSeconds += session.playedSeconds;
      catStatsMap[cid].videoIds.add(session.videoId);
      catStatsMap[cid].sessionCount += 1;
    }
  }

  for (const note of notes) {
    const catIds = videoToCatIds[note.video_id] || [];
    for (const cid of catIds) {
      if (catStatsMap[cid]) catStatsMap[cid].noteCount += 1;
    }
  }

  const categoryStats = allCategories.map((cat: any) => {
    const stat = catStatsMap[cat.id] || { playedSeconds: 0, videoIds: new Set(), sessionCount: 0, noteCount: 0 };
    const percentage = totalPlayedSeconds > 0 ? Math.round((stat.playedSeconds / totalPlayedSeconds) * 100) : 0;
    return {
      categoryId: cat.id,
      name: cat.name,
      icon: cat.icon,
      tone: cat.tone || "sky",
      playedSeconds: stat.playedSeconds,
      videoCount: stat.videoIds.size,
      sessionCount: stat.sessionCount,
      noteCount: stat.noteCount,
      percentage,
      dailyLimitSeconds: cat.daily_limit_seconds ?? null,
    };
  }).filter((cs: any) => cs.playedSeconds > 0 || cs.noteCount > 0).sort((a: any, b: any) => b.playedSeconds - a.playedSeconds);

  // Compute Device Statistics for the day
  const deviceStatsMap: Record<string, { deviceName: string; playedSeconds: number; videoIds: Set<string>; sessionCount: number }> = {};
  for (const session of sessions) {
    const matching = heartbeats.filter((heartbeat) => heartbeat.view_session_id === session.id);
    const played = matching.length
      ? matching.reduce((total, heartbeat) => total + heartbeatSeconds(heartbeat, start, end), 0)
      : (session.started_at >= start && session.started_at < end ? session.played_seconds : 0);
    const playedSecs = Math.round(played);
    if (playedSecs <= 0) continue;

    const devId = session.child_device_id || "default";
    const devName = session.device_name || "家庭裝置";
    if (!deviceStatsMap[devId]) {
      deviceStatsMap[devId] = { deviceName: devName, playedSeconds: 0, videoIds: new Set(), sessionCount: 0 };
    }
    deviceStatsMap[devId].playedSeconds += playedSecs;
    deviceStatsMap[devId].videoIds.add(session.video_id);
    deviceStatsMap[devId].sessionCount += 1;
  }

  const deviceStats = Object.entries(deviceStatsMap).map(([deviceId, stat]) => ({
    deviceId,
    deviceName: stat.deviceName,
    playedSeconds: stat.playedSeconds,
    videoCount: stat.videoIds.size,
    sessionCount: stat.sessionCount,
    percentage: totalPlayedSeconds > 0 ? Math.round((stat.playedSeconds / totalPlayedSeconds) * 100) : 0,
  })).sort((a, b) => b.playedSeconds - a.playedSeconds);

  const ruleState = await evaluateChildAccessState(env, new Date(start));

  return json({
    notes: notes.map((note) => ({
      id: note.id, videoId: note.video_id, videoLabel: note.video_label || "已封存影片", content: note.content,
      videoPositionSeconds: note.video_position_seconds, createdAt: note.created_at,
    })),
    timeline,
    summary: {
      totalPlayedSeconds,
      learningSeconds,
      leisureSeconds,
      listenSeconds,
      playedVideoCount: new Set(timeline.map((session) => session.videoId)).size,
      sessionCount: timeline.length,
      noteCount: notes.length,
    },
    categoryStats,
    deviceStats,
    ruleState,
    errors,
  });
}

export async function getCalendarHistory(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const month = url.searchParams.get("month"); // YYYY-MM
  const timeZone = "Asia/Taipei";

  let noteQuery = "SELECT created_at FROM notes WHERE deleted_at IS NULL";
  let sessionQuery = "SELECT started_at FROM view_sessions WHERE played_seconds > 0";
  const params: unknown[] = [];

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const startIso = `${month}-01T00:00:00+08:00`;
    noteQuery += " AND created_at >= ?";
    sessionQuery += " AND started_at >= ?";
    params.push(new Date(startIso).toISOString());
  }

  const [noteRows, sessionRows] = await Promise.all([
    env.DB.prepare(noteQuery).bind(...params).all<{ created_at: string }>(),
    env.DB.prepare(sessionQuery).bind(...params).all<{ started_at: string }>(),
  ]);

  const datesWithData = new Set<string>();
  const toDateStr = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("zh-TW", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    } catch {
      return iso.slice(0, 10);
    }
  };

  for (const r of noteRows.results || []) datesWithData.add(toDateStr(r.created_at));
  for (const r of sessionRows.results || []) datesWithData.add(toDateStr(r.started_at));

  return json({
    month: month || "all",
    dates: Array.from(datesWithData).sort(),
  });
}

export async function getSummaryAnalytics(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const rangeType = url.searchParams.get("range") === "30d" ? "30d" : "7d";
  const daysCount = rangeType === "30d" ? 30 : 7;
  const timeZone = "Asia/Taipei";

  const now = new Date();
  const dayBounds: Array<{ dateStr: string; label: string; start: string; end: string }> = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const range = getDayRangeInTimeZone(timeZone, targetDate);
    const dateStr = targetDate.toLocaleDateString("zh-TW", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    const weekday = targetDate.toLocaleDateString("zh-TW", { timeZone, weekday: "short" });
    dayBounds.push({ dateStr, label: `${dateStr.slice(5)} (${weekday})`, start: range.start, end: range.end });
  }

  const overallStart = dayBounds[0].start;
  const overallEnd = dayBounds[dayBounds.length - 1].end;

  const [categoriesResult, catMappings] = await Promise.all([
    env.DB.prepare("SELECT id, name, icon, tone, sort_order FROM categories WHERE archived_at IS NULL ORDER BY sort_order, id").all<any>(),
    env.DB.prepare("SELECT cv.video_id, cv.category_id, c.name, c.icon, c.tone FROM category_videos cv JOIN categories c ON c.id = cv.category_id WHERE c.archived_at IS NULL").all<any>(),
  ]);
  const allCategories = categoriesResult.results || [];
  const videoToCatIds: Record<string, string[]> = {};
  for (const row of catMappings.results || []) {
    if (!videoToCatIds[row.video_id]) videoToCatIds[row.video_id] = [];
    videoToCatIds[row.video_id].push(row.category_id);
  }

  // Fetch all notes for the period (spec #25: thinking notes are 1st priority!)
  const notesResult = await env.DB.prepare(`
    SELECT n.id, n.video_id, v.parent_label AS video_label, n.content, n.video_position_seconds, n.created_at
    FROM notes n
    LEFT JOIN videos v ON v.id = n.video_id
    WHERE n.created_at >= ? AND n.created_at < ? AND n.deleted_at IS NULL
    ORDER BY n.created_at DESC
  `).bind(overallStart, overallEnd).all<DashboardNoteRow>();

  // Fetch heartbeats for accurate daily breakdown calculation
  const heartbeatsResult = await env.DB.prepare(`
    SELECT view_session_id, delta_seconds, interval_started_at, interval_ended_at, received_at
    FROM view_heartbeats
    WHERE (interval_started_at IS NOT NULL AND interval_started_at < ? AND interval_ended_at >= ?)
      OR (interval_started_at IS NULL AND received_at >= ? AND received_at < ?)
  `).bind(overallEnd, overallStart, overallStart, overallEnd).all<HeartbeatRow>();

  const heartbeats = heartbeatsResult.results || [];

  const sessionsResult = await env.DB.prepare(`
    SELECT s.id, s.video_id, s.played_seconds, s.started_at, s.updated_at, s.ended_at,
      s.child_device_id, COALESCE(cd.name, '家庭裝置') AS device_name,
      COALESCE(s.playback_mode, 'video') AS playback_mode, s.series_type_snapshot
    FROM view_sessions s
    LEFT JOIN child_devices cd ON cd.id = s.child_device_id
    WHERE s.started_at < ? AND COALESCE(s.ended_at, s.updated_at) >= ?
  `).bind(overallEnd, overallStart).all<DashboardSessionRow>();

  const sessions = sessionsResult.results || [];

  const sessionPlayedMap: Record<string, number> = {};
  for (const session of sessions) {
    const matching = heartbeats.filter((hb) => hb.view_session_id === session.id);
    const played = matching.length
      ? matching.reduce((sum, hb) => sum + heartbeatSeconds(hb, overallStart, overallEnd), 0)
      : (session.started_at >= overallStart && session.started_at < overallEnd ? session.played_seconds : 0);
    sessionPlayedMap[session.id] = Math.round(played);
  }

  const dailyBars = dayBounds.map((day) => {
    let daySeconds = 0;
    for (const session of sessions) {
      const matching = heartbeats.filter((hb) => hb.view_session_id === session.id);
      if (matching.length) {
        daySeconds += matching.reduce((sum, hb) => sum + heartbeatSeconds(hb, day.start, day.end), 0);
      } else if (session.started_at >= day.start && session.started_at < day.end) {
        daySeconds += session.played_seconds;
      }
    }
    const dayNotes = (notesResult.results || []).filter((n) => n.created_at >= day.start && n.created_at < day.end);
    return {
      date: day.dateStr,
      label: day.label,
      playedSeconds: Math.round(daySeconds),
      noteCount: dayNotes.length,
    };
  });

  const totalPlayedSeconds = dailyBars.reduce((sum, d) => sum + d.playedSeconds, 0);
  const playedVideoIds = new Set(sessions.map((s) => s.video_id));

  // Compute Category Statistics for 7d/30d
  const catStatsMap: Record<string, { playedSeconds: number; videoIds: Set<string>; sessionCount: number; noteCount: number }> = {};
  for (const cat of allCategories) {
    catStatsMap[cat.id] = { playedSeconds: 0, videoIds: new Set(), sessionCount: 0, noteCount: 0 };
  }

  for (const session of sessions) {
    const playedSecs = sessionPlayedMap[session.id] || 0;
    const catIds = videoToCatIds[session.video_id] || [];
    for (const cid of catIds) {
      if (!catStatsMap[cid]) catStatsMap[cid] = { playedSeconds: 0, videoIds: new Set(), sessionCount: 0, noteCount: 0 };
      catStatsMap[cid].playedSeconds += playedSecs;
      catStatsMap[cid].videoIds.add(session.video_id);
      catStatsMap[cid].sessionCount += 1;
    }
  }

  for (const note of (notesResult.results || [])) {
    const catIds = videoToCatIds[note.video_id] || [];
    for (const cid of catIds) {
      if (catStatsMap[cid]) catStatsMap[cid].noteCount += 1;
    }
  }

  const categoryStats = allCategories.map((cat: any) => {
    const stat = catStatsMap[cat.id] || { playedSeconds: 0, videoIds: new Set(), sessionCount: 0, noteCount: 0 };
    const percentage = totalPlayedSeconds > 0 ? Math.round((stat.playedSeconds / totalPlayedSeconds) * 100) : 0;
    return {
      categoryId: cat.id,
      name: cat.name,
      icon: cat.icon,
      tone: cat.tone || "sky",
      playedSeconds: stat.playedSeconds,
      videoCount: stat.videoIds.size,
      sessionCount: stat.sessionCount,
      noteCount: stat.noteCount,
      percentage,
    };
  }).filter((cs: any) => cs.playedSeconds > 0 || cs.noteCount > 0).sort((a: any, b: any) => b.playedSeconds - a.playedSeconds);

  // Compute Device Statistics for 7d/30d
  const deviceStatsMap: Record<string, { deviceName: string; playedSeconds: number; videoIds: Set<string>; sessionCount: number }> = {};
  for (const session of sessions) {
    const playedSecs = sessionPlayedMap[session.id] || 0;
    if (playedSecs <= 0) continue;
    const devId = session.child_device_id || "default";
    const devName = session.device_name || "家庭裝置";
    if (!deviceStatsMap[devId]) {
      deviceStatsMap[devId] = { deviceName: devName, playedSeconds: 0, videoIds: new Set(), sessionCount: 0 };
    }
    deviceStatsMap[devId].playedSeconds += playedSecs;
    deviceStatsMap[devId].videoIds.add(session.video_id);
    deviceStatsMap[devId].sessionCount += 1;
  }

  const deviceStats = Object.entries(deviceStatsMap).map(([deviceId, stat]) => ({
    deviceId,
    deviceName: stat.deviceName,
    playedSeconds: stat.playedSeconds,
    videoCount: stat.videoIds.size,
    sessionCount: stat.sessionCount,
    percentage: totalPlayedSeconds > 0 ? Math.round((stat.playedSeconds / totalPlayedSeconds) * 100) : 0,
  })).sort((a, b) => b.playedSeconds - a.playedSeconds);

  return json({
    range: rangeType,
    summary: {
      totalPlayedSeconds,
      playedVideoCount: playedVideoIds.size,
      noteCount: (notesResult.results || []).length,
      sessionCount: sessions.length,
    },
    dailyBars,
    categoryStats,
    deviceStats,
    notes: (notesResult.results || []).map((n) => ({
      id: n.id,
      videoId: n.video_id,
      videoLabel: n.video_label || "已封存影片",
      content: n.content,
      videoPositionSeconds: n.video_position_seconds,
      createdAt: n.created_at,
    })),
  });
}

export async function searchNotes(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return json({ query: "", total: 0, results: [] });

  const wildcard = `%${query}%`;
  const result = await env.DB.prepare(`
    SELECT n.id, n.video_id, v.parent_label AS video_label, v.youtube_title, v.source,
      v.youtube_video_id, v.thumbnail_url, v.media_type, v.media_path, v.thumbnail_path,
      n.content, n.video_position_seconds, n.created_at
    FROM notes n
    LEFT JOIN videos v ON v.id = n.video_id
    WHERE n.deleted_at IS NULL
      AND (n.content LIKE ? OR v.parent_label LIKE ? OR v.youtube_title LIKE ?)
    ORDER BY n.created_at DESC
  `).bind(wildcard, wildcard, wildcard).all<any>();

  const notes = (result.results || []).map((row) => ({
    id: row.id,
    videoId: row.video_id,
    videoLabel: row.video_label || "未命名影片",
    youtubeTitle: row.youtube_title || "",
    thumbnailUrl: mediaDto(row, env).thumbnailUrl,
    content: row.content,
    videoPositionSeconds: row.video_position_seconds,
    createdAt: row.created_at,
  }));

  return json({
    query,
    total: notes.length,
    results: notes,
  });
}

export async function getVideoHistory(request: Request, env: AppEnv, videoId: string) {
  await verifyParent(request, env);
  const video = await env.DB.prepare(`
    SELECT id, source, youtube_video_id, parent_label, youtube_title, thumbnail_url,
      media_type, media_path, thumbnail_path, duration_seconds,
      availability_status, health_status, is_active, created_at, updated_at
    FROM videos WHERE id = ?
  `).bind(videoId).first<any>();

  if (!video) throw new HttpError("找不到這部影片。", 404);

  const sessions = await env.DB.prepare(`
    SELECT id, played_seconds, last_position_seconds, started_at, updated_at, status
    FROM view_sessions
    WHERE video_id = ?
    ORDER BY started_at DESC
  `).bind(videoId).all<any>();

  const notes = await env.DB.prepare(`
    SELECT id, content, video_position_seconds, created_at, parent_annotation
    FROM notes
    WHERE video_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC
  `).bind(videoId).all<any>();

  const totalPlayedSeconds = (sessions.results || []).reduce((sum: number, s: any) => sum + s.played_seconds, 0);
  const latestSession = (sessions.results || [])[0];
  const lastPositionSeconds = latestSession?.last_position_seconds || 0;
  const isWatched = (video.duration_seconds && lastPositionSeconds)
    ? lastPositionSeconds / video.duration_seconds >= 0.9
    : false;

  return json({
    video: {
      id: video.id,
      ...mediaDto(video, env),
      parentLabel: video.parent_label,
      youtubeTitle: video.youtube_title,
      durationSeconds: video.duration_seconds,
      availabilityStatus: video.availability_status,
      healthStatus: video.health_status,
      isActive: video.is_active === 1,
    },
    stats: {
      playCount: (sessions.results || []).length,
      totalPlayedSeconds,
      lastPositionSeconds,
      isWatched,
      lastPlayedAt: latestSession?.started_at || null,
      noteCount: (notes.results || []).length,
    },
    sessions: (sessions.results || []).map((s: any) => ({
      id: s.id,
      playedSeconds: s.played_seconds,
      lastPositionSeconds: s.last_position_seconds,
      startedAt: s.started_at,
      updatedAt: s.updated_at,
      status: s.status,
    })),
    notes: (notes.results || []).map((n: any) => ({
      id: n.id,
      content: n.content,
      videoPositionSeconds: n.video_position_seconds,
      createdAt: n.created_at,
      parentAnnotation: n.parent_annotation,
    })),
  });
}

export async function softDeleteNote(request: Request, env: AppEnv, noteId: string) {
  await requireParentMutation(request, env);
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(now, noteId).run();
  if (!result.meta.changes) throw new HttpError("找不到這則筆記。", 404);
  return json({ ok: true, deletedAt: now });
}

export async function getParentRules(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  return getRules(request, env);
}

export async function updateParentRules(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  return updateRules(request, env);
}

export async function addParentTodayBonus(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  return addTodayBonus(request, env);
}

export async function setParentTodayPause(request: Request, env: AppEnv, isPaused: boolean) {
  await requireParentMutation(request, env);
  return setTodayPause(request, env, isPaused);
}

export async function getParentTodayPicks(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  return getTodayPicks(request, env);
}

export async function updateParentTodayPicks(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  return updateTodayPicks(request, env);
}

export async function toggleParentTodayPick(request: Request, env: AppEnv, videoId: string) {
  await requireParentMutation(request, env);
  return toggleTodayPick(request, env, videoId);
}
