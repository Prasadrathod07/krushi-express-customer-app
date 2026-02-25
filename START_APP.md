# How to Start the App

## Current Issue
Metro bundler can't watch files on Windows network drives (Y:). This is a Windows limitation.

## ⚠️ IMPORTANT: You Need to Fix Windows First

### Step 1: Fix Windows File Watcher (REQUIRED)

Run PowerShell as Administrator:

```powershell
# Option A: Use the provided script
.\fix-windows-watcher.ps1

# Option B: Run manually
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers" -Value 524288 -PropertyType DWORD -Force
```

**Then restart your computer.**

### Step 2: After Restart

```powershell
npm start
```

It should work perfectly!

## Alternative: Move Project to Local Drive

If you can't modify the registry, move the project to C: drive:

```powershell
# Move to:
C:\Projects\Krushi-Express-Latur\customer-app-v2
```

Then:
```powershell
cd C:\Projects\Krushi-Express-Latur\customer-app-v2
npm start
```

## Why This is Necessary

Windows network drives don't support file watching. The registry fix increases the file watcher limit system-wide, which allows Metro to work properly.

## Quick Reference

- **Fix:** Run `.\fix-windows-watcher.ps1` as Admin, then restart
- **Start:** `npm start`
- **Alternative:** Move project to C: drive


