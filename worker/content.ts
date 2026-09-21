import { boolean, HttpError, integer, json, readJson, text } from "./http";
import { mediaDto } from "./media";
import { evaluateChildAccessState, getTodayPicks, prepareDailyUsageRollupUpdates } from "./rules";
import { consumeRateLimit, getChildDevice, getOrCreateChildDevice, rateKey, randomToken, tokenHash } from "./security";
import type { AppEnv } from "./types";
import { playbackCompletionRatio } from "../shared/playbackRange";

const UNLIMITED_LEARNING_CATEGORY_IDS = new Set(["learning-favorites"]);
const FAVORITES_CATEGORY_ID = "learning-favorites";

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  image_url: string | null;
  tone: "sage" | "sky" | "apricot";
  sort_order: number;
  daily_limit_seconds?: number | null;
  series_type: "learning" | "leisure";
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
  playback_start_seconds: number | null;
  playback_end_seconds: number | null;
  sort_order?: number;
  last_position_seconds?: number | null;
  last_played_at?: string | null;
  playback_mode?: "video" | "listen" | null;
  is_learned?: number | null;
  learned_at?: string | null;
  is_favorite?: number | null;
}

const categoryDto = (row: CategoryRow) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  imageUrl: row.image_url,
  tone: row.tone,
  sortOrder: row.sort_order,
  dailyLimitSeconds: row.daily_limit_seconds ?? null,
  seriesType: row.series_type,
});

const videoDto = (
  env: AppEnv,
  row: VideoRow,
  categoryIds: string[] = [],
  threshold = 0.9,
  options: { isLearned?: boolean; learnedAt?: string | null; isSelectable?: boolean; isFavorite?: boolean; seriesType?: "learning" | "leisure" } = {},
) => {
  const position = env.RECORDING_ENABLED === "false" ? 0 : row.last_position_seconds || 0;
  const isWatched = playbackCompletionRatio({
    durationSeconds: row.duration_seconds,
    playbackStartSeconds: row.playback_start_seconds,
    playbackEndSeconds: row.playback_end_seconds,
  }, position) >= threshold;
  return {
    id: row.id,
    categoryId: categoryIds[0] || "",
    categoryIds,
    ...mediaDto(row, env),
    youtubeTitle: row.youtube_title,
    parentLabel: row.parent_label,
    durationSeconds: row.duration_seconds,
    playbackStartSeconds: row.playback_start_seconds || 0,
    playbackEndSeconds: row.playback_end_seconds,
    sortOrder: row.sort_order || 0,
    lastPositionSeconds: position,
    lastPlayedAt: row.last_played_at || null,
    isWatched,
    isLearned: options.isLearned ?? false,
    learnedAt: options.learnedAt ?? null,
    isSelectable: options.isSelectable ?? true,
    isFavorite: options.isFavorite ?? false,
    seriesType: options.seriesType,
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

async function getVideoSeriesState(env: AppEnv, videoId: string) {
  const categories = await env.DB.prepare(`
    SELECT c.id, c.series_type, cv.sort_order,
      COALESCE((SELECT is_learned FROM video_learned_state ls WHERE ls.video_id = cv.video_id), 0) AS is_learned,
      (SELECT learned_at FROM video_learned_state ls WHERE ls.video_id = cv.video_id) AS learned_at
    FROM category_videos cv
    JOIN categories c ON c.id = cv.category_id
    WHERE cv.video_id = ? AND c.is_active = 1 AND c.archived_at IS NULL
    ORDER BY c.sort_order, c.id
  `).bind(videoId).all<{ id: string; series_type: "learning" | "leisure"; sort_order: number; is_learned: number; learned_at: string | null }>();
  const rows = categories.results || [];
  if (!rows.length) throw new HttpError("這部影片目前沒有可用分類。", 404, "VIDEO_NOT_FOUND");
  const types = new Set(rows.map((row) => row.series_type));
  if (types.size !== 1) throw new HttpError("影片的學習／休閒分類設定衝突。", 409, "SERIES_TYPE_CONFLICT");

  const isLearned = rows[0].is_learned === 1;
  let isSelectable = true;
  if (rows[0].series_type === "learning" && !isLearned) {
    // A video can belong to more than one learning category (for example,
    // its course and 「我最喜歡」). It is available when at least one of
    // those categories currently exposes it in that category's first five.
    isSelectable = false;
    for (const category of rows) {
      if (UNLIMITED_LEARNING_CATEGORY_IDS.has(category.id)) {
        isSelectable = true;
        break;
      }
      const rank = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM category_videos before
        JOIN videos preceding_video ON preceding_video.id = before.video_id
        LEFT JOIN video_learned_state ls ON ls.video_id = before.video_id
        WHERE before.category_id = ? AND before.sort_order < ?
          AND preceding_video.is_active = 1 AND preceding_video.archived_at IS NULL
          AND preceding_video.availability_status = 'available'
          AND COALESCE(ls.is_learned, 0) = 0
      `).bind(category.id, category.sort_order).first<{ count: number }>();
      if ((rank?.count || 0) < 5) {
        isSelectable = true;
        break;
      }
    }
  }
  return {
    categoryIds: rows.map((row) => row.id),
    seriesType: rows[0].series_type,
    isLearned,
    learnedAt: isLearned ? rows[0].learned_at : null,
    isSelectable,
    isFavorite: rows.some((row) => row.id === FAVORITES_CATEGORY_ID),
  };
}

export async function getPublicCategories(env: AppEnv) {
  const result = await env.DB.prepare(`
    SELECT id, name, icon, image_url, tone, sort_order, daily_limit_seconds, series_type
    FROM categories
    WHERE is_active = 1 AND archived_at IS NULL
    ORDER BY sort_order, id
  `).all<CategoryRow>();
  return json((result.results || []).map(categoryDto));
}

export async function getPublicCategoryVideos(request: Request, env: AppEnv, categoryId: string) {
  const category = await env.DB.prepare(
    "SELECT id, series_type FROM categories WHERE id = ? AND is_active = 1 AND archived_at IS NULL",
  ).bind(categoryId).first<{ id: string; series_type: "learning" | "leisure" }>();
  if (!category) throw new HttpError("找不到這個分類。", 404, "CATEGORY_NOT_FOUND");

  const device = await getChildDevice(request, env, false);
  const threshold = await getCompletionThreshold(env);

  const learnedColumn = device
    ? "COALESCE((SELECT is_learned FROM video_learned_state ls WHERE ls.video_id = v.id), 0)"
    : "0";
  const learnedAtColumn = device
    ? "(SELECT learned_at FROM video_learned_state ls WHERE ls.video_id = v.id)"
    : "NULL";
  const progressColumn = device
    ? `(SELECT vs.last_position_seconds FROM view_sessions vs
        WHERE vs.video_id = v.id ORDER BY vs.updated_at DESC LIMIT 1)`
    : "NULL";
  const lastPlayedAtColumn = device
    ? `(SELECT vs.updated_at FROM view_sessions vs
        WHERE vs.video_id = v.id ORDER BY vs.updated_at DESC LIMIT 1)`
    : "NULL";
  const query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path,
      v.duration_seconds, v.playback_start_seconds, v.playback_end_seconds, cv.sort_order,
      ${learnedColumn} AS is_learned,
      ${learnedAtColumn} AS learned_at,
      EXISTS (
        SELECT 1 FROM category_videos favorite_cv
        WHERE favorite_cv.video_id = v.id AND favorite_cv.category_id = '${FAVORITES_CATEGORY_ID}'
      ) AS is_favorite,
      ${progressColumn} AS last_position_seconds,
      ${lastPlayedAtColumn} AS last_played_at
    FROM category_videos cv
    JOIN videos v ON v.id = cv.video_id
    WHERE cv.category_id = ? AND v.is_active = 1 AND v.archived_at IS NULL
      AND v.availability_status = 'available'
    ORDER BY ${category.id === FAVORITES_CATEGORY_ID ? "cv.sort_order, v.id" : "is_learned ASC, cv.sort_order, v.id"}
  `;
  const result = await env.DB.prepare(query).bind(categoryId).all<VideoRow>();
  let unlearnedIndex = 0;
  return json((result.results || []).map((row) => {
    const isLearned = !!device && row.is_learned === 1;
    const isSelectable = category.series_type !== "learning"
      || UNLIMITED_LEARNING_CATEGORY_IDS.has(category.id)
      || isLearned
      || unlearnedIndex++ < 5;
    return videoDto(env, row, [categoryId], threshold, {
      isLearned,
      learnedAt: isLearned ? row.learned_at : null,
      isSelectable,
      isFavorite: row.is_favorite === 1,
      seriesType: category.series_type,
    });
  }));
}

export async function getPublicVideo(request: Request, env: AppEnv, videoId: string) {
  await getChildDevice(request, env, true);
  const threshold = await getCompletionThreshold(env);

  const query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path, v.duration_seconds,
      v.playback_start_seconds, v.playback_end_seconds,
      COALESCE((SELECT is_learned FROM video_learned_state ls WHERE ls.video_id = v.id), 0) AS is_learned,
      (SELECT learned_at FROM video_learned_state ls WHERE ls.video_id = v.id) AS learned_at,
      EXISTS (
        SELECT 1 FROM category_videos favorite_cv
        WHERE favorite_cv.video_id = v.id AND favorite_cv.category_id = '${FAVORITES_CATEGORY_ID}'
      ) AS is_favorite,
      (
        SELECT vs.last_position_seconds
        FROM view_sessions vs
        WHERE vs.video_id = v.id
        ORDER BY vs.updated_at DESC LIMIT 1
      ) AS last_position_seconds
    FROM videos v
    WHERE v.id = ? AND v.is_active = 1 AND v.archived_at IS NULL
      AND v.availability_status = 'available'
  `;
  const video = await env.DB.prepare(query).bind(videoId).first<VideoRow>();
  if (!video) throw new HttpError("找不到這部影片。", 404, "VIDEO_NOT_FOUND");

  const series = await getVideoSeriesState(env, videoId);
  if (!series.isSelectable) throw new HttpError("請先從前五部學習影片中選擇。", 403, "LEARNING_VIDEO_LOCKED");
  return json(videoDto(env, video, series.categoryIds, threshold, {
    isLearned: series.isLearned,
    learnedAt: series.learnedAt,
    isSelectable: series.isSelectable,
    isFavorite: series.isFavorite,
    seriesType: series.seriesType,
  }));
}

export async function getPublicResume(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, false);
  if (!device) return json({ resume: null });
  const threshold = await getCompletionThreshold(env);

  const query = `
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path,
      v.duration_seconds, v.playback_start_seconds, v.playback_end_seconds,
      vs.last_position_seconds, vs.updated_at AS last_played_at,
      COALESCE(vs.playback_mode, 'video') AS playback_mode
    FROM view_sessions vs
    JOIN videos v ON v.id = vs.video_id
    WHERE v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
      AND vs.last_position_seconds > COALESCE(v.playback_start_seconds, 0)
      AND (COALESCE(v.playback_end_seconds, v.duration_seconds) IS NULL
        OR COALESCE(v.playback_end_seconds, v.duration_seconds) = 0
        OR vs.last_position_seconds < (COALESCE(v.playback_start_seconds, 0)
          + ((COALESCE(v.playback_end_seconds, v.duration_seconds) - COALESCE(v.playback_start_seconds, 0)) * ?)))
      AND vs.played_seconds > 0
    ORDER BY vs.updated_at DESC
    LIMIT 1
  `;

  const row = await env.DB.prepare(query).bind(threshold).first<VideoRow & {
    last_position_seconds: number;
    last_played_at: string;
    playback_mode: "video" | "listen";
  }>();

  if (!row) return json({ resume: null });

  return json({
    resume: {
      videoId: row.id,
      ...mediaDto(row, env),
      youtubeTitle: row.youtube_title,
      parentLabel: row.parent_label,
      durationSeconds: row.duration_seconds,
      playbackStartSeconds: row.playback_start_seconds || 0,
      playbackEndSeconds: row.playback_end_seconds,
      lastPositionSeconds: row.last_position_seconds,
      lastPlayedAt: row.last_played_at,
      playbackMode: row.playback_mode,
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
      v.duration_seconds, v.playback_start_seconds, v.playback_end_seconds, MAX(vs.updated_at) AS last_played_at,
      (
        SELECT last_position_seconds FROM view_sessions
        WHERE video_id = v.id AND played_seconds > 0
        ORDER BY updated_at DESC LIMIT 1
      ) AS last_position_seconds,
      (
        SELECT COALESCE(playback_mode, 'video') FROM view_sessions
        WHERE video_id = v.id AND played_seconds > 0
        ORDER BY updated_at DESC LIMIT 1
      ) AS playback_mode
    FROM view_sessions vs
    JOIN videos v ON v.id = vs.video_id
    WHERE v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
      AND vs.played_seconds > 0
    GROUP BY v.id
    ORDER BY last_played_at DESC
    LIMIT 10
  `;

  const rows = await env.DB.prepare(query).all<VideoRow & {
    last_played_at: string;
    last_position_seconds: number | null;
    playback_mode: "video" | "listen";
  }>();

  const offlineRows = await env.DB.prepare(`
    SELECT v.id, v.source, v.youtube_video_id, v.youtube_title, v.parent_label, v.thumbnail_url,
      v.media_type, v.media_path, v.thumbnail_path, v.duration_seconds,
      v.playback_start_seconds, v.playback_end_seconds,
      ov.last_seen_at AS last_played_at, ov.playback_mode
    FROM offline_video_views ov
    JOIN videos v ON v.id = ov.video_id
    WHERE ov.child_device_id = ?
      AND v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
    ORDER BY ov.last_seen_at DESC
    LIMIT 10
  `).bind(device.id).all<VideoRow & {
    last_played_at: string;
    playback_mode: "video" | "listen";
  }>();

  const sessionRecents = (rows.results || []).map((row) => {
    const pos = row.last_position_seconds || 0;
    const isWatched = playbackCompletionRatio({ durationSeconds: row.duration_seconds, playbackStartSeconds: row.playback_start_seconds, playbackEndSeconds: row.playback_end_seconds }, pos) >= threshold;
    return {
      id: row.id,
      ...mediaDto(row, env),
      youtubeTitle: row.youtube_title,
      parentLabel: row.parent_label,
      durationSeconds: row.duration_seconds,
      playbackStartSeconds: row.playback_start_seconds || 0,
      playbackEndSeconds: row.playback_end_seconds,
      lastPositionSeconds: pos,
      isWatched,
      lastPlayedAt: row.last_played_at,
      playbackMode: row.playback_mode,
      offlineViewed: false,
    };
  });

  const markerRecents = (offlineRows.results || []).map((row) => ({
    id: row.id,
    ...mediaDto(row, env),
    youtubeTitle: row.youtube_title,
    parentLabel: row.parent_label,
    durationSeconds: row.duration_seconds,
    playbackStartSeconds: row.playback_start_seconds || 0,
    playbackEndSeconds: row.playback_end_seconds,
    lastPositionSeconds: 0,
    isWatched: false,
    lastPlayedAt: row.last_played_at,
    playbackMode: row.playback_mode,
    offlineViewed: true,
  }));
  const recents = [...sessionRecents, ...markerRecents]
    .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 10);

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

export async function syncOfflineVideoViews(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw new HttpError("離線觀看資料格式不正確。", 400, "INVALID_OFFLINE_VIEWS");
  }
  await consumeRateLimit(env, await rateKey(env, "offline-views", device!.id), 20, 60);
  const now = new Date().toISOString();
  const statements = body.items.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError("離線觀看資料格式不正確。", 400, "INVALID_OFFLINE_VIEW");
    const item = raw as Record<string, unknown>;
    const videoId = text(item.videoId, "影片", 1, 120);
    const playbackMode = item.playbackMode === "listen" ? "listen" : "video";
    const seenAt = text(item.seenAt, "觀看時間", 20, 40);
    const parsed = Date.parse(seenAt);
    if (!Number.isFinite(parsed) || parsed > Date.now() + 5 * 60_000 || parsed < Date.now() - 366 * 86400_000) {
      throw new HttpError("離線觀看時間不正確。", 400, "INVALID_OFFLINE_VIEW_TIME");
    }
    return env.DB.prepare(`
      INSERT INTO offline_video_views (
        child_device_id, video_id, playback_mode, first_seen_at, last_seen_at, synced_at
      )
      SELECT ?, v.id, ?, ?, ?, ? FROM videos v
      WHERE v.id = ? AND v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
      ON CONFLICT(child_device_id, video_id) DO UPDATE SET
        playback_mode = CASE
          WHEN excluded.last_seen_at >= offline_video_views.last_seen_at THEN excluded.playback_mode
          ELSE offline_video_views.playback_mode
        END,
        first_seen_at = MIN(offline_video_views.first_seen_at, excluded.first_seen_at),
        last_seen_at = MAX(offline_video_views.last_seen_at, excluded.last_seen_at),
        synced_at = excluded.synced_at
    `).bind(device!.id, playbackMode, seenAt, seenAt, now, videoId);
  });
  const results = await env.DB.batch(statements);
  const synced = results.reduce((total, result) => total + (result.meta.changes || 0), 0);
  return json({ ok: true, synced });
}

export async function updateLearnedState(request: Request, env: AppEnv, videoId: string) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const learned = boolean(body.learned, "學會狀態");
  await requireActiveVideo(env, videoId);
  await consumeRateLimit(env, await rateKey(env, "learned", device!.id), 30, 60);
  const now = new Date().toISOString();
  if (learned) {
    await env.DB.prepare(`
      INSERT INTO video_learned_state (video_id, is_learned, learned_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET is_learned = 1, learned_at = excluded.learned_at, updated_at = excluded.updated_at
    `).bind(videoId, now, now).run();
  } else {
    await env.DB.prepare("DELETE FROM video_learned_state WHERE video_id = ?").bind(videoId).run();
  }
  return json({ ok: true, videoId, isLearned: learned, learnedAt: learned ? now : null });
}

export async function updateFavoriteState(request: Request, env: AppEnv, videoId: string) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const favorite = boolean(body.favorite, "收藏狀態");
  const video = await requireActiveVideo(env, videoId);
  if (video.seriesType !== "learning") {
    throw new HttpError("目前只有學習系列可以加入我最喜歡。", 409, "FAVORITE_SERIES_CONFLICT");
  }
  await consumeRateLimit(env, await rateKey(env, "favorite", device!.id), 30, 60);

  if (favorite) {
    const category = await env.DB.prepare(`
      SELECT id FROM categories
      WHERE id = ? AND is_active = 1 AND archived_at IS NULL AND series_type = 'learning'
    `).bind(FAVORITES_CATEGORY_ID).first<{ id: string }>();
    if (!category) throw new HttpError("找不到我最喜歡分類。", 409, "FAVORITES_CATEGORY_MISSING");
    await env.DB.prepare(`
      INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
      VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM category_videos WHERE category_id = ?), ?)
      ON CONFLICT(category_id, video_id) DO NOTHING
    `).bind(FAVORITES_CATEGORY_ID, videoId, FAVORITES_CATEGORY_ID, new Date().toISOString()).run();
  } else {
    await env.DB.prepare(
      "DELETE FROM category_videos WHERE category_id = ? AND video_id = ?",
    ).bind(FAVORITES_CATEGORY_ID, videoId).run();
  }
  return json({ ok: true, videoId, isFavorite: favorite });
}

async function requireActiveVideo(env: AppEnv, videoId: string) {
  const video = await env.DB.prepare(`
    SELECT id, source, media_type FROM videos WHERE id = ? AND is_active = 1 AND archived_at IS NULL
      AND availability_status = 'available'
      AND EXISTS (
        SELECT 1 FROM category_videos cv JOIN categories c ON c.id = cv.category_id
        WHERE cv.video_id = videos.id AND c.is_active = 1 AND c.archived_at IS NULL
      )
  `).bind(videoId).first<{ id: string; source: "youtube" | "self_hosted"; media_type: "video" | "audio" | null }>();
  if (!video) throw new HttpError("這部影片目前不可記錄。", 404, "VIDEO_NOT_FOUND");
  const series = await getVideoSeriesState(env, videoId);
  return { ...video, ...series };
}

export async function startViewSession(request: Request, env: AppEnv) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const videoId = text(body.videoId, "影片", 1, 120);
  const playbackMode = body.playbackMode === "listen" ? "listen" : "video";
  const activeVideo = await requireActiveVideo(env, videoId);
  if (!activeVideo.isSelectable) {
    throw new HttpError("請先從前五部學習影片中選擇。", 403, "LEARNING_VIDEO_LOCKED");
  }
  const accessState = await evaluateChildAccessState(env);

  if (accessState.state === "PAUSED_BY_PARENT") {
    throw new HttpError("今天先休息一下 🌱 等等再來看看。", 403, "PAUSED_BY_PARENT");
  }
  if (accessState.state === "OUTSIDE_WINDOW") {
    throw new HttpError(accessState.message, 403, "OUTSIDE_WINDOW");
  }
  if (playbackMode === "video" && accessState.categoryStates?.some(
    (category) => activeVideo.categoryIds.includes(category.categoryId) && category.isReached,
  )) {
    throw new HttpError("這個系列今天的觀看時間到了，仍可使用純聽。", 403, "CATEGORY_DAILY_LIMIT_REACHED");
  }
  if (activeVideo.seriesType === "leisure" && playbackMode === "video" && accessState.remainingSeconds <= 0) {
    throw new HttpError("今天的影片時間到了 🌙 明天再來看看吧。", 403, "DAILY_LIMIT_REACHED");
  }

  const clientSessionId = text(body.clientSessionId, "裝置播放識別碼", 8, 100);
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
      played_seconds, last_position_seconds, started_at, updated_at, status, last_heartbeat_seq,
      playback_mode, series_type_snapshot
    ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'active', 0, ?, ?)
  `).bind(id, clientSessionId, videoId, device!.id, capabilityHash, now, now, playbackMode, activeVideo.seriesType).run();
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
    SELECT id, video_id, status, playback_mode, series_type_snapshot FROM view_sessions
    WHERE id = ? AND child_device_id = ? AND write_token_hash = ?
  `).bind(sessionId, deviceId, hash).first<{
    id: string; video_id: string; status: string;
    playback_mode: "video" | "listen"; series_type_snapshot: "learning" | "leisure" | null;
  }>();
  if (!row) throw new HttpError("播放紀錄授權不正確。", 403, "INVALID_WRITE_TOKEN");
  return row;
}

export async function heartbeatViewSession(request: Request, env: AppEnv, sessionId: string) {
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const writeToken = text(body.writeToken, "播放授權", 20, 200);
  const heartbeatSeq = integer(body.heartbeatSeq, "Heartbeat 序號", 1, 1_000_000_000);
  let deltaSeconds = integer(body.deltaSeconds, "播放秒數", 0, 60);
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
  const accessState = await evaluateChildAccessState(env);
  const closingWithoutPlayback = status === "ended" && deltaSeconds === 0;
  if (accessState.state === "PAUSED_BY_PARENT" && !closingWithoutPlayback) throw new HttpError(accessState.message, 403, "PAUSED_BY_PARENT");
  if (accessState.state === "OUTSIDE_WINDOW" && !closingWithoutPlayback) throw new HttpError(accessState.message, 403, "OUTSIDE_WINDOW");
  if (session.playback_mode === "video") {
    const sessionCategories = await env.DB.prepare(
      "SELECT category_id FROM category_videos WHERE video_id = ?",
    ).bind(session.video_id).all<{ category_id: string }>();
    const categoryIds = new Set((sessionCategories.results || []).map((row) => row.category_id));
    const limitedStates = (accessState.categoryStates || []).filter(
      (category) => categoryIds.has(category.categoryId) && category.remainingSeconds !== null,
    );
    if (limitedStates.some((category) => category.isReached) && !closingWithoutPlayback) {
      throw new HttpError("這個系列今天的觀看時間到了。", 403, "CATEGORY_DAILY_LIMIT_REACHED");
    }
    if (limitedStates.length) {
      deltaSeconds = Math.min(deltaSeconds, ...limitedStates.map((category) => category.remainingSeconds || 0));
    }
  }
  if (session.playback_mode === "video" && session.series_type_snapshot === "leisure") {
    if (accessState.remainingSeconds <= 0 && !closingWithoutPlayback) throw new HttpError("今天的休閒時間到了。", 403, "DAILY_LIMIT_REACHED");
    deltaSeconds = Math.min(deltaSeconds, accessState.remainingSeconds);
  }
  await consumeRateLimit(env, await rateKey(env, "heartbeat", `${device!.id}:${sessionId}`), 30, 60);
  const now = new Date().toISOString();
  const heartbeatId = crypto.randomUUID();
  const rollupUpdates = await prepareDailyUsageRollupUpdates(env, {
    viewSessionId: sessionId,
    videoId: session.video_id,
    deltaSeconds,
    intervalStartedAt,
    intervalEndedAt,
    receivedAt: now,
    playbackMode: session.playback_mode,
    seriesType: session.series_type_snapshot,
  });
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
    ...rollupUpdates,
  ]);
  const aggregate = await env.DB.prepare(
    "SELECT played_seconds, last_position_seconds, last_heartbeat_seq, status FROM view_sessions WHERE id = ?",
  ).bind(sessionId).first();
  return json({ ok: true, aggregate, accessState: await evaluateChildAccessState(env) });
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
