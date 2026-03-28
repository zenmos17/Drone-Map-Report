@echo off
cd /d "%~dp0"

set "PORT=3333"
set "PID="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  set "PID=%%P"
  goto :already_running
)

echo Starting Drone-Map server on port %PORT%...
node backend\server.js
goto :end

:already_running
echo.
echo Server is already running on port %PORT% (PID: %PID%).
echo Open http://localhost:%PORT%
start "" http://localhost:%PORT%

:end
echo.
echo Press any key to close this window.
pause >nul
