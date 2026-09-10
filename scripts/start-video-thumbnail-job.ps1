param(
  [Parameter(Mandatory = $true)]
  [string]$CategoryId,
  [Parameter(Mandatory = $true)]
  [string]$R2Prefix,
  [string]$VideoIdPrefix = "",
  [int]$TimestampSeconds = 3,
  [string]$OutputDirectory = "",
  [switch]$ApplyRemoteD1
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutputDirectory) {
  $safeJobName = if ($VideoIdPrefix) { $VideoIdPrefix } else { $CategoryId }
  $OutputDirectory = Join-Path $repoRoot "artifacts\r2-thumbnails\$safeJobName"
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$resolvedOutput = (Resolve-Path $OutputDirectory).Path

$workerScript = Join-Path $PSScriptRoot "publish-video-thumbnails.ps1"
$progressScript = Join-Path $PSScriptRoot "show-thumbnail-progress.ps1"
$progressPath = Join-Path $resolvedOutput "progress.json"
$stdoutPath = Join-Path $resolvedOutput "worker-output.log"
$stderrPath = Join-Path $resolvedOutput "worker-error.log"

$workerArguments = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $workerScript,
  "-CategoryId", $CategoryId,
  "-TimestampSeconds", [string]$TimestampSeconds,
  "-R2Prefix", $R2Prefix,
  "-OutputDirectory", $resolvedOutput
)
if ($VideoIdPrefix) { $workerArguments += @("-VideoIdPrefix", $VideoIdPrefix) }
if ($ApplyRemoteD1) { $workerArguments += "-ApplyRemoteD1" }

$worker = Start-Process -FilePath "powershell.exe" -ArgumentList $workerArguments -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

$progressArguments = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $progressScript,
  "-ProgressPath", $progressPath,
  "-WorkerProcessId", [string]$worker.Id
)
Start-Process -FilePath "powershell.exe" -ArgumentList $progressArguments -WindowStyle Normal | Out-Null

Write-Host "Thumbnail worker started (PID $($worker.Id))."
Write-Host "The progress window runs independently and does not consume Codex usage."
Write-Host "Progress: $progressPath"
Write-Host "Output log: $stdoutPath"
Write-Host "Error log: $stderrPath"
