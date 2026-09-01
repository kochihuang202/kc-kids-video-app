import { HttpError } from "./http";
import { formatPosition, getDayRangeInTimeZone } from "../src/lib/utils";
import { verifyParent } from "./security";
import type { AppEnv } from "./types";

interface ExportNoteRow {
  id: string;
  video_id: string;
  video_label: string | null;
  youtube_video_id: string | null;
  content: string;
  video_position_seconds: number;
  created_at: string;
}

interface ExportSessionRow {
  id: string;
  video_id: string;
  video_label: string | null;
  youtube_video_id: string | null;
  played_seconds: number;
  last_position_seconds: number;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  status: string;
}

function csvEscape(field: unknown): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resolveRangeBounds(range: string, timeZone = "Asia/Taipei"): { start?: string; end?: string } {
  const now = new Date();
  if (range === "today") {
    return getDayRangeInTimeZone(timeZone, now);
  }
  if (range === "7d") {
    const endRange = getDayRangeInTimeZone(timeZone, now);
    const startCandidate = new Date(Date.parse(endRange.end) - 7 * 24 * 60 * 60 * 1000);
    const startRange = getDayRangeInTimeZone(timeZone, startCandidate);
    return { start: startRange.start, end: endRange.end };
  }
  if (range === "30d") {
    const endRange = getDayRangeInTimeZone(timeZone, now);
    const startCandidate = new Date(Date.parse(endRange.end) - 30 * 24 * 60 * 60 * 1000);
    const startRange = getDayRangeInTimeZone(timeZone, startCandidate);
    return { start: startRange.start, end: endRange.end };
  }
  return {};
}

export async function exportNotes(request: Request, env: AppEnv): Promise<Response> {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "md";
  const range = url.searchParams.get("range") || "all";
  const { start, end } = resolveRangeBounds(range);

  let query = `
    SELECT n.id, n.video_id, v.parent_label AS video_label, v.youtube_video_id,
      n.content, n.video_position_seconds, n.created_at
    FROM notes n
    LEFT JOIN videos v ON v.id = n.video_id
    WHERE n.deleted_at IS NULL
  `;
  const params: unknown[] = [];
  if (start && end) {
    query += " AND n.created_at >= ? AND n.created_at < ?";
    params.push(start, end);
  }
  query += " ORDER BY n.created_at ASC";

  const stmt = env.DB.prepare(query);
  const result = await (params.length ? stmt.bind(...params) : stmt).all<ExportNoteRow>();
  const notes = result.results || [];

  if (format === "csv") {
    const header = "date,time,video_title,youtube_video_id,video_position_seconds,note_content\r\n";
    const lines = notes.map((row) => {
      const d = new Date(row.created_at);
      const dateStr = d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
      const timeStr = d.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });
      return [
        csvEscape(dateStr),
        csvEscape(timeStr),
        csvEscape(row.video_label || "未命名影片"),
        csvEscape(row.youtube_video_id || ""),
        csvEscape(row.video_position_seconds),
        csvEscape(row.content),
      ].join(",");
    });

    const csvContent = "\uFEFF" + header + lines.join("\r\n"); // UTF-8 BOM for Excel
    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="notes-${range}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // Markdown format (#49)
  const groupedByDate = new Map<string, ExportNoteRow[]>();
  for (const row of notes) {
    const d = new Date(row.created_at);
    const dateStr = d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    if (!groupedByDate.has(dateStr)) groupedByDate.set(dateStr, []);
    groupedByDate.get(dateStr)!.push(row);
  }

  let md = `# 小小選片 孩子想法紀錄 (${range.toUpperCase()})\n\n`;
  if (notes.length === 0) {
    md += "_這段時間尚無想法紀錄。_\n";
  } else {
    for (const [dateStr, dayNotes] of groupedByDate.entries()) {
      md += `# ${dateStr}\n\n`;
      for (const note of dayNotes) {
        const d = new Date(note.created_at);
        const timeStr = d.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });
        md += `## ${note.video_label || "未命名影片"}\n\n`;
        md += `時間：${timeStr}\n`;
        md += `影片位置：${formatPosition(note.video_position_seconds)}\n\n`;
        const quotedContent = note.content.split("\n").map((line) => `> ${line}`).join("\n");
        md += `${quotedContent}\n\n---\n\n`;
      }
    }
  }

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="notes-${range}-${new Date().toISOString().slice(0, 10)}.md"`,
    },
  });
}

export async function exportSessions(request: Request, env: AppEnv): Promise<Response> {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "all";
  const { start, end } = resolveRangeBounds(range);

  let query = `
    SELECT vs.id, vs.video_id, v.parent_label AS video_label, v.youtube_video_id,
      vs.played_seconds, vs.last_position_seconds, vs.started_at, vs.ended_at, vs.updated_at, vs.status
    FROM view_sessions vs
    LEFT JOIN videos v ON v.id = vs.video_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (start && end) {
    query += " AND vs.started_at >= ? AND vs.started_at < ?";
    params.push(start, end);
  }
  query += " ORDER BY vs.started_at ASC";

  const stmt = env.DB.prepare(query);
  const result = await (params.length ? stmt.bind(...params) : stmt).all<ExportSessionRow>();
  const sessions = result.results || [];

  const header = "started_at,ended_at,video_title,youtube_video_id,played_seconds,last_position_seconds,status\r\n";
  const lines = sessions.map((row) => {
    return [
      csvEscape(row.started_at),
      csvEscape(row.ended_at || row.updated_at),
      csvEscape(row.video_label || "未命名影片"),
      csvEscape(row.youtube_video_id || ""),
      csvEscape(row.played_seconds),
      csvEscape(row.last_position_seconds),
      csvEscape(row.status),
    ].join(",");
  });

  const csvContent = "\uFEFF" + header + lines.join("\r\n");
  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="view_sessions-${range}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
