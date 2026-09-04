import { assertSameOrigin, HttpError, integer, json, readJson, text } from "./http";
import { getChildDevice, tokenHash, verifyParent } from "./security";
import type { AppEnv, JsonObject } from "./types";

const EVENT_TYPES = new Set([
  "page_opened", "player_created", "player_ready", "play_requested", "playing", "paused",
  "buffering", "ended", "seeked", "retry_started", "retry_succeeded", "retry_exhausted",
  "media_probe", "media_error", "youtube_error", "autoplay_blocked", "visibility_hidden",
  "visibility_visible", "next_requested", "route_left", "javascript_error",
]);
const ERROR_EVENTS = new Set(["retry_exhausted", "media_error", "youtube_error", "autoplay_blocked", "javascript_error"]);

function nullableText(value: unknown, max = 160) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, "診斷欄位", 1, max);
}

function ipPrefix(ip: string) {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : null;
  }
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}::/48`;
  return null;
}

async function requestNetwork(request: Request, env: AppEnv) {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf || {};
  const rawIp = request.headers.get("cf-connecting-ip") || "unknown";
  return {
    ipPrefix: rawIp === "unknown" ? null : ipPrefix(rawIp),
    ipHash: rawIp === "unknown" ? null : await tokenHash(`diagnostic-ip:${rawIp}`, env),
    country: typeof cf.country === "string" ? cf.country : null,
    colo: typeof cf.colo === "string" ? cf.colo : null,
    httpProtocol: typeof cf.httpProtocol === "string" ? cf.httpProtocol : null,
    tlsVersion: typeof cf.tlsVersion === "string" ? cf.tlsVersion : null,
  };
}

function sanitizeDetail(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = [
    "status", "latencyMs", "requestId", "serviceVersion", "serverTiming", "readyMs",
    "state", "retryNumber", "networkOnline", "mediaErrorCode", "youtubeErrorCode", "message",
    "tailscaleRunning", "tailscaleOnline", "mediaRootReadable", "activeStreams",
  ];
  const output: JsonObject = {};
  for (const key of allowed) {
    const item = (value as JsonObject)[key];
    if (typeof item === "string") output[key] = item.slice(0, 240);
    else if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
    else if (typeof item === "boolean") output[key] = item;
  }
  const encoded = JSON.stringify(output);
  return encoded === "{}" ? null : encoded;
}

async function runRetentionIfDue(env: AppEnv) {
  const now = new Date();
  const dueBefore = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const claimed = await env.DB.prepare(`
    UPDATE diagnostic_maintenance SET last_run_at = ?
    WHERE id = 'retention' AND last_run_at < ?
  `).bind(now.toISOString(), dueBefore).run();
  if (!claimed.meta.changes) return;

  const detailCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oldErrors = await env.DB.prepare(`
    SELECT substr(e.received_at, 1, 10) AS day, s.device_id, s.source,
           e.error_code, COUNT(*) AS occurrence_count,
           COUNT(DISTINCT s.id) AS session_count,
           MIN(e.received_at) AS first_seen_at, MAX(e.received_at) AS last_seen_at
    FROM diagnostic_events e
    JOIN diagnostic_sessions s ON s.id = e.diagnostic_session_id
    WHERE e.error_code IS NOT NULL AND e.received_at < ?
    GROUP BY day, s.device_id, s.source, e.error_code
  `).bind(detailCutoff).all<{
    day: string; device_id: string; source: string; error_code: string; occurrence_count: number;
    session_count: number; first_seen_at: string; last_seen_at: string;
  }>();
  const rollups = (oldErrors.results || []).map((row) => env.DB.prepare(`
    INSERT INTO diagnostic_error_rollups
      (day, device_id, source, error_code, occurrence_count, session_count, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day, device_id, source, error_code) DO UPDATE SET
      occurrence_count = MAX(occurrence_count, excluded.occurrence_count),
      session_count = MAX(session_count, excluded.session_count),
      first_seen_at = MIN(first_seen_at, excluded.first_seen_at),
      last_seen_at = MAX(last_seen_at, excluded.last_seen_at)
  `).bind(row.day, row.device_id, row.source, row.error_code, row.occurrence_count, row.session_count, row.first_seen_at, row.last_seen_at));
  await env.DB.batch([
    ...rollups,
    env.DB.prepare("DELETE FROM diagnostic_events WHERE received_at < ?").bind(detailCutoff),
    env.DB.prepare("DELETE FROM diagnostic_sessions WHERE started_at < ? AND outcome != 'success'").bind(detailCutoff),
    env.DB.prepare(`
      DELETE FROM diagnostic_sessions
      WHERE outcome = 'success' AND id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY started_at DESC) AS rank
          FROM diagnostic_sessions WHERE outcome = 'success'
        ) WHERE rank > 100
      )
    `),
  ]);
}

export async function startDiagnosticSession(request: Request, env: AppEnv) {
  assertSameOrigin(request, env.APP_ORIGIN);
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const clientSessionId = text(body.clientSessionId, "診斷識別碼", 8, 100);
  const videoId = nullableText(body.videoId, 100);
  const source = body.source === "youtube" || body.source === "self_hosted" ? body.source : null;
  const playbackMode = body.playbackMode === "video" || body.playbackMode === "listen" ? body.playbackMode : null;
  if (!source || !playbackMode) throw new HttpError("診斷來源或模式不正確。", 400, "INVALID_DIAGNOSTIC");
  const existing = await env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE device_id = ? AND client_session_id = ?",
  ).bind(device!.id, clientSessionId).first<{ id: string }>();
  if (existing) return json({ id: existing.id });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const network = await requestNetwork(request, env);
  await env.DB.prepare(`
    INSERT INTO diagnostic_sessions (
      id, client_session_id, device_id, device_name_snapshot, video_id, video_label_snapshot,
      category_id, source, playback_mode, user_agent, platform, browser_name, browser_version,
      os_name, os_version, viewport_width, viewport_height, is_standalone, network_type,
      ip_prefix, ip_hash, country, colo, http_protocol, tls_version, started_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, clientSessionId, device!.id, device!.name, videoId, nullableText(body.videoLabel, 200),
    nullableText(body.categoryId, 100), source, playbackMode,
    text(body.userAgent || request.headers.get("user-agent") || "unknown", "User Agent", 1, 500),
    nullableText(body.platform, 80), nullableText(body.browserName, 40), nullableText(body.browserVersion, 40),
    nullableText(body.osName, 40), nullableText(body.osVersion, 40),
    typeof body.viewportWidth === "number" ? integer(body.viewportWidth, "寬度", 0, 10000) : null,
    typeof body.viewportHeight === "number" ? integer(body.viewportHeight, "高度", 0, 10000) : null,
    body.isStandalone === true ? 1 : 0, nullableText(body.networkType, 40),
    network.ipPrefix, network.ipHash, network.country, network.colo, network.httpProtocol, network.tlsVersion,
    now, now,
  ).run();
  await runRetentionIfDue(env);
  return json({ id }, { status: 201 });
}

export async function addDiagnosticEvents(request: Request, env: AppEnv, id: string) {
  assertSameOrigin(request, env.APP_ORIGIN);
  const device = await getChildDevice(request, env, true);
  const session = await env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE id = ? AND device_id = ?",
  ).bind(id, device!.id).first();
  if (!session) throw new HttpError("找不到診斷工作階段。", 404, "DIAGNOSTIC_NOT_FOUND");
  const body = await readJson(request);
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 30) {
    throw new HttpError("每批診斷事件需為 1～30 筆。", 400, "INVALID_DIAGNOSTIC_EVENTS");
  }
  const now = new Date().toISOString();
  const statements = body.events.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError("診斷事件格式不正確。");
    const event = raw as JsonObject;
    const eventType = text(event.type, "事件類型", 1, 50);
    if (!EVENT_TYPES.has(eventType)) throw new HttpError("不支援的診斷事件。", 400, "INVALID_DIAGNOSTIC_EVENT");
    const seq = integer(event.seq, "事件順序", 1, 1000000);
    const occurredAt = text(event.occurredAt, "事件時間", 10, 40);
    const errorCode = nullableText(event.errorCode, 80) || (ERROR_EVENTS.has(eventType) ? eventType.toUpperCase() : null);
    const position = typeof event.positionSeconds === "number" && Number.isFinite(event.positionSeconds)
      ? Math.max(0, Math.min(86400, event.positionSeconds)) : null;
    return env.DB.prepare(`
      INSERT OR IGNORE INTO diagnostic_events
        (diagnostic_session_id, event_seq, event_type, occurred_at, received_at, position_seconds, error_code, detail_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, seq, eventType, occurredAt, now, position, errorCode, sanitizeDetail(event.detail));
  });
  await env.DB.batch(statements);
  await env.DB.prepare(`
    UPDATE diagnostic_sessions SET
      retry_count = (SELECT COUNT(*) FROM diagnostic_events WHERE diagnostic_session_id = ? AND event_type = 'retry_started'),
      error_count = (SELECT COUNT(*) FROM diagnostic_events WHERE diagnostic_session_id = ? AND error_code IS NOT NULL),
      last_error_code = (SELECT error_code FROM diagnostic_events WHERE diagnostic_session_id = ? AND error_code IS NOT NULL ORDER BY event_seq DESC LIMIT 1),
      first_play_at = COALESCE(first_play_at, (SELECT MIN(occurred_at) FROM diagnostic_events WHERE diagnostic_session_id = ? AND event_type = 'playing')),
      first_play_ms = COALESCE(first_play_ms, MAX(0, CAST((julianday((SELECT MIN(occurred_at) FROM diagnostic_events WHERE diagnostic_session_id = ? AND event_type = 'playing')) - julianday(started_at)) * 86400000 AS INTEGER))),
      outcome = CASE WHEN EXISTS (SELECT 1 FROM diagnostic_events WHERE diagnostic_session_id = ? AND error_code IS NOT NULL) THEN 'recovered' ELSE outcome END,
      updated_at = ? WHERE id = ?
  `).bind(id, id, id, id, id, id, now, id).run();
  return json({ ok: true });
}

export async function finishDiagnosticSession(request: Request, env: AppEnv, id: string) {
  assertSameOrigin(request, env.APP_ORIGIN);
  const device = await getChildDevice(request, env, true);
  const body = await readJson(request);
  const requested = body.outcome === "success" || body.outcome === "recovered" || body.outcome === "error" ? body.outcome : null;
  if (!requested) throw new HttpError("診斷結果不正確。");
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE diagnostic_sessions SET outcome = CASE
      WHEN error_count > 0 AND ? = 'success' THEN 'recovered' ELSE ? END,
      ended_at = ?, updated_at = ?
    WHERE id = ? AND device_id = ?
  `).bind(requested, requested, now, now, id, device!.id).run();
  await runRetentionIfDue(env);
  return json({ ok: true });
}

async function diagnosticsPayload(env: AppEnv, url: URL) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50) || 50));
  const deviceId = url.searchParams.get("deviceId");
  const outcome = url.searchParams.get("outcome");
  const since = url.searchParams.get("since") || new Date(Date.now() - 30 * 86400000).toISOString();
  const clauses = ["s.started_at >= ?"];
  const values: unknown[] = [since];
  if (deviceId) { clauses.push("s.device_id = ?"); values.push(deviceId); }
  if (outcome && ["open", "success", "recovered", "error"].includes(outcome)) { clauses.push("s.outcome = ?"); values.push(outcome); }
  const sessions = await env.DB.prepare(`
    SELECT s.id, s.device_id AS deviceId, COALESCE(d.name, s.device_name_snapshot) AS deviceName,
      s.video_id AS videoId, s.video_label_snapshot AS videoLabel, s.category_id AS categoryId,
      s.source, s.playback_mode AS playbackMode, s.outcome, s.retry_count AS retryCount,
      s.error_count AS errorCount, s.last_error_code AS lastErrorCode, s.first_play_ms AS firstPlayMs,
      s.browser_name AS browserName, s.browser_version AS browserVersion, s.os_name AS osName,
      s.os_version AS osVersion, s.viewport_width AS viewportWidth, s.viewport_height AS viewportHeight,
      s.is_standalone AS isStandalone, s.network_type AS networkType, s.ip_prefix AS ipPrefix,
      s.country, s.colo, s.http_protocol AS httpProtocol, s.tls_version AS tlsVersion,
      s.started_at AS startedAt, s.ended_at AS endedAt
    FROM diagnostic_sessions s LEFT JOIN child_devices d ON d.id = s.device_id
    WHERE ${clauses.join(" AND ")} ORDER BY s.started_at DESC LIMIT ?
  `).bind(...values, limit).all();
  return { sessions: sessions.results || [] };
}

export async function getParentDiagnostics(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  return json(await diagnosticsPayload(env, new URL(request.url)));
}

export async function getParentDiagnosticDetail(request: Request, env: AppEnv, id: string) {
  await verifyParent(request, env);
  const session = await env.DB.prepare(`
    SELECT s.*, COALESCE(d.name, s.device_name_snapshot) AS current_device_name
    FROM diagnostic_sessions s LEFT JOIN child_devices d ON d.id = s.device_id WHERE s.id = ?
  `).bind(id).first();
  if (!session) throw new HttpError("找不到診斷紀錄。", 404);
  const events = await env.DB.prepare(`
    SELECT event_seq AS seq, event_type AS type, occurred_at AS occurredAt,
      position_seconds AS positionSeconds, error_code AS errorCode, detail_json AS detailJson
    FROM diagnostic_events WHERE diagnostic_session_id = ? ORDER BY event_seq
  `).bind(id).all();
  return json({ session, events: events.results || [] });
}

export async function getDiagnosticsSummary(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [devices, errors] = await Promise.all([
    env.DB.prepare(`
      SELECT d.id AS deviceId, d.name AS deviceName, COUNT(s.id) AS sessionCount,
        SUM(CASE WHEN s.outcome = 'success' THEN 1 ELSE 0 END) AS successCount,
        SUM(CASE WHEN s.outcome IN ('recovered','error') THEN 1 ELSE 0 END) AS problemCount,
        MAX(s.started_at) AS lastSeenAt
      FROM child_devices d LEFT JOIN diagnostic_sessions s ON s.device_id = d.id AND s.started_at >= ?
      WHERE d.revoked_at IS NULL GROUP BY d.id, d.name ORDER BY d.name
    `).bind(since).all(),
    env.DB.prepare(`
      SELECT last_error_code AS errorCode, source, COUNT(*) AS sessionCount, MAX(started_at) AS lastSeenAt
      FROM diagnostic_sessions WHERE started_at >= ? AND last_error_code IS NOT NULL
      GROUP BY last_error_code, source ORDER BY sessionCount DESC LIMIT 20
    `).bind(since).all(),
  ]);
  return json({ devices: devices.results || [], errors: errors.results || [] });
}

export async function exportDiagnostics(request: Request, env: AppEnv) {
  const expected = env.DIAGNOSTICS_READ_TOKEN;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !actual || actual !== expected) throw new HttpError("診斷讀取憑證無效。", 401);
  const url = new URL(request.url);
  const payload = await diagnosticsPayload(env, url);
  const sessionId = url.searchParams.get("sessionId");
  const events = sessionId ? await env.DB.prepare(`
    SELECT event_seq AS seq, event_type AS type, occurred_at AS occurredAt,
      position_seconds AS positionSeconds, error_code AS errorCode, detail_json AS detailJson
    FROM diagnostic_events WHERE diagnostic_session_id = ? ORDER BY event_seq
  `).bind(sessionId).all() : null;
  const rollups = await env.DB.prepare(`
    SELECT day, device_id AS deviceId, source, error_code AS errorCode,
      occurrence_count AS occurrenceCount, session_count AS sessionCount,
      first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM diagnostic_error_rollups ORDER BY day DESC LIMIT 200
  `).all();
  return json({ ...payload, events: events?.results || [], rollups: rollups.results || [] });
}
