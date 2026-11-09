@echo off
rem HR SYSTEM (Iraqi HR Management System) - control panel launcher (opens the Arabic control panel window).
cd /d "%~dp0"
if not exist "%~dp0tools\control-app.ps1" (
  echo tools\control-app.ps1 not found.
  pause
  exit /b 1
)
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0tools\control-app.ps1" %*
