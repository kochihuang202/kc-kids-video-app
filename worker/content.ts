import { HttpError, integer, json, readJson, text } from "./http";
import { mediaDto } from "./media";
import { evaluateChildAccessState, getTodayPicks } from "./rules";
import { consumeRateLimit, getChildDevice, getOrCreateChildDevice, rateKey, randomToken, tokenHash } from "./security";
import type { AppEnv } from "./types";

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  image_url: string | null;
  tone: "sage" | "sky" | "apricot";
  sort_order: number;
  daily_limit_seconds?: number | null;
}

interface VideoRow {
  id: string;
  source: "youtube" | "self_hosted";
  youtube_video_id: string | null;
  youtube_title: string;
  parent_label: string;
  thumbnail_url: string;
  media_type: "video" | "audio" | null;
  media_path: string | null;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  sort_order?: number;
  last_position_seconds?: number | null;
}

const categoryDto = (row: CategoryRow) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  imageUrl: row.image_url,
  tone: row.tone,
  sortOrder: row.sort_order,
  dailyLimitSeconds: row.daily_limit_seconds ?? null,
});

const videoDto = (env: AppEnv, row: VideoRow, categoryIds: string[] = [], threshold = 0.9) => {
  const duration = row.duration_seconds || 0;
  const position = env.RECORDING_ENABLED === "false" ? 0 : row.last_position_seconds || 0;
  const isWatched = duration > 0 ? position / duration >= threshold : false;
  return {
    id: row.id,
    categoryId: categoryIds[0] || "",
    categoryIds,
    ...mediaDto(row, env),
    youtubeTitle: row.youtube_title,
    parentLabel: row.parent_label,
    durationSeconds: row.duration_seconds,
    sortOrder: row.sort_order || 0,
    lastPositionSeconds: position,
    isWatched,
  };
};

async function getCompletionThreshold(env: AppEnv): Promise<number> {
  try {
    const setting = await env.DB.prepare("SELECT value_json FROM settings WHERE key = 'playback'").first<{ value_json: string }>();
    if (setting?.value_json) {
      const parsed = JSON.parse(setting.value_json);
      if (typeof parsed.completionThreshold === "number") return parsed.completionThreshold;
    }
  } catch {}
  return 0.9;
}

export async function getPublicCategories(env: AppEnv) {
  const result = await env.DB.prepare(`
    SELECT id, name, icon, image_url, tone, sort_order, daily_limit_seconds
    FROM categories
    WHERE is_active = 1 AND archived_at IS NULL
    ORDER BY sort_order, id
  `).all<CategoryRow>();
  return json((result.results || []).map(categoryDto));
}

export async function getPublicCategoryVideos(request: Request, env: AppEnv, categoryId: string) {
  const category = await env.DB.prepare(
    "SELECT id FROM categories WHERE id = ? AND is_active = 1 AND archived_at IS NULL",
  ).bind(categoryId).first();
  if (!category) throw new HttpError("找不到這個分類。", 404, "CATEGORY_NOT_FOUND");

  const device = await getChildDevice(request, env, false);
  const threshold = await getCompletionThreshold(env);

  let query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path,
      v.duration_seconds, cv.sort_order,
      (
        SELECT vs.last_position_seconds
        FROM view_sessions vs
        WHERE vs.video_id = v.id ${device ? "AND vs.child_device_id = ?" : ""}
        ORDER BY vs.updated_at DESC LIMIT 1
      ) AS last_position_seconds
    FROM category_videos cv
    JOIN videos v ON v.id = cv.video_id
    WHERE cv.category_id = ? AND v.is_active = 1 AND v.archived_at IS NULL
      AND v.availability_status = 'available'
    ORDER BY cv.sort_order, v.id
  `;
  const params: unknown[] = [];
  if (device) params.push(device.id);
  params.push(categoryId);

  const result = await env.DB.prepare(query).bind(...params).all<VideoRow>();
  return json((result.results || []).map((row) => videoDto(env, row, [categoryId], threshold)));
}

export async function getPublicVideo(request: Request, env: AppEnv, videoId: string) {
  const device = await getChildDevice(request, env, false);
  const threshold = await getCompletionThreshold(env);

  let query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path, v.duration_seconds,
      (
        SELECT vs.last_position_seconds
        FROM view_sessions vs
        WHERE vs.video_id = v.id ${device ? "AND vs.child_device_id = ?" : ""}
        ORDER BY vs.updated_at DESC LIMIT 1
      ) AS last_position_seconds
    FROM videos v
    WHERE v.id = ? AND v.is_active = 1 AND v.archived_at IS NULL
      AND v.availability_status = 'available'
  `;
  const params: unknown[] = [];
  if (device) params.push(device.id);
  params.push(videoId);

  const video = await env.DB.prepare(query).bind(...params).first<VideoRow>();
  if (!video) throw new HttpError("找不到這部影片。", 404, "VIDEO_NOT_FOUND");

  const categories = await env.DB.prepare(
    "SELECT category_id FROM category_videos WHERE video_id = ? ORDER BY sort_order",
  ).bind(videoId).all<{ category_id: string }>();

  return json(videoDto(env, video, (categories.results || []).map((row) => row.category_id), threshold));
}

export async function getPublicResume(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, false);
  if (!device) return json({ resume: null });
  const threshold = await getCompletionThreshold(env);

  const query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path,
      v.duration_seconds, vs.last_position_seconds, vs.updated_at AS last_played_at
    FROM view_sessions vs
    JOIN videos v ON v.id = vs.video_id
    WHERE vs.child_device_id = ?
      AND v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
      AND vs.last_position_seconds > 0
      AND (v.duration_seconds IS NULL OR v.duration_seconds = 0 OR vs.last_position_seconds < (v.duration_seconds * ?))
      AND vs.played_seconds > 0
    ORDER BY vs.updated_at DESC
    LIMIT 1
  `;

  const row = await env.DB.prepare(query).bind(device.id, threshold).first<VideoRow & {
    last_position_seconds: number;
    last_played_at: string;
  }>();

  if (!row) return json({ resume: null });

  return json({
    resume: {
      videoId: row.id,
      ...mediaDto(row, env),
      youtubeTitle: row.youtube_title,
      parentLabel: row.parent_label,
      durationSeconds: row.duration_seconds,
      lastPositionSeconds: row.last_position_seconds,
      lastPlayedAt: row.last_played_at,
    },
  });
}

export async function getPublicRecents(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, false);
  if (!device) return json([]);
  const threshold = await getCompletionThreshold(env);

  const query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path,
      v.duration_seconds, MAX(vs.updated_at) AS last_played_at,
      (
        SELECT last_position_seconds FROM view_sessions
        WHERE video_id = v.id AND child_device_id = ?
        ORDER BY updated_at DESC LIMIT 1
      ) AS last_position_seconds
    FROM view_sessions vs
    JOIN videos v ON v.id = vs.video_id
    WHERE vs.child_device_id = ?
      AND v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
      AND vs.played_seconds > 0
    GROUP BY v.id
    ORDER BY last_played_at DESC
    LIMIT 10
  `;

  const rows = await env.DB.prepare(query).bind(device.id, device.id).all<VideoRow & {
    last_played_at: string;
    last_position_seconds: number | null;
  }>();

  const recents = (rows.results || []).map((row) => {
    const dur = row.duration_seconds || 0;
    const pos = row.last_position_seconds || 0;
    const isWatched = dur > 0 ? pos / dur >= threshold : false;
    return {
      id: row.id,
      ...mediaDto(row, env),
      youtubeTitle: row.youtube_title,
      parentLabel: row.parent_label,
      durationSeconds: row.duration_seconds,
      lastPositionSeconds: pos,
      isWatched,
      lastPlayedAt: row.last_played_at,
    };
  });

  return json(recents);
}

export async function getChildAccessState(request: Request, env: AppEnv) {
  const accessState = await evaluateChildAccessState(env);
  return json(accessState);
}

export async function getChildTodayPicks(request: Request, env: AppEnv) {
  return getTodayPicks(request, env);
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
  const accessState = await evaluateChildAccessState(env);

  if (accessState.state === "PAUSED_BY_PARENT") {
    throw new HttpError("今天先休息一下 🌱 等等再來看看。", 403, "PAUSED_BY_PARENT");
  }
  if (accessState.state === "OUTSIDE_WINDOW") {
    throw new HttpError(accessState.message, 403, "OUTSIDE_WINDOW");
  }
  if (accessState.state === "DAILY_LIMIT_REACHED" && accessState.remainingSeconds <= 0) {
    throw new HttpError("今天的影片時間到了 🌙 明天再來看看吧。", 403, "DAILY_LIMIT_REACHED");
  }

  const body = await readJson(request);
  const videoId = text(body.videoId, "影片", 1, 120);

  // Check category daily limits
  const catLinks = await env.DB.prepare("SELECT category_id FROM category_videos WHERE video_id = ?").bind(videoId).all<{ category_id: string }>();
  const videoCatIds = (catLinks.results || []).map((r) => r.category_id);
  if (videoCatIds.length > 0 && accessState.categoryStates) {
    const relevantStates = accessState.categoryStates.filter((cs) => videoCatIds.includes(cs.categoryId));
    const anyReached = relevantStates.some((cs) => cs.dailyLimitSeconds && cs.dailyLimitSeconds > 0 && cs.isReached);
    if (anyReached) {
      throw new HttpError("此分類今天的觀看時間到了 🌱", 403, "CATEGORY_LIMIT_REACHED");
    }
  }

  const clientSessionId = text(body.clientSessionId, "裝置播放識別碼", 8, 100);
  await requireActiveVideo(env, videoId);
  await consumeRateLimit(env, await rateKey(env, "session", device!.id), 20, 60);
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
  await consumeRateLimit(env, await rateKey(env, "note", device!.id), 20, 60);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO notes (id, video_id, view_session_id, content, video_position_seconds, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, videoId, sessionId, content, position, now, now).run();
  return json({ id, createdAt: now }, { status: 201 });
}
