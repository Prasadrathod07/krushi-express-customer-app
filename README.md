# Krushi Express - Customer App V2

Fresh React Native Expo app built from scratch with proper setup.

## Features

- ✅ Expo SDK 53
- ✅ TypeScript support
- ✅ Expo Router for navigation
- ✅ Firebase authentication
- ✅ Metro bundler configured for Windows
- ✅ Proper file watching (polling mode for network drives)

## Setup

1. Install dependencies:
```powershell
cd customer-app-v2
npm install --legacy-peer-deps --no-workspaces
```

2. Start the app:
```powershell
# Use the polling script for Windows/network drives
.\start-with-polling.ps1

# Or manually:
$env:CHOKIDAR_USEPOLLING = "true"
npm start
```

## App Structure

- `app/` - Expo Router screens
  - `index.tsx` - Entry point (auth check)
  - `login.tsx` - Login screen
  - `register.tsx` - Registration screen
  - `home.tsx` - Home screen
- `services/` - Firebase and API services
- `lib/` - Utility functions
- `components/` - Reusable components
- `design-system/` - Design tokens and themes

## Next Steps

- Add trip booking functionality
- Add driver browsing
- Add trip tracking
- Add notifications
- Add more screens from original app

## Notes

- Configured to work on Windows network drives (Y:)
- Uses polling for file watching (more reliable)
- All dependencies match original app versions



