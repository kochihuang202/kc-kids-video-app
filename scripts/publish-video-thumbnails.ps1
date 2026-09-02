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
  [int]$Limit = 0,
  [int]$MaxAttempts = 3,
  [int]$ProgressEvery = 10,
  [switch]$Force,
  [switch]$SkipGenerate,
  [switch]$SkipUpload,
  [switch]$ApplyRemoteD1
)

$ErrorActionPreference = "Stop"

if ($TimestampSeconds -lt 0) { throw "TimestampSeconds must be zero or greater." }
if ($Limit -lt 0) { throw "Limit must be zero or greater." }
if ($MaxAttempts -lt 1 -or $MaxAttempts -gt 10) { throw "MaxAttempts must be between 1 and 10." }
if ($ProgressEvery -lt 1) { throw "ProgressEvery must be one or greater." }
if ($ApplyRemoteD1 -and $Limit -gt 0) { throw "ApplyRemoteD1 cannot be used with Limit." }
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

function Invoke-WithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      & $Action
      return
    } catch {
      if ($attempt -eq $MaxAttempts) { throw }
      $delay = [Math]::Min(20, [Math]::Pow(2, $attempt))
      Write-Warning "$Label failed (attempt $attempt/$MaxAttempts). Retrying in ${delay}s."
      Start-Sleep -Seconds $delay
    }
  }
}

function Write-ProgressState {
  param(
    [Parameter(Mandatory = $true)][string]$Status,
    [Parameter(Mandatory = $true)][int]$CompletedCount,
    [Parameter(Mandatory = $true)][int]$TotalCount,
    [string]$LastCompletedId = "",
    [string]$ErrorMessage = ""
  )
  $tempPath = "$progressPath.tmp"
  [pscustomobject]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    status = $Status
    categoryId = $CategoryId
    completedCount = $CompletedCount
    totalCount = $TotalCount
    lastCompletedId = $LastCompletedId
    error = $ErrorMessage
  } | ConvertTo-Json | Set-Content -LiteralPath $tempPath -Encoding utf8
  Move-Item -LiteralPath $tempPath -Destination $progressPath -Force
}

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
if ($Limit -gt 0) { $videos = @($videos | Select-Object -First $Limit) }

$journalPath = Join-Path $resolvedOutput "completed.jsonl"
$progressPath = Join-Path $resolvedOutput "progress.json"
$completed = @{}
if ((Test-Path -LiteralPath $journalPath) -and -not $Force) {
  foreach ($line in Get-Content -LiteralPath $journalPath) {
    if (-not $line.Trim()) { continue }
    try {
      $entry = $line | ConvertFrom-Json
      if ($entry.categoryId -eq $CategoryId -and $entry.bucketName -eq $BucketName -and
          $entry.r2Prefix -eq $R2Prefix.Trim('/') -and [int]$entry.timestampSeconds -eq $TimestampSeconds) {
        $completed[[string]$entry.id] = $entry
      }
    } catch {
      Write-Warning "Ignoring an invalid progress journal line."
    }
  }
}
Write-Host "Videos selected: $($videos.Count). Resumable uploads found: $($completed.Count)."
Write-ProgressState -Status "running" -CompletedCount 0 -TotalCount $videos.Count

$results = @()
$sqlCases = @()
$sqlIds = @()
$processedCount = 0
try {
foreach ($video in $videos) {
  $id = [string]$video.id
  if ($id -notmatch '^[A-Za-z0-9_-]+$') { throw "Unsafe video id: $id" }
  $second = if ($timestampMap.ContainsKey($id)) { [int]$timestampMap[$id] } else { $TimestampSeconds }
  if ($second -lt 0) { throw "Timestamp for $id must be zero or greater." }

  $outputFile = Join-Path $resolvedOutput "$id.webp"
  $r2Key = "$($R2Prefix.Trim('/'))/$id.webp"
  $publicUrl = "/api/media/$r2Key"

  $completedEntry = $completed[$id]
  $alreadyComplete = $completedEntry -and (Test-Path -LiteralPath $outputFile)

  if (-not $alreadyComplete -and -not $SkipGenerate -and ($Force -or -not (Test-Path -LiteralPath $outputFile))) {
    Invoke-WithRetry -Label "Capture $id" -Action {
      $toolOutput = & $ffmpegPath -hide_banner -loglevel error -ss $second -i ([string]$video.mediaUrl) `
        -frames:v 1 -vf "scale=640:-2:flags=lanczos" -c:v libwebp -quality 80 -y $outputFile 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) {
        throw "ffmpeg failed for $id. $toolOutput"
      }
    }
  } elseif (-not (Test-Path -LiteralPath $outputFile)) {
    throw "Missing generated file: $outputFile"
  }

  if (-not $alreadyComplete -and -not $SkipUpload) {
    Invoke-WithRetry -Label "Upload $id" -Action {
      $toolOutput = & npx wrangler r2 object put "$BucketName/$r2Key" --remote --file=$outputFile `
        --content-type=image/webp --cache-control="public, max-age=31536000, immutable" --force 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw "R2 upload failed for $id. $toolOutput" }
    }
    [pscustomobject]@{
      completedAt = (Get-Date).ToUniversalTime().ToString("o")
      categoryId = $CategoryId
      id = $id
      timestampSeconds = $second
      bucketName = $BucketName
      r2Prefix = $R2Prefix.Trim('/')
      r2Key = $r2Key
    } | ConvertTo-Json -Compress | Add-Content -LiteralPath $journalPath -Encoding utf8
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
  $processedCount++
  Write-ProgressState -Status "running" -CompletedCount $processedCount -TotalCount $videos.Count -LastCompletedId $id
  if (($processedCount % $ProgressEvery) -eq 0 -or $processedCount -eq $videos.Count) {
    Write-Host ("[progress] {0}/{1} completed; last={2}" -f $processedCount, $videos.Count, $id)
  }
}
} catch {
  Write-ProgressState -Status "failed" -CompletedCount $processedCount -TotalCount $videos.Count `
    -LastCompletedId $(if ($processedCount -gt 0) { [string]$results[-1].id } else { "" }) -ErrorMessage $_.Exception.Message
  throw
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

Write-ProgressState -Status "completed" -CompletedCount $results.Count -TotalCount $videos.Count `
  -LastCompletedId $(if ($results.Count -gt 0) { [string]$results[-1].id } else { "" })

Write-Host "Completed $($results.Count) thumbnails."
Write-Host "Manifest: $manifestPath"
Write-Host "D1 SQL: $sqlPath"
