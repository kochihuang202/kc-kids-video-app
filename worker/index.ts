import { videos } from "../src/data/fixtures";

type JsonRecord = Record<string, unknown>;

interface NoteRow {
  id: string;
  video_id: string;
  content: string;
  video_position_seconds: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  video_id: string;
  played_seconds: number;
  last_position_seconds: number;
  started_at: string;
  updated_at: string;
}

const videoMap = new Map(videos.map((video) => [video.id, video]));

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}

function error(message: string, status = 400) {
  return json({ error: message }, { status });
}

async function readBody(request: Request): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function safeSeconds(value: unknown) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function isIsoDate(value: string | null) {
  return !!value && !Number.isNaN(Date.parse(value));
}

async function saveNote(request: Request, env: Env) {
  const body = await readBody(request);
  const videoId = typeof body?.videoId === "string" ? body.videoId : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const position = safeSeconds(body?.videoPositionSeconds);
  if (!videoMap.has(videoId)) return error("找不到這部影片。");
  if (!content) return error("先留下一點想法，再存起來。");
  if (content.length > 4000) return error("想法太長了，請縮短一些。");
  if (position === null) return error("影片位置不正確。");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO notes (id, video_id, content, video_position_seconds, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, videoId, content, position, createdAt).run();
  return json({ id, createdAt }, { status: 201 });
}

async function startSession(request: Request, env: Env) {
  const body = await readBody(request);
  const videoId = typeof body?.videoId === "string" ? body.videoId : "";
  if (!videoMap.has(videoId)) return error("找不到這部影片。");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO view_sessions (id, video_id, played_seconds, last_position_seconds, started_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)")
    .bind(id, videoId, now, now).run();
  return json({ id, startedAt: now }, { status: 201 });
}

async function updateSession(request: Request, env: Env, id: string) {
  const body = await readBody(request);
  const played = safeSeconds(body?.playedSeconds);
  const position = safeSeconds(body?.lastPositionSeconds);
  if (!id || played === null || position === null) return error("播放資料不正確。");
  const result = await env.DB.prepare("UPDATE view_sessions SET played_seconds = MAX(played_seconds, ?), last_position_seconds = ?, updated_at = ? WHERE id = ?")
    .bind(played, position, new Date().toISOString(), id).run();
  if (!result.meta.changes) return error("找不到播放紀錄。", 404);
  return json({ ok: true });
}

async function getToday(url: URL, env: Env) {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!isIsoDate(start) || !isIsoDate(end) || Date.parse(start!) >= Date.parse(end!)) return error("日期範圍不正確。");
  const [noteResult, sessionResult] = await env.DB.batch([
    env.DB.prepare("SELECT id, video_id, content, video_position_seconds, created_at FROM notes WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC").bind(start, end),
    env.DB.prepare("SELECT id, video_id, played_seconds, last_position_seconds, started_at, updated_at FROM view_sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at ASC").bind(start, end),
  ]);
  const noteRows = (noteResult.results || []) as unknown as NoteRow[];
  const sessionRows = (sessionResult.results || []) as unknown as SessionRow[];
  const notes = noteRows.map((row) => ({
    id: row.id,
    videoId: row.video_id,
    videoLabel: videoMap.get(row.video_id)?.parentLabel || "影片",
    content: row.content,
    videoPositionSeconds: row.video_position_seconds,
    createdAt: row.created_at,
  }));
  const timeline = sessionRows.map((row, index) => {
    const nextSameVideoSession = sessionRows.slice(index + 1).find((session) => session.video_id === row.video_id);
    return {
      id: row.id,
      videoId: row.video_id,
      videoLabel: videoMap.get(row.video_id)?.parentLabel || "影片",
      playedSeconds: row.played_seconds,
      lastPositionSeconds: row.last_position_seconds,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      noteCount: noteRows.filter((note) => (
        note.video_id === row.video_id
        && note.created_at >= row.started_at
        && (!nextSameVideoSession || note.created_at < nextSameVideoSession.started_at)
      )).length,
    };
  });
  return json({
    notes,
    timeline,
    summary: {
      totalPlayedSeconds: sessionRows.reduce((total, row) => total + row.played_seconds, 0),
      playedVideoCount: new Set(sessionRows.map((row) => row.video_id)).size,
      noteCount: noteRows.length,
    },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Not Found", { status: 404 });
    if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true });
    if (request.method === "POST" && url.pathname === "/api/notes") return saveNote(request, env);
    if (request.method === "POST" && url.pathname === "/api/view-sessions") return startSession(request, env);
    if (request.method === "GET" && url.pathname === "/api/today") return getToday(url, env);
    const sessionMatch = request.method === "PATCH" && url.pathname.match(/^\/api\/view-sessions\/([^/]+)$/);
    if (sessionMatch) return updateSession(request, env, decodeURIComponent(sessionMatch[1]));
    return error("找不到這個功能。", 404);
  },
} satisfies ExportedHandler<Env>;
