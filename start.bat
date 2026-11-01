@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install --no-audit --no-fund
)
if not exist dist\index.html (
  echo Building app, please wait...
  call npm run build
)
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8787'"
node server/index.mjs
