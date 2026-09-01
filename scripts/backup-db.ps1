# scripts/backup-db.ps1 - Cloudflare D1 database backup script
param(
  [string]$DatabaseName = "kc-kids-video-app-db",
  [string]$OutputDir = "backups"
)

$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
if (!(Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$outputFile = Join-Path $OutputDir "backup-$timestamp.sql"
Write-Host "Creating D1 backup for $DatabaseName into $outputFile..."

# Export D1 schema and data using wrangler d1 export
npx wrangler d1 export $DatabaseName --output $outputFile

if (Test-Path $outputFile) {
  $size = (Get-Item $outputFile).Length
  Write-Host "Backup successfully created: $outputFile ($size bytes)"
} else {
  Write-Error "Backup file was not created."
}
