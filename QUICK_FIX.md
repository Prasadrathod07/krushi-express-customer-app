# Quick Fix for File Watcher Error

## The Problem
Metro bundler can't watch files on Windows network drives (Y:). This is a Windows limitation.

## Immediate Solution: Use the Patched Start Script

I've created a script that patches Metro's watcher to catch errors gracefully:

```powershell
npm start
```

This will:
- Try to start Metro normally
- If file watcher fails, it will show a warning but continue
- You can press `r` in the terminal to manually reload when you make changes

## Permanent Solutions

### Option 1: Increase Windows File Watcher Limit (Best)

Run PowerShell as Administrator:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers" -Value 524288 -PropertyType DWORD -Force
```

**Then restart your computer.** After restart, Metro will work normally.

### Option 2: Move Project to Local Drive

Move from `Y:\` to `C:\`:
```powershell
# Example
C:\Projects\Krushi-Express-Latur\customer-app-v2
```

### Option 3: Use WSL

If you have WSL:
```bash
cd /mnt/y/PRASAD_RATHOD/samyam/Krushi-Express-Latur/customer-app-v2
npm start
```

## For Now

Just run `npm start` - it should start even if file watching fails. You'll need to press `r` to reload manually, but the app will work!


