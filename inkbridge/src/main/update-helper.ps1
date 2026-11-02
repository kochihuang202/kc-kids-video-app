param([Parameter(Mandatory=$true)][string]$PlanFile,[ValidateSet('Stage','Apply','Recover')][string]$Mode='Stage')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$plan=Get-Content -LiteralPath $PlanFile -Raw -Encoding UTF8 | ConvertFrom-Json
$job=[IO.Path]::GetFullPath($plan.jobDirectory);$root=[IO.Path]::GetFullPath($plan.installRoot).TrimEnd('\')
if([IO.Path]::GetFullPath((Split-Path -Parent $PlanFile)) -ne $job){throw 'Job path mismatch'}
if($job.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Updater must run outside installation'}
if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse installation refused'}
$envelope=Get-Content -LiteralPath (Join-Path $job 'envelope.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$key=Get-Content -LiteralPath (Join-Path $job 'public.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider
$rsa.PersistKeyInCsp=$false
$parameters=New-Object Security.Cryptography.RSAParameters
$parameters.Modulus=[Convert]::FromBase64String($key.modulus);$parameters.Exponent=[Convert]::FromBase64String($key.exponent);$rsa.ImportParameters($parameters)
$payload=[Convert]::FromBase64String($envelope.payload)
if(-not $rsa.VerifyData($payload,[Security.Cryptography.SHA256]::Create(),[Convert]::FromBase64String($envelope.signature))){throw 'Invalid update signature'}
$m=[Text.Encoding]::UTF8.GetString($payload) | ConvertFrom-Json
if($m.format -ne 'inkbridge-update' -or $m.version -ne 1 -or $m.schemaVersion -ne 1 -or $m.baseBuildId -ne $plan.baseBuildId -or $m.targetBuildId -ne $plan.targetBuildId){throw 'Incompatible update'}
function Target([string]$relative){
 if($relative -notmatch '^(app/|runtime/|portable-build\.json$|\u4f7f\u7528\u8aaa\u660e\.txt$)' -or $relative -match '[:\\]' -or $relative -match '(^|/)(\.|\.\.|profiles|Profile|Workspace|files|Session|Recovery|Outbox|\.git)(/|$)' -or $relative -match '(^|/)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|/|$)' -or $relative -match '[. ](/|$)'){throw 'Unsafe update path'}
 $target=[IO.Path]::GetFullPath((Join-Path $root $relative));if(-not $target.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Update escaped root'}
 $part=$target;while($part -and $part -ne $root){if(Test-Path -LiteralPath $part){if((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse target refused'}};$part=Split-Path -Parent $part}
 return $target
}
function Hash([string]$file){if(-not (Test-Path -LiteralPath $file -PathType Leaf)){return $null};return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
function WriteJson([string]$file,$value){$temp=$file+'.tmp';$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 30));$stream=New-Object IO.FileStream($temp,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()};if(Test-Path -LiteralPath $file){[IO.File]::Replace($temp,$file,[NullString]::Value)}else{[IO.File]::Move($temp,$file)}}
$stage=Join-Path $job 'staged';$backup=Join-Path $job 'backup';$journal=Join-Path $job 'journal.json'
$files=@{};foreach($f in $m.files){$null=Target $f.path;if($files.ContainsKey($f.path)){throw 'Duplicate update path'};$files[$f.path]=$f}
function Rollback {
 if(-not(Test-Path -LiteralPath $journal)){return};$state=Get-Content -LiteralPath $journal -Raw -Encoding UTF8|ConvertFrom-Json
 if($state.phase -eq 'healthy'){return}
 foreach($item in @($state.applied)[($state.applied.Count-1)..0]){if(-not $item){continue};$target=Target $item.path;$old=Join-Path $backup $item.path
   if(Test-Path -LiteralPath $old){if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force};[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Move($old,$target)}elseif(-not $item.existed -and (Test-Path -LiteralPath $target)){Remove-Item -LiteralPath $target -Force}
 };WriteJson $journal @{phase='rolled-back';applied=@()}
}
function Launch {
 $env:INKBRIDGE_UPDATE_IN_PROGRESS=$job
 $env:INKBRIDGE_UPDATE_HEALTH_FILE=$plan.healthFile
 $env:INKBRIDGE_EXPECTED_BUILD=$plan.targetBuildId
 return Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c','Start-InkBridge.bat') -WorkingDirectory $root -WindowStyle Hidden -PassThru
}
if($Mode -eq 'Recover'){Rollback;exit 0}
if($Mode -eq 'Stage'){
 if((Hash $plan.zip) -ne $m.zip.sha256){throw 'ZIP hash mismatch'}
 [IO.Directory]::CreateDirectory($stage)|Out-Null
 $archive=[IO.Compression.ZipFile]::OpenRead($plan.zip);$seen=@{}
 try{foreach($entry in $archive.Entries){$name=$entry.FullName;$null=Target $name;if($seen.ContainsKey($name) -or -not $files.ContainsKey($name) -or -not $files[$name].sha256 -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Unexpected ZIP entry'};$seen[$name]=$true
   $dest=Join-Path $stage $name;[IO.Directory]::CreateDirectory((Split-Path -Parent $dest))|Out-Null
   $input=$entry.Open();$output=New-Object IO.FileStream($dest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   try{$input.CopyTo($output);$output.Flush($true)}finally{$input.Dispose();$output.Dispose()}
   if((Hash $dest) -ne $files[$name].sha256){throw 'Extracted file hash mismatch'}
 };foreach($f in $m.files){if($f.sha256 -and -not $seen.ContainsKey($f.path)){throw 'Missing ZIP entry'}}}finally{$archive.Dispose()}
 $targetManifest=Get-Content -LiteralPath (Join-Path $stage 'portable-build.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 if($targetManifest.buildId -ne $m.targetBuildId){throw 'Target build manifest mismatch'}
 WriteJson (Join-Path $job 'stage-ready.json') @{ready=$true};exit 0
}
if(-not(Test-Path -LiteralPath (Join-Path $job 'stage-ready.json'))){throw 'Package has not been staged'}
if($plan.parentPid -gt 0){$parentProcess=Get-Process -Id $plan.parentPid -ErrorAction SilentlyContinue;if($parentProcess){if(-not $parentProcess.WaitForExit(60000)){throw 'InkBridge did not exit'}}}
$applied=New-Object Collections.ArrayList
try{
 foreach($f in $m.files){$target=Target $f.path;if((Hash $target) -ne $f.oldSha256){throw 'Installed file changed before update'};if($f.sha256 -and (Hash (Join-Path $stage $f.path)) -ne $f.sha256){throw 'Staged package changed'}}
 foreach($f in $m.files){$target=Target $f.path;$old=Join-Path $backup $f.path;$existed=Test-Path -LiteralPath $target
   [void]$applied.Add(@{path=$f.path;existed=$existed});WriteJson $journal @{phase='applying';applied=@($applied)}
   if($existed){[IO.Directory]::CreateDirectory((Split-Path -Parent $old))|Out-Null;[IO.File]::Move($target,$old)}
   if($f.sha256){[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Move((Join-Path $stage $f.path),$target)}
 }
 $started=Launch;$healthy=$false;$timeout=90;if($plan.healthTimeoutSeconds -and $plan.healthTimeoutSeconds -ge 1 -and $plan.healthTimeoutSeconds -le 90){$timeout=$plan.healthTimeoutSeconds};$deadline=[DateTime]::UtcNow.AddSeconds($timeout)
 while([DateTime]::UtcNow -lt $deadline){if(Test-Path -LiteralPath $plan.healthFile){try{$health=Get-Content -LiteralPath $plan.healthFile -Raw -Encoding UTF8|ConvertFrom-Json;if($health.ready -and $health.buildId -eq $plan.targetBuildId){$healthy=$true;break}}catch{}};Start-Sleep -Milliseconds 250}
 if(-not $healthy){if(-not $started.HasExited){& "$env:SystemRoot\System32\taskkill.exe" /PID $started.Id /T /F | Out-Null};throw 'Updated InkBridge did not become healthy'}
 WriteJson $journal @{phase='healthy';applied=@($applied)};WriteJson (Join-Path $job 'result.json') @{success=$true;targetBuildId=$plan.targetBuildId}
}catch{$failure=$_.Exception.Message;Rollback;WriteJson (Join-Path $job 'result.json') @{success=$false;message=$failure};$env:INKBRIDGE_UPDATE_HEALTH_FILE='';Launch | Out-Null;exit 1}
