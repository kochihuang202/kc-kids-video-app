@echo off
setlocal
set PSModulePath=
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0Diagnose-Sync.ps1"
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\..\runtime\electron.exe" "%~dp0sync-read-diagnostic.cjs"
pause
