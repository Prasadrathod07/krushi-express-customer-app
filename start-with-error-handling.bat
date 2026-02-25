@echo off
echo Starting Expo with error handling...
echo If file watcher fails, you can still use the app by pressing 'r' to reload manually.
echo.

REM Set environment variables
set CHOKIDAR_USEPOLLING=true
set CHOKIDAR_INTERVAL=1000

REM Start Expo and catch errors
npx expo start 2>&1 | findstr /V "UNKNOWN.*watch" || (
    echo.
    echo NOTE: File watcher error occurred but Metro should continue.
    echo Press 'r' in the terminal to manually reload when you make changes.
    echo.
    npx expo start
)


