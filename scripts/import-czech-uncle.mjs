import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const importDir = path.join(repoRoot, "artifacts", "local-media-import", "czech-uncle-songs");
fs.mkdirSync(importDir, { recursive: true });

const smbShare = "\\\\Kcdemac-mini\\影片\\11_捷克大叔兒歌";
if (!fs.existsSync(smbShare)) {
  console.error("Cannot access SMB share:", smbShare);
  process.exit(1);
}

const smbFiles = fs.readdirSync(smbShare)
  .filter((f) => f.toLowerCase().endsWith(".mp3"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

console.log(`Found ${smbFiles.length} MP3 files in 11_捷克大叔兒歌.`);

const rows = [];
let sortOrder = 1;

for (const filename of smbFiles) {
  // e.g. "01 I Took Them All.mp3"
  const match = filename.match(/^(\d+)\s*(.*)\.mp3$/i);
  let trackNum = sortOrder;
  let trackTitle = filename.replace(/\.mp3$/i, "").trim();

  if (match) {
    trackNum = parseInt(match[1], 10);
    trackTitle = match[2].trim() || `Track ${trackNum}`;
  }

  const audioId = `czech-uncle-${String(trackNum).padStart(3, "0")}`;
  const fullPath = path.join(smbShare, filename);

  // Probe duration via ffprobe
  let duration = null;
  try {
    const probe = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${fullPath}"`,
      { encoding: "utf8" }
    ).trim();
    if (probe) {
      duration = Math.round(parseFloat(probe));
    }
  } catch (e) {
    console.warn(`Could not probe duration for ${filename}, setting to null.`);
  }

  // URL encode the filename for media_path
  const mediaPath = `/media/11_${encodeURIComponent("捷克大叔兒歌")}/${encodeURIComponent(filename)}`;

  rows.push({
    id: audioId,
    filename,
    title: trackTitle,
    parentLabel: `第 ${trackNum} 首 - ${trackTitle}`,
    durationSeconds: duration,
    sortOrder,
    mediaPath,
  });

  sortOrder++;
}

console.log(`Probed all ${rows.length} audio tracks.`);

function sqlStr(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

// Category: learning, unlimited daily limit (NULL), unlock_limit 0 (all unlocked), icon 🎶, tone sky, sort_order 22
const catSql = `INSERT INTO categories (id, name, icon, image_url, tone, sort_order, is_active, created_at, updated_at, archived_at, daily_limit_seconds, series_type, unlock_limit)
VALUES ('czech-uncle-songs', '捷克大叔兒歌', '🎶', NULL, 'sky', 22, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, 'learning', 0)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  icon = excluded.icon,
  tone = excluded.tone,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP,
  archived_at = NULL,
  daily_limit_seconds = NULL,
  series_type = 'learning',
  unlock_limit = 0;`;

const videoValueLines = rows.map((r) => {
  return `  (${sqlStr(r.id)}, 'self_hosted', NULL, ${sqlStr(r.title)}, ${sqlStr(r.parentLabel)}, '', 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, 'healthy', 'audio', ${r.durationSeconds ?? "NULL"}, 0, NULL, ${sqlStr(r.mediaPath)}, NULL)`;
});

const videoSql = `INSERT INTO videos (
  id, source, youtube_video_id, youtube_title, parent_label, thumbnail_url,
  availability_status, is_active, created_at, updated_at, archived_at,
  health_status, media_type, duration_seconds, playback_start_seconds,
  playback_end_seconds, media_path, thumbnail_path
)
VALUES
${videoValueLines.join(",\n")}
ON CONFLICT(id) DO UPDATE SET
  source = excluded.source,
  youtube_title = excluded.youtube_title,
  parent_label = excluded.parent_label,
  thumbnail_url = excluded.thumbnail_url,
  duration_seconds = COALESCE(excluded.duration_seconds, videos.duration_seconds),
  availability_status = 'available',
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP,
  archived_at = NULL,
  health_status = 'healthy',
  media_type = 'audio',
  media_path = excluded.media_path;`;

const catVideoLines = rows.map((r) => {
  return `  ('czech-uncle-songs', ${sqlStr(r.id)}, ${r.sortOrder}, CURRENT_TIMESTAMP)`;
});

const catVideoSql = `INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
VALUES
${catVideoLines.join(",\n")}
ON CONFLICT(category_id, video_id) DO UPDATE SET
  sort_order = excluded.sort_order;`;

const allSql = [
  "-- 捷克大叔兒歌 Import SQL",
  catSql,
  videoSql,
  catVideoSql,
].join("\n\n");

const sqlFile = path.join(importDir, "import.sql");
fs.writeFileSync(sqlFile, allSql, "utf8");
console.log("SQL generated at:", sqlFile);

console.log("Executing SQL on remote D1 database...");
execSync(
  `npx wrangler d1 execute kc-kids-video-app-db --remote --file="${sqlFile}"`,
  { stdio: "inherit" }
);

console.log("🎉 捷克大叔兒歌 (101 首) 已成功匯入並發布！");
