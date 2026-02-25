# Final Solution for Metro File Watcher Error on Windows Network Drives

## Problem
Metro bundler's file watcher fails on Windows network drives (Y:) with:
```
Error: UNKNOWN: unknown error, watch
```

## Root Cause
Metro uses `metro-file-map` which relies on Node.js `fs.watch` API. On Windows network drives, this API doesn't work reliably and there's no direct way to configure Metro to use polling instead.

## Solutions (In Order of Recommendation)

### Solution 1: Increase Windows File Watcher Limit ⭐ RECOMMENDED

This is the most reliable permanent fix. Run PowerShell as Administrator:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers" -Value 524288 -PropertyType DWORD -Force
```

**Then restart your computer.**

After restart, Metro should work normally.

### Solution 2: Move Project to Local Drive

Move the project from network drive (Y:) to a local drive (C:):

```powershell
# Example: Move to C:\Projects
C:\Projects\Krushi-Express-Latur\customer-app-v2
```

Local drives have much better file watching support.

### Solution 3: Use WSL (Windows Subsystem for Linux)

If you have WSL installed:

```bash
# In WSL terminal
cd /mnt/y/PRASAD_RATHOD/samyam/Krushi-Express-Latur/customer-app-v2
npm start
```

WSL handles file watching better than native Windows on network drives.

### Solution 4: Use --no-watch Flag (Manual Reload)

As a workaround, you can disable file watching and manually reload:

```powershell
npx expo start --no-watch
```

Then press `r` in the terminal to manually reload when you make changes.

### Solution 5: Use Expo Go with Manual Reload

1. Start Expo with `--no-watch`:
   ```powershell
   npx expo start --no-watch
   ```

2. In Expo Go app, shake device and tap "Reload" when you make changes

## Why Environment Variables Don't Work

Metro's `metro-file-map` uses Node.js's native `fs.watch` API directly, not chokidar. The `CHOKIDAR_USEPOLLING` environment variable only works for packages that use chokidar, which Metro doesn't use for its core file watching.

## Recommended Action

**Use Solution 1 (Increase File Watcher Limit)** - It's a one-time fix that will work for all projects on your system.

## Quick Test After Registry Fix

After restarting, try:
```powershell
npm start
```

It should work without any file watcher errors!


