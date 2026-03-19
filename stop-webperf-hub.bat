@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo Stopping WebPerf Hub...
powershell -ExecutionPolicy Bypass -File "%ROOT%scripts\stop-dev.ps1"
