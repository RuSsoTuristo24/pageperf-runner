@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo Starting WebPerf Hub...
powershell -ExecutionPolicy Bypass -File "%ROOT%scripts\start-dev.ps1"

echo Waiting for UI boot...
timeout /t 3 /nobreak >nul

start "" http://127.0.0.1:4173/

echo WebPerf Hub is opening in your browser.
