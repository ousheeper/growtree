@echo off
setlocal
cd /d "%~dp0"

rem clear this so Electron does not start in Node mode
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON=node_modules\electron\dist\electron.exe"

if exist "%ELECTRON%" goto run

echo [1/2] Electron runtime not found, installing dependencies...
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
call npm install --no-audit --no-fund
if exist "%ELECTRON%" goto run

echo.
echo [X] Install failed.
echo     Make sure Node.js is installed ^(run: node -v^), then try: npm install
echo.
pause
exit /b 1

:run
echo [2/2] Starting Desktop Grow Tree...
start "" "%ELECTRON%" .
exit /b 0
