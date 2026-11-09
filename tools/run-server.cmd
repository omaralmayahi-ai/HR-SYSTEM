@echo off
rem HR SYSTEM - server runner used by the "HRSystem" startup task.
rem Runs the built server in production mode and restarts it automatically if it stops.
cd /d "%~dp0.."
set "NODE_EXE=%~1"
if "%NODE_EXE%"=="" set "NODE_EXE=node"
set NODE_ENV=production
if not exist logs mkdir logs
:loop
rem keep the log small: above 20 MB the old log is kept as server.old.log
for %%F in (logs\server.log) do if %%~zF GTR 20971520 move /y logs\server.log logs\server.old.log >nul
echo [%date% %time%] server starting>> logs\server.log
"%NODE_EXE%" dist\server.cjs >> logs\server.log 2>&1
echo [%date% %time%] server stopped, restarting in 5 seconds>> logs\server.log
ping -n 6 127.0.0.1 > nul
goto loop
