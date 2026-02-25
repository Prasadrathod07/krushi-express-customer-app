@echo off
echo Starting Expo with polling enabled for file watching...
set CHOKIDAR_USEPOLLING=true
set CHOKIDAR_INTERVAL=1000
npx expo start


