@echo off
setlocal
set PSModulePath=
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0Diagnose-Sync.ps1"
pause
