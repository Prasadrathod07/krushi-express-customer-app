# Simple Solution: Why This Happens & Quick Fix

## Why You Need This Now (But Didn't Before)

**Your current project is on:** `Y:\PRASAD_RATHOD\samyam\Krushi-Express-Latur\customer-app-v2` (Network Drive)

**Your previous Expo projects were probably on:** `C:\` (Local Drive)

**That's the only difference!** Network drives don't support file watching on Windows.

## ✅ EASIEST FIX: Move to C: Drive (Like Your Previous Projects)

Just copy the project to your local drive:

```powershell
# Copy to C: drive (same as your previous projects)
xcopy /E /I "Y:\PRASAD_RATHOD\samyam\Krushi-Express-Latur\customer-app-v2" "C:\Projects\Krushi-Express-Latur\customer-app-v2"

# Then go there
cd C:\Projects\Krushi-Express-Latur\customer-app-v2

# Install dependencies
npm install --legacy-peer-deps

# Start (will work perfectly, just like before!)
npm start
```

**That's it!** No registry changes, no restarts, no complicated fixes. Just like your previous Expo projects.

## Why This Works

- **C: drive** = Local drive = File watching works perfectly
- **Y: drive** = Network drive = File watching doesn't work (Windows limitation)

## Alternative: Keep on Y: Drive

If you must keep it on Y: drive, you need the registry fix (one-time, requires restart). But moving to C: is much simpler and matches how you worked before.


