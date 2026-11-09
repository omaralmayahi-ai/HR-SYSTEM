@echo off
setlocal EnableExtensions
rem =====================================================================
rem  HR-SYSTEM control panel launcher
rem  Double-click            : opens the Arabic control panel (asks for Administrator).
rem  control-app.bat <cmd>   : runs one command without the window, e.g.
rem      control-app.bat status        (no admin needed)
rem      control-app.bat restart       (run the console "as administrator")
rem      control-app.bat backup -Yes   (-Yes answers confirmations automatically)
rem  Commands: status start stop restart build backup update migrate dbstatus dbreport localdiff logs help
rem  Exit codes: 0 ok, 1 failed, 2 needs administrator, 3 system not running (status)
rem =====================================================================
cd /d "%~dp0"

rem Refuse to run from inside a ZIP preview or a temp folder (files would not be found or kept).
echo %~dp0 | findstr /i /c:"\AppData\Local\Temp\" >nul && (
  echo Extract the HR-SYSTEM folder from the ZIP file first, then run control-app.bat from it.
  pause
  exit /b 1
)

set "PANEL=%~dp0tools\control-app.ps1"
if not exist "%PANEL%" (
  echo tools\control-app.ps1 not found. Re-download the system or restore the tools folder.
  pause
  exit /b 1
)

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

if "%~1"=="" goto gui

rem ---- command-line mode: output in this console, exit code returned ----
chcp 65001 >nul
set "ACTION=%~1"
shift
set "EXTRA="
:collect
if "%~1"=="" goto run
set "EXTRA=%EXTRA% %1"
shift
goto collect
:run
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%PANEL%" -Action %ACTION% %EXTRA%
exit /b %ERRORLEVEL%

:gui
rem ---- window mode: the panel elevates itself and runs hidden ----
start "" "%PS%" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%PANEL%"
exit /b 0
