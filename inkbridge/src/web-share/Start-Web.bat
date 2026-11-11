@echo off
setlocal
cd /d "%~dp0"
node serve.cjs
if errorlevel 1 pause
