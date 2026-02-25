# Start Expo with polling enabled for file watching
# This fixes "UNKNOWN: unknown error, watch" on Windows/network drives

$env:CHOKIDAR_USEPOLLING = "true"
$env:CHOKIDAR_INTERVAL = "1000"

Write-Host "Starting Expo with polling-based file watching..." -ForegroundColor Cyan
Write-Host "This is slower but more reliable on Windows/network drives" -ForegroundColor Yellow
Write-Host ""

npx expo start



