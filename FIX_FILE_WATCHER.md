# Fix Metro File Watcher Error - Customer App V2

## Problem
```
Error: UNKNOWN: unknown error, watch
```

This happens on Windows network drives (Y:) because native file watching doesn't work reliably.

## Solutions (Try in order)

### Solution 1: Use start.bat (Easiest)
```powershell
.\start.bat
```

This batch file sets the environment variables and starts Expo.

### Solution 2: Use npm start (Now configured)
The `package.json` has been updated so `npm start` automatically uses polling:
```powershell
npm start
```

### Solution 3: Manual Environment Variable
Set environment variables in the same PowerShell session:
```powershell
$env:CHOKIDAR_USEPOLLING = "true"
$env:CHOKIDAR_INTERVAL = "1000"
npx expo start
```

### Solution 4: Increase Windows File Watcher Limit
Run PowerShell as Administrator:
```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers" -Value 524288 -PropertyType DWORD -Force
```
Then restart your computer.

### Solution 5: Move Project to Local Drive
If possible, move the project to a local drive (C:) which has better file watching support.

## Why This Happens

- Windows network drives (Y:) have limitations with native file watching
- Metro bundler uses chokidar which relies on OS file system events
- Network drives don't support these events reliably

## Recommended Solution

Use `.\start.bat` - it's the simplest and most reliable.


