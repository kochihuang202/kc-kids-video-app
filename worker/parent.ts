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
import { fetchYouTubeMetadata, parseYouTubeVideoId } from "./youtube";

const tones = ["sky", "apricot", "sage"] as const;

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
  const currentSession = await requireParentMutation(request, env);
  const body = await readJson(request);
  const currentPassword = text(body.currentPassword, "目前密碼", 8, 128);
  const newPassword = text(body.newPassword, "新密碼", 8, 128);
  const validation = await validatePassword(currentPassword, env);
  if (!validation.valid) throw new HttpError("目前密碼不正確。", 400, "INVALID_PASSWORD");
  const record = await makePasswordRecord(newPassword);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO admin_credentials (id, password_hash, salt, iterations, created_at, updated_at)
      VALUES ('family', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt,
        iterations = excluded.iterations, updated_at = excluded.updated_at
    `).bind(record.hash, record.salt, record.iterations, now, now),
    env.DB.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE id != ? AND revoked_at IS NULL")
      .bind(now, currentSession.id),
  ]);
  return json({ ok: true });
}

interface AdminCategoryRow {
  id: string; name: string; icon: string; image_url: string | null; tone: string;
  sort_order: number; is_active: number; created_at: string; updated_at: string; archived_at: string | null;
}

const adminCategoryDto = (row: AdminCategoryRow) => ({
  id: row.id, name: row.name, icon: row.icon, imageUrl: row.image_url, tone: row.tone,
  sortOrder: row.sort_order, isActive: !!row.is_active, createdAt: row.created_at,
  updatedAt: row.updated_at, archivedAt: row.archived_at,
});

async function allCategories(env: AppEnv) {
  const result = await env.DB.prepare(`
    SELECT id, name, icon, image_url, tone, sort_order, is_active, created_at, updated_at, archived_at
    FROM categories ORDER BY archived_at IS NOT NULL, sort_order, name
  `).all<AdminCategoryRow>();
  return (result.results || []).map(adminCategoryDto);
}

export async function getParentCategories(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  return json(await allCategories(env));
}

function slugify(value: string) {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `item-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueId(env: AppEnv, table: "categories" | "videos", seed: string) {
  const base = slugify(seed);
  for (let index = 0; index < 100; index += 1) {
    const id = index ? `${base}-${index + 1}` : base;
    const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first();
    if (!row) return id;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createCategory(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const name = text(body.name, "分類名稱", 1, 80);
  const icon = text(body.icon, "分類圖示", 1, 12);
  const imageUrl = optionalText(body.imageUrl, "圖片網址", 500);
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value, COUNT(*) AS count FROM categories WHERE archived_at IS NULL")
    .first<{ value: number; count: number }>();
  const id = await uniqueId(env, "categories", typeof body.id === "string" ? body.id : name);
  const now = new Date().toISOString();
  const tone = tones[(max?.count || 0) % tones.length];
  await env.DB.prepare(`
    INSERT INTO categories (id, name, icon, image_url, tone, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, name, icon, imageUrl, (max?.value || 0) + 1, tone, now, now).run();
  return json({ id }, { status: 201 });
}

export async function updateCategory(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM categories WHERE id = ?").bind(id).first<AdminCategoryRow>();
  if (!current) throw new HttpError("找不到這個分類。", 404);
  const name = body.name === undefined ? current.name : text(body.name, "分類名稱", 1, 80);
  const icon = body.icon === undefined ? current.icon : text(body.icon, "分類圖示", 1, 12);
  const imageUrl = body.imageUrl === undefined ? current.image_url : optionalText(body.imageUrl, "圖片網址", 500);
  const isActive = body.isActive === undefined ? !!current.is_active : boolean(body.isActive, "顯示狀態");
  await env.DB.prepare("UPDATE categories SET name = ?, icon = ?, image_url = ?, is_active = ?, updated_at = ? WHERE id = ?")
    .bind(name, icon, imageUrl, isActive ? 1 : 0, new Date().toISOString(), id).run();
  return json({ ok: true });
}

export async function archiveCategory(request: Request, env: AppEnv, id: string, restore = false) {
  await requireParentMutation(request, env);
  const now = new Date().toISOString();
  const result = restore
    ? await env.DB.prepare("UPDATE categories SET archived_at = NULL, is_active = 0, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL").bind(now, id).run()
    : await env.DB.prepare("UPDATE categories SET archived_at = ?, is_active = 0, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  if (!result.meta.changes) throw new HttpError("找不到可更新的分類。", 404);
  return json({ ok: true });
}

async function assertCompleteOrder(env: AppEnv, ids: string[], query: string, binding?: string) {
  const result = binding ? await env.DB.prepare(query).bind(binding).all<{ id: string }>() : await env.DB.prepare(query).all<{ id: string }>();
  const expected = (result.results || []).map((row) => row.id).sort();
  const received = [...ids].sort();
  if (expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
    throw new HttpError("排序清單必須包含目前範圍內的所有項目，且不可重複。", 409, "INCOMPLETE_ORDER");
  }
}

export async function orderCategories(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const ids = stringArray(body.ids, "分類排序");
  await assertCompleteOrder(env, ids, "SELECT id FROM categories WHERE archived_at IS NULL");
  const now = new Date().toISOString();
  await env.DB.batch(ids.map((id, index) => env.DB.prepare(
    "UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?",
  ).bind(index + 1, now, id)));
  return json({ ok: true });
}

interface AdminVideoRow {
  id: string; source: string; youtube_video_id: string; youtube_url: string; youtube_title: string;
  parent_label: string; thumbnail_url: string; duration_seconds: number | null; availability_status: string;
  metadata_error: string | null; is_active: number; created_at: string; updated_at: string; archived_at: string | null;
}

async function memberships(env: AppEnv) {
  const result = await env.DB.prepare("SELECT category_id, video_id, sort_order FROM category_videos ORDER BY category_id, sort_order")
    .all<{ category_id: string; video_id: string; sort_order: number }>();
  return result.results || [];
}

async function allVideos(env: AppEnv) {
  const [videoResult, links] = await Promise.all([
    env.DB.prepare("SELECT * FROM videos ORDER BY archived_at IS NOT NULL, updated_at DESC").all<AdminVideoRow>(),
    memberships(env),
  ]);
  return (videoResult.results || []).map((row) => ({
    id: row.id, source: row.source, youtubeVideoId: row.youtube_video_id, youtubeUrl: row.youtube_url,
    youtubeTitle: row.youtube_title, parentLabel: row.parent_label, thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds, availabilityStatus: row.availability_status,
    metadataError: row.metadata_error, isActive: !!row.is_active, createdAt: row.created_at,
    updatedAt: row.updated_at, archivedAt: row.archived_at,
    categoryIds: links.filter((link) => link.video_id === row.id).map((link) => link.category_id),
    categorySortOrders: Object.fromEntries(links.filter((link) => link.video_id === row.id).map((link) => [link.category_id, link.sort_order])),
  }));
}

export async function getParentVideos(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  return json(await allVideos(env));
}

export async function previewVideo(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const url = text(body.url, "YouTube 網址", 1, 1000);
  const youtubeVideoId = parseYouTubeVideoId(url);
  const existing = await env.DB.prepare(`
    SELECT id, parent_label, youtube_video_id, youtube_url, youtube_title, thumbnail_url,
      duration_seconds, availability_status, metadata_error
    FROM videos WHERE youtube_video_id = ?
  `).bind(youtubeVideoId).first<{
    id: string; parent_label: string; youtube_video_id: string; youtube_url: string; youtube_title: string;
    thumbnail_url: string; duration_seconds: number | null; availability_status: string; metadata_error: string | null;
  }>();
  if (existing) return json({
    youtubeVideoId: existing.youtube_video_id, youtubeUrl: existing.youtube_url,
    youtubeTitle: existing.youtube_title, thumbnailUrl: existing.thumbnail_url,
    durationSeconds: existing.duration_seconds || 0, availabilityStatus: existing.availability_status,
    metadataError: existing.metadata_error, duplicate: { id: existing.id, parentLabel: existing.parent_label },
  });
  const metadata = await fetchYouTubeMetadata(url, env);
  const duplicate = await env.DB.prepare("SELECT id, parent_label FROM videos WHERE youtube_video_id = ?")
    .bind(metadata.youtubeVideoId).first<{ id: string; parent_label: string }>();
  return json({ ...metadata, duplicate: duplicate ? { id: duplicate.id, parentLabel: duplicate.parent_label } : null });
}

async function validateCategoryIds(env: AppEnv, categoryIds: string[]) {
  if (!categoryIds.length) throw new HttpError("至少選擇一個分類。", 400, "CATEGORY_REQUIRED");
  const placeholders = categoryIds.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT id FROM categories WHERE id IN (${placeholders}) AND archived_at IS NULL`)
    .bind(...categoryIds).all<{ id: string }>();
  if ((result.results || []).length !== categoryIds.length) throw new HttpError("分類選擇不正確。", 400);
}

async function replaceMemberships(env: AppEnv, videoId: string, categoryIds: string[]) {
  await validateCategoryIds(env, categoryIds);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM category_videos WHERE video_id = ?").bind(videoId)];
  for (const categoryId of categoryIds) {
    statements.push(env.DB.prepare(`
      INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
      VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM category_videos WHERE category_id = ?), ?)
    `).bind(categoryId, videoId, categoryId, now));
  }
  await env.DB.batch(statements);
}

export async function createVideo(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const url = text(body.url, "YouTube 網址", 1, 1000);
  const parentLabel = text(body.parentLabel, "家長短名稱", 1, 120);
  const categoryIds = stringArray(body.categoryIds, "影片分類");
  await validateCategoryIds(env, categoryIds);
  const metadata = await fetchYouTubeMetadata(url, env);
  const duplicate = await env.DB.prepare("SELECT id FROM videos WHERE youtube_video_id = ?")
    .bind(metadata.youtubeVideoId).first<{ id: string }>();
  if (duplicate) throw new HttpError("這部影片已經在白名單中。", 409, `DUPLICATE_VIDEO:${duplicate.id}`);
  if (metadata.availabilityStatus !== "available") throw new HttpError(metadata.metadataError || "影片不可播放。", 400, "VIDEO_UNAVAILABLE");
  const id = await uniqueId(env, "videos", typeof body.id === "string" ? body.id : parentLabel);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO videos (
      id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
      thumbnail_url, duration_seconds, availability_status, metadata_error,
      is_active, created_at, updated_at
    ) VALUES (?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, metadata.youtubeVideoId, metadata.youtubeUrl, metadata.youtubeTitle, parentLabel,
    metadata.thumbnailUrl, metadata.durationSeconds, metadata.availabilityStatus, metadata.metadataError, now, now).run();
  await replaceMemberships(env, id, categoryIds);
  return json({ id }, { status: 201 });
}

export async function updateVideo(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<AdminVideoRow>();
  if (!current) throw new HttpError("找不到這部影片。", 404);
  const parentLabel = body.parentLabel === undefined ? current.parent_label : text(body.parentLabel, "家長短名稱", 1, 120);
  const isActive = body.isActive === undefined ? !!current.is_active : boolean(body.isActive, "顯示狀態");
  if (isActive && (current.archived_at || current.availability_status !== "available")) {
    throw new HttpError("封存或不可播放的影片不能直接顯示。", 409);
  }
  await env.DB.prepare("UPDATE videos SET parent_label = ?, is_active = ?, updated_at = ? WHERE id = ?")
    .bind(parentLabel, isActive ? 1 : 0, new Date().toISOString(), id).run();
  if (body.categoryIds !== undefined) await replaceMemberships(env, id, stringArray(body.categoryIds, "影片分類"));
  return json({ ok: true });
}

export async function refreshVideoMetadata(request: Request, env: AppEnv, id: string) {
  await requireParentMutation(request, env);
  await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first<AdminVideoRow>();
  if (!current) throw new HttpError("找不到這部影片。", 404);
  try {
    const metadata = await fetchYouTubeMetadata(current.youtube_url || current.youtube_video_id, env);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE videos SET youtube_title = ?, thumbnail_url = ?, duration_seconds = ?,
        availability_status = ?, metadata_error = ?,
        is_active = CASE WHEN ? = 1 THEN 0 ELSE is_active END, updated_at = ? WHERE id = ?
    `).bind(metadata.youtubeTitle, metadata.thumbnailUrl, metadata.durationSeconds,
      metadata.availabilityStatus, metadata.metadataError, metadata.definitiveUnavailable ? 1 : 0, now, id).run();
    return json({ ...metadata });
  } catch (error) {
    if (error instanceof HttpError && error.code === "YOUTUBE_TEMPORARY_ERROR") {
      await env.DB.prepare("UPDATE videos SET metadata_error = ?, updated_at = ? WHERE id = ?")
        .bind(error.message, new Date().toISOString(), id).run();
    }
    throw error;
  }
}

export async function archiveVideo(request: Request, env: AppEnv, id: string, restore = false) {
  await requireParentMutation(request, env);
  const now = new Date().toISOString();
  const result = restore
    ? await env.DB.prepare("UPDATE videos SET archived_at = NULL, is_active = 0, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL").bind(now, id).run()
    : await env.DB.prepare("UPDATE videos SET archived_at = ?, is_active = 0, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  if (!result.meta.changes) throw new HttpError("找不到可更新的影片。", 404);
  return json({ ok: true });
}

export async function orderCategoryVideos(request: Request, env: AppEnv, categoryId: string) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const ids = stringArray(body.ids, "影片排序");
  await assertCompleteOrder(env, ids, "SELECT video_id AS id FROM category_videos WHERE category_id = ?", categoryId);
  await env.DB.batch(ids.map((id, index) => env.DB.prepare(
    "UPDATE category_videos SET sort_order = ? WHERE category_id = ? AND video_id = ?",
  ).bind(index + 1, categoryId, id)));
  return json({ ok: true });
}

export async function getSettings(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const result = await env.DB.prepare("SELECT key, value_json FROM settings ORDER BY key").all<{ key: string; value_json: string }>();
  const values: Record<string, unknown> = {};
  for (const row of result.results || []) {
    try { values[row.key] = JSON.parse(row.value_json); } catch { values[row.key] = row.value_json; }
  }
  return json(values);
}

export async function updateSettings(request: Request, env: AppEnv) {
  await requireParentMutation(request, env);
  const body = await readJson(request);
  const allowed = ["timezone"];
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
}
interface HeartbeatRow {
  view_session_id: string; delta_seconds: number; interval_started_at: string | null;
  interval_ended_at: string | null; received_at: string;
}

function validRange(start: string | null, end: string | null) {
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
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
        s.last_position_seconds, s.started_at, s.updated_at, s.ended_at
      FROM view_sessions s LEFT JOIN videos v ON v.id = s.video_id
      WHERE s.started_at < ? AND COALESCE(s.ended_at, s.updated_at) >= ?
      ORDER BY s.started_at
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
  const timeline = sessions.map((session) => {
    const matching = heartbeats.filter((heartbeat) => heartbeat.view_session_id === session.id);
    const played = matching.length
      ? matching.reduce((total, heartbeat) => total + heartbeatSeconds(heartbeat, start, end), 0)
      : (session.started_at >= start && session.started_at < end ? session.played_seconds : 0);
    return {
      id: session.id, videoId: session.video_id, videoLabel: session.video_label || "已封存影片",
      playedSeconds: Math.round(played), lastPositionSeconds: session.last_position_seconds,
      startedAt: session.started_at, updatedAt: session.updated_at,
      noteCount: notes.filter((note) => note.view_session_id === session.id).length,
    };
  }).filter((session) => session.playedSeconds > 0 || notes.some((note) => note.view_session_id === session.id));
  return json({
    notes: notes.map((note) => ({
      id: note.id, videoId: note.video_id, videoLabel: note.video_label || "已封存影片", content: note.content,
      videoPositionSeconds: note.video_position_seconds, createdAt: note.created_at,
    })),
    timeline,
    summary: {
      totalPlayedSeconds: timeline.reduce((sum, session) => sum + session.playedSeconds, 0),
      playedVideoCount: new Set(timeline.map((session) => session.videoId)).size,
      sessionCount: timeline.length,
      noteCount: notes.length,
    },
    errors,
  });
}
