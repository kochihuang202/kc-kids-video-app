param(
  [Parameter(Mandatory = $true)]
  [string]$CategoryId,
  [int]$TimestampSeconds = 640,
  [string]$TimestampMapPath = "",
  [string]$AppOrigin = "https://kc-kids-video-app.ji3cp31p4.workers.dev",
  [string]$BucketName = "kc-kids-video-app-assets",
  [string]$R2Prefix = "thumbnails/quanling",
  [string]$DatabaseName = "kc-kids-video-app-db",
  [string]$OutputDirectory = "",
  [string]$BackupDirectory = "",
  [switch]$SkipGenerate,
  [switch]$SkipUpload,
  [switch]$ApplyRemoteD1
)

$ErrorActionPreference = "Stop"

if ($TimestampSeconds -lt 0) { throw "TimestampSeconds must be zero or greater." }
if ($R2Prefix -notmatch '^[A-Za-z0-9/_-]+$' -or $R2Prefix.Contains("..")) {
  throw "R2Prefix may contain only letters, numbers, slash, underscore, and dash."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot "artifacts\r2-thumbnails"
}
if (-not $BackupDirectory) {
  $BackupDirectory = Join-Path $repoRoot "backups"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$resolvedOutput = (Resolve-Path $OutputDirectory).Path

$systemFfmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$bundledFfmpeg = Join-Path $repoRoot "node_modules\ffmpeg-static\ffmpeg.exe"
$ffmpegPath = if ($systemFfmpeg) { $systemFfmpeg.Source } elseif (Test-Path -LiteralPath $bundledFfmpeg) { $bundledFfmpeg } else { $null }
if (-not $ffmpegPath) { throw "ffmpeg is required. Run npm install first to restore the bundled ffmpeg-static binary." }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "npx is required." }
Write-Host "Using FFmpeg: $ffmpegPath"

$timestampMap = @{}
if ($TimestampMapPath) {
  $map = Get-Content -LiteralPath $TimestampMapPath -Raw | ConvertFrom-Json
  foreach ($property in $map.PSObject.Properties) {
    $timestampMap[$property.Name] = [int]$property.Value
  }
}

$encodedCategory = [Uri]::EscapeDataString($CategoryId)
$contentUrl = "$($AppOrigin.TrimEnd('/'))/api/content/categories/$encodedCategory/videos"
Write-Host "Reading category: $CategoryId"
$videos = @(Invoke-RestMethod -Uri $contentUrl -Method Get) | Where-Object {
  $_.source -eq "self_hosted" -and $_.mediaUrl
}
if ($videos.Count -eq 0) { throw "No self-hosted videos were returned for this category." }

$results = @()
$sqlCases = @()
$sqlIds = @()
foreach ($video in $videos) {
  $id = [string]$video.id
  if ($id -notmatch '^[A-Za-z0-9_-]+$') { throw "Unsafe video id: $id" }
  $second = if ($timestampMap.ContainsKey($id)) { [int]$timestampMap[$id] } else { $TimestampSeconds }
  if ($second -lt 0) { throw "Timestamp for $id must be zero or greater." }

  $outputFile = Join-Path $resolvedOutput "$id.webp"
  $r2Key = "$($R2Prefix.Trim('/'))/$id.webp"
  $publicUrl = "/api/media/$r2Key"

  if (-not $SkipGenerate) {
    Write-Host "[$id] capture at ${second}s"
    & $ffmpegPath -hide_banner -loglevel error -ss $second -i ([string]$video.mediaUrl) `
      -frames:v 1 -vf "scale=640:-2:flags=lanczos" -c:v libwebp -quality 80 -y $outputFile
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) {
      throw "ffmpeg failed for $id."
    }
  } elseif (-not (Test-Path -LiteralPath $outputFile)) {
    throw "Missing generated file: $outputFile"
  }

  if (-not $SkipUpload) {
    Write-Host "[$id] upload r2://$BucketName/$r2Key"
    & npx wrangler r2 object put "$BucketName/$r2Key" --remote --file=$outputFile `
      --content-type=image/webp --cache-control="public, max-age=31536000, immutable" --force
    if ($LASTEXITCODE -ne 0) { throw "R2 upload failed for $id." }
  }

  $sqlCases += "  WHEN '$id' THEN '$publicUrl'"
  $sqlIds += "'$id'"
  $results += [pscustomobject]@{
    id = $id
    timestampSeconds = $second
    sourceUrl = [string]$video.mediaUrl
    outputFile = $outputFile
    r2Key = $r2Key
    thumbnailUrl = $publicUrl
  }
}
$sqlLines = @(
  "UPDATE videos",
  "SET thumbnail_url = CASE id",
  $sqlCases,
  "  ELSE thumbnail_url",
  "END,",
  "updated_at = CURRENT_TIMESTAMP",
  "WHERE id IN ($($sqlIds -join ', '));"
)

$sqlPath = Join-Path $resolvedOutput "update-thumbnail-urls.sql"
$manifestPath = Join-Path $resolvedOutput "thumbnail-manifest.json"
$sqlLines | Set-Content -LiteralPath $sqlPath -Encoding utf8
[pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  categoryId = $CategoryId
  defaultTimestampSeconds = $TimestampSeconds
  bucketName = $BucketName
  r2Prefix = $R2Prefix
  videos = $results
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8

if ($ApplyRemoteD1) {
  New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
  $backupPath = Join-Path (Resolve-Path $BackupDirectory).Path ("before-thumbnails-{0}.sql" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  Write-Host "Backing up remote D1 to $backupPath"
  & npx wrangler d1 export $DatabaseName --remote --output=$backupPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) { throw "Remote D1 backup failed." }

  Write-Host "Applying thumbnail URLs to remote D1"
  & npx wrangler d1 execute $DatabaseName --remote --file=$sqlPath
  if ($LASTEXITCODE -ne 0) { throw "Remote D1 update failed." }
  Write-Host "D1 backup: $backupPath"
}

Write-Host "Completed $($results.Count) thumbnails."
Write-Host "Manifest: $manifestPath"
Write-Host "D1 SQL: $sqlPath"
