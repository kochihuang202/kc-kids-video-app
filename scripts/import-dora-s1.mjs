import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const thumbDir = path.join(repoRoot, "artifacts", "r2-thumbnails", "dora-s1");
fs.mkdirSync(thumbDir, { recursive: true });

const importDir = path.join(repoRoot, "artifacts", "local-media-import", "dora-s1");
fs.mkdirSync(importDir, { recursive: true });

const smbShare = "\\\\Kcdemac-mini\\影片\\Dora_the_Explorer_S01";
if (!fs.existsSync(smbShare)) {
  console.error("Cannot access SMB share:", smbShare);
  process.exit(1);
}

// Find ffmpeg
let ffmpegPath = "ffmpeg";
const bundledFfmpeg = path.join(repoRoot, "node_modules", "ffmpeg-static", "ffmpeg.exe");
if (fs.existsSync(bundledFfmpeg)) {
  ffmpegPath = bundledFfmpeg;
}

const smbFiles = fs.readdirSync(smbShare)
  .filter((f) => f.endsWith(".mp4"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

console.log(`Found ${smbFiles.length} MP4 files in Dora_the_Explorer_S01.`);

const rows = [];
let sortOrder = 1;

for (const filename of smbFiles) {
  // e.g. Dora.S01E01.The Legend of the Bi.mp4
  const match = filename.match(/^Dora\.S01E(\d+)\.(.+)\.mp4$/i);
  let epNum = sortOrder;
  let rawTitle = filename.replace(/\.mp4$/i, "");
  if (match) {
    epNum = parseInt(match[1], 10);
    rawTitle = match[2].trim();
  }

  const videoId = `dora-s1-e${String(epNum).padStart(2, "0")}`;
  const fullPath = path.join(smbShare, filename);

  // Probe duration
  let duration = null;
  try {
    const probe = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${fullPath}"`,
      { encoding: "utf8" }
    ).trim();
    if (probe) {
      duration = Math.round(parseFloat(probe));
    }
  } catch (e) {
    // fallback duration
  }

  const mediaPath = `/media/Dora_the_Explorer_S01/${encodeURIComponent(filename)}`;
  const thumbnailUrl = `/api/media/thumbnails/dora-s1/${videoId}.webp`;

  rows.push({
    id: videoId,
    filename,
    fullPath,
    title: `第${epNum}集 ${rawTitle}`,
    parentLabel: `第 ${epNum} 集 - ${rawTitle}`,
    durationSeconds: duration,
    sortOrder,
    mediaPath,
    thumbnailUrl,
  });
  sortOrder++;
}

console.log("1. Generating thumbnails at 15s mark...");
let completedThumbs = 0;
for (const row of rows) {
  const outputFile = path.join(thumbDir, `${row.id}.webp`);
  if (!fs.existsSync(outputFile)) {
    const res = spawnSync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "15",
        "-i",
        row.fullPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2:flags=lanczos",
        "-c:v",
        "libwebp",
        "-quality",
        "80",
        "-y",
        outputFile,
      ],
      { stdio: "inherit" }
    );
    if (res.status !== 0 || !fs.existsSync(outputFile)) {
      spawnSync(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          "3",
          "-i",
          row.fullPath,
          "-frames:v",
          "1",
          "-vf",
          "scale=640:-2:flags=lanczos",
          "-c:v",
          "libwebp",
          "-quality",
          "80",
          "-y",
          outputFile,
        ],
        { stdio: "inherit" }
      );
    }
  }
  completedThumbs++;
  console.log(`  Thumbnail (${completedThumbs}/${rows.length}): ${row.id}.webp`);
}

console.log("2. Uploading thumbnails to Cloudflare R2...");
let uploadedCount = 0;
for (const row of rows) {
  const outputFile = path.join(thumbDir, `${row.id}.webp`);
  const r2Key = `thumbnails/dora-s1/${row.id}.webp`;
  execSync(
    `npx wrangler r2 object put "kc-kids-video-app-assets/${r2Key}" --remote --file="${outputFile}" --content-type=image/webp --cache-control="public, max-age=31536000, immutable" --force`,
    { stdio: "pipe" }
  );
  uploadedCount++;
  console.log(`  Uploaded to R2 (${uploadedCount}/${rows.length}): ${r2Key}`);
}

console.log("3. Generating SQL...");
function sqlStr(val) {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

const catSql = `INSERT INTO categories (id, name, icon, image_url, tone, sort_order, is_active, created_at, updated_at, archived_at, daily_limit_seconds, series_type, unlock_limit)
VALUES ('dora-s1', 'Dora the Explorer S1', '🎒', NULL, 'sage', 21, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, 'learning', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  icon = excluded.icon,
  tone = excluded.tone,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP,
  archived_at = NULL,
  series_type = excluded.series_type,
  unlock_limit = excluded.unlock_limit;`;

const videoValueLines = rows.map((r) => {
  return `  (${sqlStr(r.id)}, 'self_hosted', NULL, ${sqlStr(r.title)}, ${sqlStr(r.parentLabel)}, ${sqlStr(r.thumbnailUrl)}, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, 'healthy', 'video', ${r.durationSeconds ?? "NULL"}, 0, NULL, ${sqlStr(r.mediaPath)}, NULL)`;
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
  media_type = 'video',
  media_path = excluded.media_path;`;

const catVideoLines = rows.map((r) => {
  return `  ('dora-s1', ${sqlStr(r.id)}, ${r.sortOrder}, CURRENT_TIMESTAMP)`;
});

const catVideoSql = `INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
VALUES
${catVideoLines.join(",\n")}
ON CONFLICT(category_id, video_id) DO UPDATE SET
  sort_order = excluded.sort_order;`;

const allSql = [
  "-- Dora the Explorer S1 Import SQL",
  catSql,
  videoSql,
  catVideoSql,
].join("\n\n");

const sqlFile = path.join(importDir, "import.sql");
fs.writeFileSync(sqlFile, allSql, "utf8");
console.log("SQL generated at:", sqlFile);

console.log("4. Executing SQL on remote D1...");
execSync(
  `npx wrangler d1 execute kc-kids-video-app-db --remote --file="${sqlFile}"`,
  { stdio: "inherit" }
);

console.log("🎉 Dora the Explorer S1 successfully imported and published!");
