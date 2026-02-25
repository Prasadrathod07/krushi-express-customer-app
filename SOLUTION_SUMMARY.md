# File Watcher Error - Complete Solution Guide

## The Issue
Metro bundler can't watch files on Windows network drives (Y:). This is a **Windows limitation**, not a bug in your code.

## ✅ Working Solutions

### Solution 1: Increase Windows File Watcher Limit (PERMANENT FIX) ⭐

**This is the best solution.** Run PowerShell as Administrator:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers" -Value 524288 -PropertyType DWORD -Force
```

**Then restart your computer.**

After restart, run:
```powershell
npm start
```

It should work perfectly!

### Solution 2: Move Project to Local Drive

Move from network drive to local drive:

```powershell
# From:
Y:\PRASAD_RATHOD\samyam\Krushi-Express-Latur\customer-app-v2

# To:
C:\Projects\Krushi-Express-Latur\customer-app-v2
```

Then:
```powershell
cd C:\Projects\Krushi-Express-Latur\customer-app-v2
npm start
```

### Solution 3: Use WSL (If Available)

If you have Windows Subsystem for Linux:

```bash
# In WSL terminal
cd /mnt/y/PRASAD_RATHOD/samyam/Krushi-Express-Latur/customer-app-v2
npm start
```

## Temporary Workaround

If you can't do the registry fix right now, the app will still start but file watching won't work:

1. Run `npm start`
2. When you see the file watcher error, **ignore it** - Metro will continue
3. Press `r` in the terminal to manually reload when you make code changes
4. The app will work, you just won't get automatic hot reload

## Why This Happens

- Windows network drives (Y:) don't support native file watching reliably
- Metro uses Node.js `fs.watch` which fails on network drives
- There's no way to configure Metro to use polling (it's a Metro limitation)

## Recommendation

**Use Solution 1 (Registry Fix)** - It's a one-time fix that works for all projects and is the most reliable solution.


