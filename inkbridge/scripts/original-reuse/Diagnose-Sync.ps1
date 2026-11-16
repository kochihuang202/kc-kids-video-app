param([string]$LocalDirectory=(Join-Path $env:LOCALAPPDATA 'InkBridge'),[string]$OutputDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'
function Read-Json([string]$file){if(Test-Path -LiteralPath $file){try{return Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json}catch{return $null}}return $null}
$diagnosticProfile=Join-Path $LocalDirectory 'Profile'
$storage=Read-Json (Join-Path $diagnosticProfile 'storage-settings.json')
$sync=Read-Json (Join-Path $diagnosticProfile 'sync-settings.json')
$state=Read-Json (Join-Path $diagnosticProfile 'snapshot-state.json')
$exchange=$storage.exchangeDirectory
$errors=@();$running=@();$versions=@();$snapshots=@();$retentions=@()
try{
 foreach($p in @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'")){
  if(!$p.ExecutablePath){continue}
  $install=Split-Path (Split-Path $p.ExecutablePath -Parent) -Parent
  $manifest=Read-Json (Join-Path $install 'portable-build.json')
  if($manifest){$running+=@{pid=$p.ProcessId;install=$install;version=$manifest.version;buildId=$manifest.buildId;sequence=$manifest.releaseSequence}}
 }
}catch{$errors+='Cannot inspect running program: '+$_.Exception.Message}
if($exchange -and (Test-Path -LiteralPath $exchange)){
 foreach($w in @(Get-ChildItem -LiteralPath (Join-Path $exchange 'snapshots') -Directory -ErrorAction SilentlyContinue)){
  $r=Read-Json (Join-Path $w.FullName 'retention.json')
  if($r){$retentions+=@{workspaceId=$w.Name;format=$r.format;version=$r.version;anchor=$r.anchor;ancestors=@($r.ancestors);updatedAt=$r.updatedAt}}
  foreach($s in @(Get-ChildItem -LiteralPath $w.FullName -Directory)){
   $m=Read-Json (Join-Path $s.FullName 'manifest.json');$db=Join-Path $s.FullName 'database.sqlite3'
   if(!$m){$snapshots+=@{workspaceId=$w.Name;snapshotId=$s.Name;manifestAvailable=$false};continue}
   $missing=0;foreach($a in @($m.assets)){if($a.objectPath -and !(Test-Path -LiteralPath (Join-Path $exchange $a.objectPath))){$missing++}}
   $actual=$null;if(Test-Path -LiteralPath $db){$actual=(Get-Item -LiteralPath $db).Length}
   $snapshots+=@{workspaceId=$m.workspaceId;snapshotId=$m.snapshotId;parentSnapshotId=$m.parentSnapshotId;createdAt=$m.createdAt;revision=$m.revision;sourceComputerName=$m.sourceComputerName;manifestAvailable=$true;databaseExpectedBytes=$m.database.bytes;databaseActualBytes=$actual;assetCount=@($m.assets).Count;missingAssets=$missing}
  }
 }
 foreach($f in @(Get-ChildItem -LiteralPath $exchange -Filter 'InkBridge-update-*.json' -File)){
  try{$e=Read-Json $f.FullName;$m=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($e.payload))|ConvertFrom-Json;$zip=Join-Path $exchange $m.zip.name;$bytes=$null;if(Test-Path -LiteralPath $zip){$bytes=(Get-Item -LiteralPath $zip).Length};$versions+=@{releaseId=$m.releaseId;baseBuildId=$m.baseBuildId;targetBuildId=$m.targetBuildId;targetVersion=$m.targetVersion;sequence=$m.sequence;expectedBytes=$m.zip.bytes;actualBytes=$bytes}}catch{$errors+='Unreadable update descriptor: '+$f.Name}
 }
}
$outbox=@();foreach($d in @(Get-ChildItem -LiteralPath (Join-Path $LocalDirectory 'Outbox') -Directory -ErrorAction SilentlyContinue)){$m=Read-Json (Join-Path $d.FullName 'manifest.json');if($m){$outbox+=@{snapshotId=$m.snapshotId;workspaceId=$m.workspaceId;parentSnapshotId=$m.parentSnapshotId;revision=$m.revision;published=(Test-Path -LiteralPath (Join-Path $d.FullName 'published.json'))}}}
$report=@{format='inkbridge-sync-diagnostic';version=1;createdAt=[datetime]::UtcNow.ToString('o');computer=$env:COMPUTERNAME;localDirectory=$LocalDirectory;profileExists=(Test-Path -LiteralPath $diagnosticProfile);exchange=$exchange;pairedWorkspaceId=$sync.workspaceId;resolvedHeads=@($sync.resolvedHeads);heads=$state.heads;running=$running;snapshots=$snapshots;retentions=$retentions;updates=$versions;outbox=$outbox;errors=$errors}
$file=Join-Path $OutputDirectory ('InkBridge-sync-diagnostic-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json')
$report|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $file -Encoding UTF8
Write-Output 'Read-only diagnosis complete. No notes, settings or snapshots changed.'
Write-Output $file
