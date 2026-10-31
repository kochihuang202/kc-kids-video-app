@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to start this source version.
  pause
  exit /b 1
)
if not exist "node_modules\electron\package.json" (
  echo InkBridge dependencies are missing. Run npm ci in this folder first.
  pause
  exit /b 1
)
if not exist "private-original-editor\register-original.js" (
  echo Original module sources have not been prepared in this folder.
  pause
  exit /b 1
)
node scripts\original-reuse\start.cjs
if errorlevel 1 (
  echo InkBridge did not exit successfully. See the error above.
  pause
  exit /b 1
)
endlocal
