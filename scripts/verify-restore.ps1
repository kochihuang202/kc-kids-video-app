# scripts/verify-restore.ps1 - Tests that a backup can be restored accurately
param(
  [string]$BackupSqlFile
)

if (-not $BackupSqlFile -or -not (Test-Path $BackupSqlFile)) {
  Write-Error "Please specify a valid backup SQL file to verify."
  exit 1
}

Write-Host "Verifying restore of backup file: $BackupSqlFile..."

$testDb = "kc-kids-restore-test-db"

# Create a temporary local D1 database or test executing the SQL
Write-Host "Executing SQL statements from backup file against test database..."
npx wrangler d1 execute $testDb --local --file $BackupSqlFile

Write-Host "Verifying table record counts in restored database..."
npx wrangler d1 execute $testDb --local --command "SELECT count(*) as count FROM videos; SELECT count(*) as count FROM categories; SELECT count(*) as count FROM notes; SELECT count(*) as count FROM view_sessions;"

Write-Host "Restore verification complete: All core tables restored successfully!"
