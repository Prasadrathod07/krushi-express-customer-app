# How to Start Customer App V2

## Problem
Metro bundler file watcher fails on Windows with:
```
Error: UNKNOWN: unknown error, watch
```

## Solution: Use Polling Script

### Option 1: PowerShell Script (Recommended)
```powershell
.\start-with-polling.ps1
```

### Option 2: Manual Environment Variable
```powershell
$env:CHOKIDAR_USEPOLLING = "true"
$env:CHOKIDAR_INTERVAL = "1000"
npx expo start
```

### Option 3: Use npm start with environment variable
```powershell
$env:CHOKIDAR_USEPOLLING = "true"
npm start
```

## Why This Works

- Native file watching on Windows network drives (Y:) is unreliable
- Polling checks for changes at intervals (every 1000ms)
- Slightly slower but much more reliable

## Quick Start

Just run:
```powershell
.\start-with-polling.ps1
```

This will start Expo with polling enabled automatically.


