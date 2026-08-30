import { HttpError, integer, json, readJson, text } from "./http";
import { consumeRateLimit, getChildDevice, rateKey, randomToken, tokenHash } from "./security";
import type { AppEnv } from "./types";

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  image_url: string | null;
  tone: "sage" | "sky" | "apricot";
  sort_order: number;
}

interface VideoRow {
  id: string;
  youtube_video_id: string;
  youtube_title: string;
  parent_label: string;
  thumbnail_url: string;
  duration_seconds: number | null;
  sort_order?: number;
}

const categoryDto = (row: CategoryRow) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  imageUrl: row.image_url,
  tone: row.tone,
  sortOrder: row.sort_order,
});

const videoDto = (row: VideoRow, categoryIds: string[] = []) => ({
  id: row.id,
  categoryId: categoryIds[0] || "",
  categoryIds,
  youtubeVideoId: row.youtube_video_id,
  youtubeTitle: row.youtube_title,
  parentLabel: row.parent_label,
  thumbnailUrl: row.thumbnail_url,
  durationSeconds: row.duration_seconds,
  sortOrder: row.sort_order || 0,
});

export async function getPublicCategories(env: AppEnv) {
  const result = await env.DB.prepare(`
    SELECT id, name, icon, image_url, tone, sort_order
    FROM categories
    WHERE is_active = 1 AND archived_at IS NULL
    ORDER BY sort_order, id
  `).all<CategoryRow>();
  return json((result.results || []).map(categoryDto));
}

export async function getPublicCategoryVideos(env: AppEnv, categoryId: string) {
  const category = await env.DB.prepare(
    "SELECT id FROM categories WHERE id = ? AND is_active = 1 AND archived_at IS NULL",
  ).bind(categoryId).first();
  if (!category) throw new HttpError("找不到這個分類。", 404, "CATEGORY_NOT_FOUND");
  const result = await env.DB.prepare(`
    SELECT v.id, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.duration_seconds, cv.sort_order
    FROM category_videos cv
    JOIN videos v ON v.id = cv.video_id
    WHERE cv.category_id = ? AND v.is_active = 1 AND v.archived_at IS NULL
      AND v.availability_status = 'available'
    ORDER BY cv.sort_order, v.id
  `).bind(categoryId).all<VideoRow>();
  return json((result.results || []).map((row) => videoDto(row, [categoryId])));
}

export async function getPublicVideo(env: AppEnv, videoId: string) {
  const row = await env.DB.prepare(`
    SELECT v.id, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url, v.duration_seconds
    FROM videos v
    WHERE v.id = ? AND v.is_active = 1 AND v.archived_at IS NULL
      AND v.availability_status = 'available'
      AND EXISTS (
        SELECT 1 FROM category_videos cv JOIN categories c ON c.id = cv.category_id
        WHERE cv.video_id = v.id AND c.is_active = 1 AND c.archived_at IS NULL
      )
  `).bind(videoId).first<VideoRow>();
  if (!row) throw new HttpError("找不到這部影片。", 404, "VIDEO_NOT_FOUND");
  const memberships = await env.DB.prepare(`
    SELECT cv.category_id FROM category_videos cv JOIN categories c ON c.id = cv.category_id
    WHERE cv.video_id = ? AND c.is_active = 1 AND c.archived_at IS NULL
    ORDER BY c.sort_order
  `).bind(videoId).all<{ category_id: string }>();
  return json(videoDto(row, (memberships.results || []).map((item) => item.category_id)));
}

export async function getDeviceStatus(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, false);
  return json({ authorized: !!device, device });
}

async function requireActiveVideo(env: AppEnv, videoId: string) {
  const video = await env.DB.prepare(`
    SELECT id FROM videos WHERE id = ? AND is_active = 1 AND archived_at IS NULL
      AND availability_status = 'available'
      AND EXISTS (
        SELECT 1 FROM category_videos cv JOIN categories c ON c.id = cv.category_id
        WHERE cv.video_id = videos.id AND c.is_active = 1 AND c.archived_at IS NULL
      )
  `).bind(videoId).first();
  if (!video) throw new HttpError("這部影片目前不可記錄。", 404, "VIDEO_NOT_FOUND");
}

export async function startViewSession(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const videoId = text(body.videoId, "影片", 1, 120);
  const clientSessionId = text(body.clientSessionId, "裝置播放識別碼", 8, 100);
  await requireActiveVideo(env, videoId);
  await consumeRateLimit(env, await rateKey(env, "session", device!.id), 10, 60);
  const existing = await env.DB.prepare(
    "SELECT id FROM view_sessions WHERE client_session_id = ? AND child_device_id = ?",
  ).bind(clientSessionId, device!.id).first<{ id: string }>();
  if (existing) throw new HttpError("這個播放識別碼已使用。", 409, "DUPLICATE_CLIENT_SESSION");
  const id = crypto.randomUUID();
  const capability = randomToken();
  const capabilityHash = await tokenHash(capability, env);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO view_sessions (
      id, client_session_id, video_id, child_device_id, write_token_hash,
      played_seconds, last_position_seconds, started_at, updated_at, status, last_heartbeat_seq
    ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'active', 0)
  `).bind(id, clientSessionId, videoId, device!.id, capabilityHash, now, now).run();
  return json({ id, writeToken: capability, startedAt: now }, { status: 201 });
}

async function verifyCapability(
  env: AppEnv,
  sessionId: string,
  writeToken: string,
  deviceId: string,
) {
  const hash = await tokenHash(writeToken, env);
  const row = await env.DB.prepare(`
    SELECT id, video_id, status FROM view_sessions
    WHERE id = ? AND child_device_id = ? AND write_token_hash = ?
  `).bind(sessionId, deviceId, hash).first<{ id: string; video_id: string; status: string }>();
  if (!row) throw new HttpError("播放紀錄授權不正確。", 403, "INVALID_WRITE_TOKEN");
  return row;
}

export async function heartbeatViewSession(request: Request, env: AppEnv, sessionId: string) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const writeToken = text(body.writeToken, "播放授權", 20, 200);
  const heartbeatSeq = integer(body.heartbeatSeq, "Heartbeat 序號", 1, 1_000_000_000);
  const deltaSeconds = integer(body.deltaSeconds, "播放秒數", 0, 60);
  const positionSeconds = integer(body.positionSeconds, "影片位置", 0, 10_000_000);
  const status = body.status === "ended" ? "ended" : "active";
  const intervalStartedAt = typeof body.intervalStartedAt === "string" && !Number.isNaN(Date.parse(body.intervalStartedAt)) ? body.intervalStartedAt : null;
  const intervalEndedAt = typeof body.intervalEndedAt === "string" && !Number.isNaN(Date.parse(body.intervalEndedAt)) ? body.intervalEndedAt : null;
  const session = await verifyCapability(env, sessionId, writeToken, device!.id);
  if (session.status === "ended" && status !== "ended") throw new HttpError("播放紀錄已結束。", 409, "SESSION_ENDED");
  const duplicate = await env.DB.prepare(
    "SELECT 1 AS found FROM view_heartbeats WHERE view_session_id = ? AND heartbeat_seq = ?",
  ).bind(sessionId, heartbeatSeq).first();
  if (duplicate) {
    const aggregate = await env.DB.prepare(
      "SELECT played_seconds, last_position_seconds, last_heartbeat_seq, status FROM view_sessions WHERE id = ?",
    ).bind(sessionId).first();
    return json({ ok: true, aggregate, duplicate: true });
  }
  await consumeRateLimit(env, await rateKey(env, "heartbeat", `${device!.id}:${sessionId}`), 30, 60);
  const now = new Date().toISOString();
  const heartbeatId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO view_heartbeats (
        id, view_session_id, heartbeat_seq, delta_seconds, position_seconds,
        interval_started_at, interval_ended_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(heartbeatId, sessionId, heartbeatSeq, deltaSeconds, positionSeconds, intervalStartedAt, intervalEndedAt, now),
    env.DB.prepare(`
      UPDATE view_sessions SET
        played_seconds = COALESCE((SELECT SUM(delta_seconds) FROM view_heartbeats WHERE view_session_id = ?), 0),
        last_position_seconds = COALESCE((
          SELECT position_seconds FROM view_heartbeats WHERE view_session_id = ?
          ORDER BY heartbeat_seq DESC LIMIT 1
        ), last_position_seconds),
        last_heartbeat_seq = COALESCE((SELECT MAX(heartbeat_seq) FROM view_heartbeats WHERE view_session_id = ?), 0),
        last_heartbeat_at = ?, updated_at = ?,
        status = CASE WHEN ? = 'ended' THEN 'ended' ELSE status END,
        ended_at = CASE WHEN ? = 'ended' THEN COALESCE(ended_at, ?) ELSE ended_at END
      WHERE id = ?
    `).bind(sessionId, sessionId, sessionId, now, now, status, status, now, sessionId),
  ]);
  const aggregate = await env.DB.prepare(
    "SELECT played_seconds, last_position_seconds, last_heartbeat_seq, status FROM view_sessions WHERE id = ?",
  ).bind(sessionId).first();
  return json({ ok: true, aggregate });
}

export async function saveNote(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const videoId = text(body.videoId, "影片", 1, 120);
  const sessionId = text(body.viewSessionId, "播放紀錄", 1, 120);
  const writeToken = text(body.writeToken, "播放授權", 20, 200);
  const content = text(body.content, "想法", 1, 4000);
  const position = integer(body.videoPositionSeconds, "影片位置", 0, 10_000_000);
  await requireActiveVideo(env, videoId);
  const session = await verifyCapability(env, sessionId, writeToken, device!.id);
  if (session.video_id !== videoId) throw new HttpError("筆記與播放影片不一致。", 403, "SESSION_VIDEO_MISMATCH");
  await consumeRateLimit(env, await rateKey(env, "note", device!.id), 10, 60);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO notes (id, video_id, view_session_id, content, video_position_seconds, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, videoId, sessionId, content, position, now, now).run();
  return json({ id, createdAt: now }, { status: 201 });
}
