param([switch]$NoLaunch)
$ErrorActionPreference='Stop'
$metadataPath=[IO.Path]::ChangeExtension($PSCommandPath,'.json')
$package=Get-Content -LiteralPath $metadataPath -Raw -Encoding UTF8|ConvertFrom-Json
if($package.format -ne 'inkbridge-local-launcher' -or $package.version -ne 1 -or
   $package.zipName -notmatch '^[A-Za-z0-9._-]+\.zip$' -or
   $package.packageFolder -notmatch '^InkBridge-[A-Za-z0-9._-]+$' -or
   $package.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid launcher package descriptor'}
if(-not $env:LOCALAPPDATA){throw 'LOCALAPPDATA is not available'}
$installBase=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\InkBridge'))
$target=Join-Path $installBase $package.packageFolder
$start=Join-Path $target 'Start-InkBridge.bat'
# A later signed program update may have advanced this installation. Never
# replace an existing usable installation with this older bootstrap package.
if(-not(Test-Path -LiteralPath $start)){
 $zip=Join-Path $PSScriptRoot $package.zipName
 if(-not(Test-Path -LiteralPath $zip)){throw 'The InkBridge ZIP has not arrived. Wait for OneDrive and try again.'}
 Write-Host 'Preparing InkBridge on this computer. This is needed only once...'
 if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.sha256){throw 'The InkBridge ZIP is incomplete or damaged. Wait for OneDrive and try again.'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive=[IO.Compression.ZipFile]::OpenRead($zip)
 try{
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach($entry in $archive.Entries){
   $name=$entry.FullName.Replace('\','/').TrimEnd('/')
   if(-not $name){continue}
   $parts=$name.Split('/')
   if($parts[0] -ne $package.packageFolder -or $parts -contains '..' -or $parts -contains '.' -or $name.Contains(':') -or $name.StartsWith('/') -or -not $seen.Add($name)){throw 'Unsafe ZIP entry'}
   if((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'ZIP symlinks are not permitted'}
  }
 }finally{$archive.Dispose()}
 New-Item -ItemType Directory -Path $installBase -Force|Out-Null
 $stage=[IO.Path]::GetFullPath((Join-Path $installBase ('.pending-'+[Guid]::NewGuid().ToString('N').Substring(0,8))))
 try{
  # Strip only the already validated single archive root. Direct byte streams
  # avoid PowerShell5 Expand-Archive wildcard/long-path issues with [locale].
  $archive=[IO.Compression.ZipFile]::OpenRead($zip)
  try{foreach($entry in $archive.Entries){
   $name=$entry.FullName.Replace('\','/');$relative=$name.Substring($package.packageFolder.Length).TrimStart('/')
   if(-not $relative){continue}
   $destination=[IO.Path]::GetFullPath((Join-Path $stage $relative))
   if(-not $destination.StartsWith($stage+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'ZIP path escapes stage'}
   if($name.EndsWith('/')){[IO.Directory]::CreateDirectory($destination)|Out-Null;continue}
   [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))|Out-Null
   $entryStream=$entry.Open();$fileStream=[IO.File]::Open($destination,[IO.FileMode]::CreateNew)
   try{$entryStream.CopyTo($fileStream,65536);$fileStream.Flush($true)}finally{$fileStream.Dispose();$entryStream.Dispose()}
  }}finally{$archive.Dispose()}
  Write-Host 'Verifying extracted program files...'
  $extracted=$stage
  $manifest=Get-Content -LiteralPath (Join-Path $extracted 'portable-build.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($manifest.buildId -ne $package.buildId -or $manifest.format -ne 'inkbridge-private-portable'){throw 'Unexpected portable build'}
  foreach($file in $manifest.files){
   $full=[IO.Path]::GetFullPath((Join-Path $extracted $file.path))
   if(-not $full.StartsWith($extracted+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Manifest path escapes installation'}
   if((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw 'Portable file integrity failure'}
  }
  if(Test-Path -LiteralPath $target){throw 'An incomplete installation already exists; preserve it for inspection.'}
  [IO.Directory]::Move($extracted,$target)
  Write-Host 'InkBridge is ready.'
 }finally{
  # Recursive cleanup is restricted to this install's own freshly created stage.
  if($stage.StartsWith($installBase+'\.pending-',[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stage)){Remove-Item -LiteralPath $stage -Recurse -Force}
 }
}
if(-not(Test-Path -LiteralPath $start)){throw 'InkBridge launcher is missing'}
if($NoLaunch){Write-Output $start;exit 0}
Start-Process -FilePath $start -WorkingDirectory $target -WindowStyle Hidden
