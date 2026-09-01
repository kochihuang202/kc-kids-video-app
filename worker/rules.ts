import { HttpError, integer, json, readJson, text } from "./http";
import { mediaDto, type MediaColumns } from "./media";
import type { AppEnv } from "./types";

const TIME_ZONE = "Asia/Taipei";

export function getDayRangeInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export interface AllowedWindowRow {
  id: string;
  usage_rule_id: "weekday" | "weekend";
  start_time: string;
  end_time: string;
  sort_order: number;
  is_active: number;
}

export interface UsageRuleRow {
  id: "weekday" | "weekend";
  day_type: "weekday" | "weekend";
  daily_limit_seconds: number;
  grace_period_seconds: number;
  is_active: number;
}

export interface DailyOverrideRow {
  id: string;
  date: string;
  bonus_seconds: number;
  limit_override_seconds: number | null;
  is_paused: number;
}

export function getTaipeiDateParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;
  const dateStr = `${year}-${month}-${day}`;
  const weekday = partMap.weekday; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const dayType: "weekday" | "weekend" = isWeekend ? "weekend" : "weekday";
  const currentHHmm = `${partMap.hour}:${partMap.minute}`;

  return { dateStr, dayType, currentHHmm };
}

function formatFriendlyTime(hhmm: string) {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  const period = h < 12 ? "上午" : (h === 12 ? "中午" : "下午");
  const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return m === 0 ? `${period} ${displayH}:00` : `${period} ${displayH}:${mStr}`;
}

function formatGentleRemaining(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return "今天的休閒時間到了，學習和純聽仍可使用 🌙";
  if (minutes <= 5) return "今天的休閒時間快到了 🌱";
  if (minutes <= 12) return `今天大約還有 ${minutes} 分鐘休閒時間`;
  return `今天還有約 ${minutes} 分鐘休閒時間`;
}

interface UsageSession {
  id: string;
  video_id: string;
  played_seconds: number;
  started_at: string;
  playback_mode: "video" | "listen";
  series_type_snapshot: "learning" | "leisure" | null;
}

interface UsageHeartbeat {
  view_session_id: string;
  delta_seconds: number;
  interval_started_at: string | null;
  interval_ended_at: string | null;
  received_at: string;
}

/** Counts at most one second of activity per wall-clock second for the single child. */
export function calculateSharedUsage(
  sessions: UsageSession[],
  heartbeats: UsageHeartbeat[],
  range: { start: string; end: string },
) {
  const rangeStart = Date.parse(range.start);
  const rangeEnd = Date.parse(range.end);
  const slotCount = Math.max(1, Math.ceil((rangeEnd - rangeStart) / 1000));
  const leisure = new Uint8Array(slotCount);
  const learning = new Uint8Array(slotCount);
  const listen = new Uint8Array(slotCount);
  const all = new Uint8Array(slotCount);
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));

  for (const heartbeat of heartbeats) {
    const session = sessionMap.get(heartbeat.view_session_id);
    if (!session || heartbeat.delta_seconds <= 0) continue;
    const rawEnd = heartbeat.interval_ended_at ? Date.parse(heartbeat.interval_ended_at) : Date.parse(heartbeat.received_at);
    const rawStart = heartbeat.interval_started_at
      ? Date.parse(heartbeat.interval_started_at)
      : rawEnd - heartbeat.delta_seconds * 1000;
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const from = Math.max(rangeStart, Math.min(rawStart, rawEnd));
    const to = Math.min(rangeEnd, Math.max(rawStart, rawEnd));
    if (to <= from) continue;
    const firstSlot = Math.max(0, Math.floor((from - rangeStart) / 1000));
    const availableSlots = Math.max(1, Math.ceil((to - from) / 1000));
    const secondsToMark = Math.min(heartbeat.delta_seconds, availableSlots, slotCount - firstSlot);
    for (let index = 0; index < secondsToMark; index += 1) {
      const slot = firstSlot + index;
      all[slot] = 1;
      if (session.playback_mode !== "video") {
        listen[slot] = 1;
        continue;
      }
      if (session.series_type_snapshot === "learning") learning[slot] = 1;
      else leisure[slot] = 1;
    }
  }

  let leisureUsedSeconds = 0;
  let learningSeconds = 0;
  let listenSeconds = 0;
  let totalPlayedSeconds = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if (all[index]) totalPlayedSeconds += 1;
    if (leisure[index]) leisureUsedSeconds += 1;
    else if (learning[index]) learningSeconds += 1;
    else if (listen[index]) listenSeconds += 1;
  }
  return { leisureUsedSeconds, learningSeconds, listenSeconds, totalPlayedSeconds };
}

export async function evaluateChildAccessState(env: AppEnv, targetDate: Date = new Date()) {
  const { dateStr, dayType, currentHHmm } = getTaipeiDateParts(targetDate);
  const dayRange = getDayRangeInTimeZone(TIME_ZONE, targetDate);

  // 1. Load active rule & windows for current dayType
  let rule = await env.DB.prepare(
    "SELECT id, day_type, daily_limit_seconds, grace_period_seconds, is_active FROM usage_rules WHERE id = ?",
  ).bind(dayType).first<UsageRuleRow>();

  if (!rule) {
    // Default fallback if not initialized
    rule = {
      id: dayType,
      day_type: dayType,
      daily_limit_seconds: dayType === "weekend" ? 3600 : 2400,
      grace_period_seconds: 300,
      is_active: 1,
    };
  }

  const windowsResult = await env.DB.prepare(
    "SELECT id, usage_rule_id, start_time, end_time, sort_order, is_active FROM allowed_windows WHERE usage_rule_id = ? AND is_active = 1 ORDER BY sort_order, start_time",
  ).bind(dayType).all<AllowedWindowRow>();
  const windows = windowsResult.results || [];

  // 2. Load daily override
  const override = await env.DB.prepare(
    "SELECT id, date, bonus_seconds, limit_override_seconds, is_paused FROM daily_overrides WHERE date = ?",
  ).bind(dateStr).first<DailyOverrideRow>();

  // Recording can be disabled while reminder rules continue to work from device-local time.
  let sessions: UsageSession[] = [];
  if (env.RECORDING_ENABLED !== "false") {
    const sessionsResult = await env.DB.prepare(`
      SELECT id, video_id, played_seconds, started_at, updated_at, ended_at,
        COALESCE(playback_mode, 'video') AS playback_mode, series_type_snapshot
      FROM view_sessions
      WHERE started_at < ? AND COALESCE(ended_at, updated_at) >= ?
    `).bind(dayRange.end, dayRange.start).all<UsageSession>();
    sessions = sessionsResult.results || [];
  }

  let heartbeats: UsageHeartbeat[] = [];

  if (sessions.length) {
    const heartbeatsResult = await env.DB.prepare(`
      SELECT view_session_id, delta_seconds, interval_started_at, interval_ended_at, received_at
      FROM view_heartbeats
      WHERE (interval_started_at IS NOT NULL AND interval_started_at < ? AND interval_ended_at >= ?)
        OR (interval_started_at IS NULL AND received_at >= ? AND received_at < ?)
    `).bind(dayRange.end, dayRange.start, dayRange.start, dayRange.end).all<UsageHeartbeat>();
    heartbeats = heartbeatsResult.results || [];
  }

  const sharedUsage = calculateSharedUsage(sessions, heartbeats, dayRange);
  const todayPlayedSeconds = sharedUsage.totalPlayedSeconds;

  // Calculate Category-specific played seconds and limits
  const categoriesResult = await env.DB.prepare(`
    SELECT id, name, icon, tone, daily_limit_seconds
    FROM categories
    WHERE is_active = 1 AND archived_at IS NULL
    ORDER BY sort_order, id
  `).all<{ id: string; name: string; icon: string; tone: "sage" | "sky" | "apricot"; daily_limit_seconds: number | null }>();
  const activeCategories = categoriesResult.results || [];

  const catVideosResult = await env.DB.prepare(`
    SELECT category_id, video_id
    FROM category_videos
  `).all<{ category_id: string; video_id: string }>();
  const catVideos = catVideosResult.results || [];

  const sessionSecondsMap = new Map<string, number>();
  if (sessions.length) {
    for (const session of sessions) {
      const matching = heartbeats.filter((hb) => hb.view_session_id === session.id);
      let sec = 0;
      if (matching.length) {
        sec = matching.reduce((sum, hb) => {
          if (!hb.interval_started_at || !hb.interval_ended_at) {
            return hb.received_at >= dayRange.start && hb.received_at < dayRange.end ? sum + hb.delta_seconds : sum;
          }
          const from = Date.parse(hb.interval_started_at);
          const to = Date.parse(hb.interval_ended_at);
          if (to <= from) {
            return from >= Date.parse(dayRange.start) && from < Date.parse(dayRange.end) ? sum + hb.delta_seconds : sum;
          }
          const overlap = Math.max(0, Math.min(to, Date.parse(dayRange.end)) - Math.max(from, Date.parse(dayRange.start)));
          const full = Math.max(1, to - from);
          return sum + Math.round(hb.delta_seconds * Math.min(1, overlap / full));
        }, 0);
      } else if (session.started_at >= dayRange.start && session.started_at < dayRange.end) {
        sec = session.played_seconds;
      }
      sessionSecondsMap.set(session.id, sec);
    }
  }

  const categoryPlayedMap = new Map<string, number>();
  for (const session of sessions) {
    const sec = sessionSecondsMap.get(session.id) || 0;
    if (sec <= 0) continue;
    const mappedCatIds = catVideos.filter((cv) => cv.video_id === (session as any).video_id).map((cv) => cv.category_id);
    for (const catId of mappedCatIds) {
      categoryPlayedMap.set(catId, (categoryPlayedMap.get(catId) || 0) + sec);
    }
  }

  const categoryStates = activeCategories.map((c) => {
    const played = categoryPlayedMap.get(c.id) || 0;
    const limit = c.daily_limit_seconds;
    const remaining = (limit !== null && limit !== undefined && limit > 0) ? Math.max(0, limit - played) : null;
    const isReached = limit !== null && limit !== undefined && limit > 0 ? remaining === 0 : false;
    return {
      categoryId: c.id,
      name: c.name,
      icon: c.icon,
      tone: c.tone,
      dailyLimitSeconds: limit || null,
      todayPlayedSeconds: played,
      remainingSeconds: remaining,
      isReached,
    };
  });

  const bonusSeconds = override?.bonus_seconds ?? 0;
  const baseLimitSeconds = override?.limit_override_seconds ?? rule.daily_limit_seconds;
  const earnedBonusSeconds = Math.floor(sharedUsage.learningSeconds / 2);
  const effectiveLimitSeconds = baseLimitSeconds + bonusSeconds + earnedBonusSeconds;
  const remainingSeconds = Math.max(0, effectiveLimitSeconds - sharedUsage.leisureUsedSeconds);

  const sharedFields = {
    baseLimitSeconds,
    earnedBonusSeconds,
    learningSeconds: sharedUsage.learningSeconds,
    leisureUsedSeconds: sharedUsage.leisureUsedSeconds,
    listenSeconds: sharedUsage.listenSeconds,
  };

  // Check 1: Parent Paused
  if (override && override.is_paused === 1) {
    return {
      state: "PAUSED_BY_PARENT" as const,
      remainingSeconds: 0,
      todayPlayedSeconds,
      dailyLimitSeconds: effectiveLimitSeconds,
      bonusSeconds,
      gracePeriodSeconds: rule.grace_period_seconds,
      nextAllowedAt: null,
      isPaused: true,
      serverTimeTaipei: currentHHmm,
      todayDate: dateStr,
      message: "今天先休息一下 🌱 等等再來看看。",
      categoryStates,
      ...sharedFields,
    };
  }

  // Check 2: Outside Allowed Windows
  if (windows.length > 0) {
    const isInsideWindow = windows.some((w) => currentHHmm >= w.start_time && currentHHmm < w.end_time);
    if (!isInsideWindow) {
      const futureWindowsToday = windows.filter((w) => w.start_time > currentHHmm);
      const isEndedForToday = futureWindowsToday.length === 0;
      const nextAllowedAt = futureWindowsToday.length > 0 ? futureWindowsToday[0].start_time : windows[0].start_time;
      return {
        state: "OUTSIDE_WINDOW" as const,
        remainingSeconds: 0,
        todayPlayedSeconds,
        dailyLimitSeconds: effectiveLimitSeconds,
        bonusSeconds,
        gracePeriodSeconds: rule.grace_period_seconds,
        nextAllowedAt,
        isPaused: false,
        serverTimeTaipei: currentHHmm,
        todayDate: dateStr,
        message: isEndedForToday
          ? "今天影片時間結束了 🌙 明天再來看看吧。"
          : (nextAllowedAt ? `今天的影片時間還沒到 🌱 ${formatFriendlyTime(nextAllowedAt)} 就可以看了。` : "今天的影片時間還沒到 🌱"),
        categoryStates,
        ...sharedFields,
      };
    }
  }

  // Check 3: Daily Limit Reached
  if (effectiveLimitSeconds > 0 && remainingSeconds <= 0) {
    return {
      state: "DAILY_LIMIT_REACHED" as const,
      remainingSeconds: 0,
      todayPlayedSeconds,
      dailyLimitSeconds: effectiveLimitSeconds,
      bonusSeconds,
      gracePeriodSeconds: rule.grace_period_seconds,
      nextAllowedAt: null,
      isPaused: false,
      serverTimeTaipei: currentHHmm,
      todayDate: dateStr,
      message: "今天的休閒時間到了，學習和純聽仍可使用 🌙",
      categoryStates,
      ...sharedFields,
    };
  }

  // State: AVAILABLE
  return {
    state: "AVAILABLE" as const,
    remainingSeconds,
    todayPlayedSeconds,
    dailyLimitSeconds: effectiveLimitSeconds,
    bonusSeconds,
    gracePeriodSeconds: rule.grace_period_seconds,
    nextAllowedAt: null,
    isPaused: false,
    serverTimeTaipei: currentHHmm,
    todayDate: dateStr,
    message: formatGentleRemaining(remainingSeconds),
    categoryStates,
    ...sharedFields,
  };
}

export async function getRules(request: Request, env: AppEnv) {
  const { dateStr } = getTaipeiDateParts();

  const rulesResult = await env.DB.prepare(
    "SELECT id, day_type, daily_limit_seconds, grace_period_seconds, is_active FROM usage_rules ORDER BY id",
  ).all<UsageRuleRow>();

  const windowsResult = await env.DB.prepare(
    "SELECT id, usage_rule_id, start_time, end_time, sort_order, is_active FROM allowed_windows ORDER BY sort_order, start_time",
  ).all<AllowedWindowRow>();

  const allWindows = windowsResult.results || [];
  const rules = (rulesResult.results || []).map((r) => ({
    id: r.id,
    dayType: r.day_type,
    dailyLimitSeconds: r.daily_limit_seconds,
    gracePeriodSeconds: r.grace_period_seconds,
    isActive: r.is_active === 1,
    allowedWindows: allWindows
      .filter((w) => w.usage_rule_id === r.id)
      .map((w) => ({
        id: w.id,
        usageRuleId: w.usage_rule_id,
        startTime: w.start_time,
        endTime: w.end_time,
        sortOrder: w.sort_order,
        isActive: w.is_active === 1,
      })),
  }));

  const override = await env.DB.prepare(
    "SELECT id, date, bonus_seconds, limit_override_seconds, is_paused FROM daily_overrides WHERE date = ?",
  ).bind(dateStr).first<DailyOverrideRow>();

  return json({
    rules,
    todayOverride: override ? {
      id: override.id,
      date: override.date,
      bonusSeconds: override.bonus_seconds,
      limitOverrideSeconds: override.limit_override_seconds,
      isPaused: override.is_paused === 1,
    } : null,
  });
}

export async function updateRules(request: Request, env: AppEnv) {
  const body = await readJson(request);
  const rules = Array.isArray(body.rules) ? body.rules : [];
  const now = new Date().toISOString();

  for (const r of rules) {
    const id = text(r.id, "規則 ID", 1, 20) as "weekday" | "weekend";
    if (id !== "weekday" && id !== "weekend") throw new HttpError("規則類型必須為 weekday 或 weekend", 400);
    const dailyLimitMinutes = integer(r.dailyLimitMinutes ?? Math.round(r.dailyLimitSeconds / 60), "每日上限 (分鐘)", 0, 1440);
    const graceMinutes = integer(r.gracePeriodMinutes ?? Math.round(r.gracePeriodSeconds / 60), "寬限期 (分鐘)", 0, 60);
    const dailyLimitSeconds = dailyLimitMinutes * 60;
    const gracePeriodSeconds = graceMinutes * 60;

    await env.DB.prepare(`
      INSERT INTO usage_rules (id, day_type, daily_limit_seconds, grace_period_seconds, is_active, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        daily_limit_seconds = excluded.daily_limit_seconds,
        grace_period_seconds = excluded.grace_period_seconds,
        updated_at = excluded.updated_at
    `).bind(id, id, dailyLimitSeconds, gracePeriodSeconds, now).run();

    // Update allowed windows if provided
    if (Array.isArray(r.allowedWindows)) {
      await env.DB.prepare("DELETE FROM allowed_windows WHERE usage_rule_id = ?").bind(id).run();
      let sortOrder = 0;
      for (const w of r.allowedWindows) {
        const startTime = text(w.startTime, "開始時間", 4, 5);
        const endTime = text(w.endTime, "結束時間", 4, 5);
        if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
          throw new HttpError(`時段格式不正確 (${startTime} ～ ${endTime})，開始時間必須早於結束時間。`, 400);
        }
        const winId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO allowed_windows (id, usage_rule_id, start_time, end_time, sort_order, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
        `).bind(winId, id, startTime, endTime, ++sortOrder).run();
      }
    }
  }

  return json({ ok: true, updatedAt: now });
}

export async function addTodayBonus(request: Request, env: AppEnv) {
  const body = await readJson(request);
  const minutes = integer(body.minutes, "加時分鐘", 1, 300);
  const { dateStr } = getTaipeiDateParts();
  const bonusSeconds = minutes * 60;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO daily_overrides (id, date, bonus_seconds, limit_override_seconds, is_paused, created_at, updated_at)
    VALUES (?, ?, ?, NULL, 0, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      bonus_seconds = bonus_seconds + excluded.bonus_seconds,
      updated_at = excluded.updated_at
  `).bind(id, dateStr, bonusSeconds, now, now).run();

  const accessState = await evaluateChildAccessState(env);
  return json({ ok: true, accessState });
}

export async function setTodayPause(request: Request, env: AppEnv, isPaused: boolean) {
  const { dateStr } = getTaipeiDateParts();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO daily_overrides (id, date, bonus_seconds, limit_override_seconds, is_paused, created_at, updated_at)
    VALUES (?, ?, 0, NULL, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      is_paused = excluded.is_paused,
      updated_at = excluded.updated_at
  `).bind(id, dateStr, isPaused ? 1 : 0, now, now).run();

  const accessState = await evaluateChildAccessState(env);
  return json({ ok: true, accessState });
}

export async function getTodayPicks(request: Request, env: AppEnv) {
  const { dateStr } = getTaipeiDateParts();

  const rows = await env.DB.prepare(`
    SELECT dp.id AS pick_id, dp.sort_order, v.id AS video_id, v.source, v.youtube_video_id,
      v.parent_label, v.thumbnail_url, v.media_type, v.media_path, v.thumbnail_path,
      v.duration_seconds
    FROM daily_video_picks dp
    JOIN videos v ON v.id = dp.video_id
    WHERE dp.date = ? AND v.is_active = 1 AND v.archived_at IS NULL AND v.availability_status = 'available'
    ORDER BY dp.sort_order, dp.created_at
  `).bind(dateStr).all<MediaColumns & {
    pick_id: string; sort_order: number; video_id: string;
    parent_label: string; duration_seconds: number | null;
  }>();

  const picks = (rows.results || []).map((r) => ({
    id: r.pick_id,
    videoId: r.video_id,
    ...mediaDto(r, env),
    parentLabel: r.parent_label,
    durationSeconds: r.duration_seconds,
    sortOrder: r.sort_order,
  }));

  return json(picks);
}

export async function updateTodayPicks(request: Request, env: AppEnv) {
  const body = await readJson(request);
  const videoIds = Array.isArray(body.videoIds) ? body.videoIds : [];
  const { dateStr } = getTaipeiDateParts();
  const now = new Date().toISOString();

  await env.DB.prepare("DELETE FROM daily_video_picks WHERE date = ?").bind(dateStr).run();

  let sortOrder = 0;
  for (const rawId of videoIds) {
    const videoId = text(rawId, "影片 ID", 1, 100);
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO daily_video_picks (id, date, video_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, dateStr, videoId, ++sortOrder, now).run();
  }

  return getTodayPicks(request, env);
}

export async function toggleTodayPick(request: Request, env: AppEnv, videoId: string) {
  const { dateStr } = getTaipeiDateParts();
  const existing = await env.DB.prepare(
    "SELECT id FROM daily_video_picks WHERE date = ? AND video_id = ?",
  ).bind(dateStr, videoId).first<{ id: string }>();

  if (existing) {
    await env.DB.prepare("DELETE FROM daily_video_picks WHERE id = ?").bind(existing.id).run();
  } else {
    const maxOrderRow = await env.DB.prepare(
      "SELECT MAX(sort_order) AS max_order FROM daily_video_picks WHERE date = ?",
    ).bind(dateStr).first<{ max_order: number | null }>();
    const nextOrder = (maxOrderRow?.max_order ?? 0) + 1;
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO daily_video_picks (id, date, video_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, dateStr, videoId, nextOrder, new Date().toISOString()).run();
  }

  return getTodayPicks(request, env);
}
