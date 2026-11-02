param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
$active=Join-Path $env:LOCALAPPDATA 'InkBridge\Updater\active.json'
if(-not(Test-Path -LiteralPath $active)){exit 0}
$record=Get-Content -LiteralPath $active -Raw -Encoding UTF8|ConvertFrom-Json
if([IO.Path]::GetFullPath($record.installRoot).TrimEnd('\') -ne [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')){exit 0}
if($env:INKBRIDGE_UPDATE_IN_PROGRESS -eq $record.jobDirectory){exit 0}
$jobs=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'InkBridge\Updater')).TrimEnd('\')
$job=[IO.Path]::GetFullPath($record.jobDirectory)
if(-not $job.StartsWith($jobs+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Update recovery path invalid'}
& (Join-Path $job 'helper.ps1') -PlanFile (Join-Path $job 'plan.json') -Mode Recover
exit $LASTEXITCODE
