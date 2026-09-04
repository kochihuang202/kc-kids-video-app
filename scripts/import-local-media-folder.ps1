param(
  [Parameter(Mandatory = $true)]
  [string]$MediaServerBaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$LibraryFolder,
  [Parameter(Mandatory = $true)]
  [string]$CategoryId,
  [Parameter(Mandatory = $true)]
  [string]$CategoryName,
  [Parameter(Mandatory = $true)]
  [string]$VideoIdPrefix,
  [ValidateSet("learning", "leisure")]
  [string]$SeriesType = "learning",
  [ValidateSet("sage", "sky", "apricot")]
  [string]$Tone = "sky",
  [string]$Icon = "",
  [int]$ExpectedCount = 0,
  [int]$ThumbnailAtSeconds = 3,
  [switch]$ReplaceCategoryVideos,
  [string]$DatabaseName = "kc-kids-video-app-db",
  [string]$OutputDirectory = "",
  [string]$BackupDirectory = "",
  [switch]$ApplyRemoteD1
)

$ErrorActionPreference = "Stop"

if (-not $Icon) { $Icon = [char]::ConvertFromUtf32(0x1F4D8) }

function ConvertTo-SqlText([AllowNull()][object]$Value) {
  if ($null -eq $Value) { return "NULL" }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

if ($CategoryId -notmatch '^[A-Za-z0-9_-]+$') { throw "CategoryId must contain only letters, numbers, underscore, and dash." }
if ($VideoIdPrefix -notmatch '^[A-Za-z0-9_-]+$') { throw "VideoIdPrefix must contain only letters, numbers, underscore, and dash." }
if ([string]::IsNullOrWhiteSpace($LibraryFolder) -or $LibraryFolder.Contains("/") -or $LibraryFolder.Contains("\") -or $LibraryFolder.Contains("..")) {
  throw "LibraryFolder must be one direct folder name below /media/."
}
if ($ThumbnailAtSeconds -lt 0) { throw "ThumbnailAtSeconds must be zero or greater." }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot "artifacts\local-media-import\$CategoryId"
}
if (-not $BackupDirectory) {
  $BackupDirectory = Join-Path $repoRoot "artifacts\backups"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$resolvedOutput = (Resolve-Path $OutputDirectory).Path

$baseUrl = $MediaServerBaseUrl.TrimEnd('/')
$libraryUrl = "$baseUrl/library"
Write-Host "Reading private media library..."
$library = Invoke-RestMethod -Uri $libraryUrl -Method Get
$prefix = "/media/$LibraryFolder/"

$directVideos = @($library.items | Where-Object {
  $path = [string]$_.path
  try { $decodedPath = [Uri]::UnescapeDataString($path) } catch { $decodedPath = $path }
  if ($_.mediaType -ne "video" -or -not $decodedPath.StartsWith($prefix, [StringComparison]::Ordinal)) { return $false }
  $relative = $decodedPath.Substring($prefix.Length)
  return $relative -and -not $relative.Contains("/") -and $relative.EndsWith(".mp4", [StringComparison]::OrdinalIgnoreCase)
} | Sort-Object @{ Expression = {
  if ([string]$_.name -match '^(\d+)') { [int]$Matches[1] } else { [int]::MaxValue }
}}, @{ Expression = { [string]$_.name } })

$nestedCount = @($library.items | Where-Object {
  $path = [string]$_.path
  try { $decodedPath = [Uri]::UnescapeDataString($path) } catch { $decodedPath = $path }
  if ($_.mediaType -ne "video" -or -not $decodedPath.StartsWith($prefix, [StringComparison]::Ordinal)) { return $false }
  return $decodedPath.Substring($prefix.Length).Contains("/") -and $decodedPath.EndsWith(".mp4", [StringComparison]::OrdinalIgnoreCase)
}).Count

if ($directVideos.Count -eq 0) { throw "No direct-child MP4 files were found below $prefix" }
if ($ExpectedCount -gt 0 -and $directVideos.Count -ne $ExpectedCount) {
  throw "Expected $ExpectedCount direct-child MP4 files, but found $($directVideos.Count). Nested MP4 files excluded: $nestedCount."
}

$rows = @()
$usedIds = @{}
for ($index = 0; $index -lt $directVideos.Count; $index++) {
  $item = $directVideos[$index]
  $stem = [IO.Path]::GetFileNameWithoutExtension([string]$item.name)
  $suffix = if ($stem -match '^(\d+)') { $Matches[1].PadLeft(3, '0') } else { ($index + 1).ToString('000') }
  $videoId = "$VideoIdPrefix-$suffix"
  if ($usedIds.ContainsKey($videoId)) { throw "Duplicate generated video id $videoId from $($item.name)." }
  $usedIds[$videoId] = $true

  $rows += [pscustomobject]@{
    id = $videoId
    title = $stem
    mediaPath = [string]$item.path
    thumbnailPath = if ($item.thumbnailPath) { [string]$item.thumbnailPath } else { $null }
    durationSeconds = if ($null -ne $item.durationSeconds) { [int][Math]::Round([double]$item.durationSeconds) } else { $null }
    sortOrder = $index + 1
    sizeBytes = [long]$item.sizeBytes
  }
}

$categorySql = @"
INSERT INTO categories (
  id, name, icon, image_url, tone, sort_order, is_active,
  created_at, updated_at, archived_at, daily_limit_seconds, series_type
)
VALUES (
  $(ConvertTo-SqlText $CategoryId), $(ConvertTo-SqlText $CategoryName), $(ConvertTo-SqlText $Icon), NULL,
  $(ConvertTo-SqlText $Tone), COALESCE((SELECT MAX(sort_order) + 1 FROM categories), 0), 1,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, $(ConvertTo-SqlText $SeriesType)
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  icon = excluded.icon,
  tone = excluded.tone,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP,
  archived_at = NULL,
  series_type = excluded.series_type;
"@

$replacementSql = if ($ReplaceCategoryVideos) {
@"
-- Preserve viewing history while removing the old category contents.
-- Videos used only by this category are archived instead of permanently deleted.
UPDATE videos
SET is_active = 0,
    archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT video_id FROM category_videos WHERE category_id = $(ConvertTo-SqlText $CategoryId))
  AND NOT EXISTS (
    SELECT 1 FROM category_videos other
    WHERE other.video_id = videos.id AND other.category_id <> $(ConvertTo-SqlText $CategoryId)
  );

DELETE FROM category_videos WHERE category_id = $(ConvertTo-SqlText $CategoryId);
"@
} else { "" }

$videoValues = @($rows | ForEach-Object {
  $duration = if ($null -eq $_.durationSeconds) { "NULL" } else { [string]$_.durationSeconds }
  "  ($(ConvertTo-SqlText $_.id), 'self_hosted', NULL, NULL, $(ConvertTo-SqlText $_.title), $(ConvertTo-SqlText $_.title), '', $duration, 'available', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, 'healthy', 'video', $(ConvertTo-SqlText $_.mediaPath), $(ConvertTo-SqlText $_.thumbnailPath))"
})

$videoStatements = @()
$batchSize = 25
for ($offset = 0; $offset -lt $videoValues.Count; $offset += $batchSize) {
  $lastIndex = [Math]::Min($offset + $batchSize - 1, $videoValues.Count - 1)
  $batchValues = @($videoValues[$offset..$lastIndex])
  $videoStatements += @"
INSERT INTO videos (
  id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
  thumbnail_url, duration_seconds, availability_status, metadata_error,
  is_active, created_at, updated_at, archived_at,
  health_status, media_type, media_path, thumbnail_path
)
VALUES
$($batchValues -join ",`n")
ON CONFLICT(id) DO UPDATE SET
  source = excluded.source,
  youtube_video_id = NULL,
  youtube_url = NULL,
  youtube_title = excluded.youtube_title,
  parent_label = excluded.parent_label,
  duration_seconds = COALESCE(excluded.duration_seconds, videos.duration_seconds),
  availability_status = 'available',
  metadata_error = NULL,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP,
  archived_at = NULL,
  health_status = 'healthy',
  media_type = 'video',
  media_path = excluded.media_path,
  thumbnail_path = excluded.thumbnail_path;
"@
}
$videosSql = $videoStatements -join "`n`n"

$mappingValues = @($rows | ForEach-Object {
  "  ($(ConvertTo-SqlText $CategoryId), $(ConvertTo-SqlText $_.id), $($_.sortOrder), CURRENT_TIMESTAMP)"
})
$mappingStatements = @()
for ($offset = 0; $offset -lt $mappingValues.Count; $offset += $batchSize) {
  $lastIndex = [Math]::Min($offset + $batchSize - 1, $mappingValues.Count - 1)
  $batchValues = @($mappingValues[$offset..$lastIndex])
  $mappingStatements += @"
INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
VALUES
$($batchValues -join ",`n")
ON CONFLICT(category_id, video_id) DO UPDATE SET
  sort_order = excluded.sort_order;
"@
}
$mappingSql = $mappingStatements -join "`n`n"

$sqlPath = Join-Path $resolvedOutput "import.sql"
$manifestPath = Join-Path $resolvedOutput "manifest.json"
@(
  "-- Generated local-media import. Private filenames: keep this artifact out of Git.",
  $categorySql,
  $replacementSql,
  $videosSql,
  $mappingSql
) | Set-Content -LiteralPath $sqlPath -Encoding utf8

[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  libraryFolder = $LibraryFolder
  categoryId = $CategoryId
  categoryName = $CategoryName
  seriesType = $SeriesType
  directVideoCount = $rows.Count
  excludedNestedVideoCount = $nestedCount
  thumbnailAtSeconds = $ThumbnailAtSeconds
  replacedCategoryVideos = [bool]$ReplaceCategoryVideos
  videos = $rows
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Host "Direct-child MP4 files: $($rows.Count)"
Write-Host "Nested MP4 files excluded: $nestedCount"
Write-Host "First: $($rows[0].id) / $($rows[0].title)"
Write-Host "Last: $($rows[-1].id) / $($rows[-1].title)"
Write-Host "Manifest: $manifestPath"
Write-Host "D1 SQL: $sqlPath"

if ($ApplyRemoteD1) {
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "npx is required." }
  New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
  $backupPath = Join-Path (Resolve-Path $BackupDirectory).Path ("before-import-{0}-{1}.sql" -f $CategoryId, (Get-Date -Format "yyyyMMdd-HHmmss"))
  Write-Host "Backing up remote D1 to $backupPath"
  & npx wrangler d1 export $DatabaseName --remote --output=$backupPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) { throw "Remote D1 backup failed." }

  Write-Host "Applying import to remote D1"
  & npx wrangler d1 execute $DatabaseName --remote --file=$sqlPath
  if ($LASTEXITCODE -ne 0) { throw "Remote D1 import failed." }
  Write-Host "D1 backup: $backupPath"
}
