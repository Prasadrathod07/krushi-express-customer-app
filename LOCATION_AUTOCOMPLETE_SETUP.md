# Location Autocomplete Setup Guide

## 🎯 Feature Overview

The app now includes location autocomplete that shows cities and villages from Maharashtra (and other Indian states) as you type in the pickup and drop location fields.

## ✨ Features

- ✅ Real-time autocomplete suggestions as you type
- ✅ Maharashtra locations prioritized and highlighted
- ✅ City and village suggestions
- ✅ Debounced search (300ms delay)
- ✅ Fallback to basic geocoding if Google Places API is not configured
- ✅ Visual indicators for Maharashtra locations (MH badge)

## 🔧 Setup Instructions

### 1. Get Google Places API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Places API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Places API"
   - Click "Enable"
4. Create API credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy your API key
5. Restrict the API key (recommended):
   - Click on your API key to edit
   - Under "API restrictions", select "Restrict key"
   - Choose "Places API"
   - Under "Application restrictions", set restrictions as needed

### 2. Configure Backend

Add the Google Places API key to your backend `.env` file:

```env
GOOGLE_PLACES_API_KEY=your-google-places-api-key-here
```

### 3. Restart Backend Server

After adding the API key, restart your backend server:

```bash
cd Backend
npm run dev
```

## 📱 How It Works

### User Flow

1. User opens location picker (pickup or drop)
2. User starts typing (e.g., "Pune", "Mumbai", "Latur")
3. After 300ms, autocomplete suggestions appear
4. Maharashtra locations are shown first with "MH" badge
5. User selects a suggestion
6. Map centers on selected location
7. User confirms the location

### API Endpoints

**Backend Endpoints:**
- `POST /api/places/autocomplete` - Get location suggestions
  - Body: `{ input: string, location?: { latitude, longitude }, radius?: number }`
  - Returns: Array of place suggestions

- `POST /api/places/details` - Get place details by place ID
  - Body: `{ placeId: string }`
  - Returns: Place details with coordinates

### Frontend Implementation

**Location Picker (`app/select-location.tsx`):**
- Real-time autocomplete dropdown
- Debounced search (300ms)
- Maharashtra badge indicator
- Fallback to expo-location geocoding

**Places API Service (`services/placesAPI.ts`):**
- Wrapper for backend places API
- Error handling
- TypeScript types

## 🎨 UI Features

- **Search Bar**: Shows loading indicator while searching
- **Suggestions List**: 
  - Scrollable dropdown below search bar
  - Maharashtra locations highlighted with green icon
  - "MH" badge for Maharashtra locations
  - Main text (city/village name) and secondary text (full address)
- **Map Integration**: Automatically centers on selected location

## 🔄 Fallback Behavior

If Google Places API key is not configured:
- Backend returns empty suggestions
- Frontend falls back to `expo-location.geocodeAsync()`
- Basic geocoding still works for location search

## 💡 Tips

1. **API Quotas**: Google Places API has free tier limits. Monitor usage in Google Cloud Console.

2. **Cost Optimization**: 
   - The autocomplete is debounced (300ms) to reduce API calls
   - Only searches after 2+ characters typed
   - Results are cached in the UI

3. **Maharashtra Priority**: 
   - The API is configured to bias results toward Maharashtra
   - Maharashtra locations are sorted to appear first
   - Visual "MH" badge helps identify Maharashtra locations

4. **Testing**: 
   - Try searching for: "Pune", "Mumbai", "Latur", "Nagpur", "Aurangabad"
   - Maharashtra cities should appear first
   - Other Indian cities will also appear

## 🐛 Troubleshooting

**No suggestions appearing:**
- Check if Google Places API key is set in backend `.env`
- Verify API key is enabled for Places API
- Check backend logs for API errors
- Ensure backend server is running

**Suggestions not prioritizing Maharashtra:**
- This is normal - Google Places API may return results based on relevance
- Maharashtra locations will have the "MH" badge
- Results are sorted to show Maharashtra locations first when possible

**Fallback to basic geocoding:**
- This happens automatically if Google Places API is not configured
- Basic geocoding works but may be less accurate
- Consider setting up Google Places API for better results

---

**Note**: The Google Places API requires billing to be enabled on your Google Cloud account, but there's a generous free tier ($200/month credit) that covers most usage.

