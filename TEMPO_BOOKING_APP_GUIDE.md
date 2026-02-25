# Krushi Express - Tempo Booking App

## 🚀 Complete Android Mobile Application

A comprehensive goods transport booking application similar to Ola/Uber but specifically designed for tempo/goods vehicle booking with real-time tracking, goods upload, and professional UX.

## ✨ Features Implemented

### 1. Home Screen (`app/home.tsx`)
- ✅ Live map with Google Maps integration
- ✅ Real-time vehicle markers showing nearby available tempos
- ✅ Search bars for pickup and drop locations
- ✅ Bottom sheet with list of nearby vehicles
- ✅ Vehicle details: distance, ETA, cost/km, rating
- ✅ Real-time GPS updates via Socket.io
- ✅ Floating action button to book ride
- ✅ User menu with profile, trips, settings

### 2. Vehicle Discovery (`services/vehiclesAPI.ts`)
- ✅ API endpoint: `GET /api/vehicles/nearby`
- ✅ Filters vehicles by:
  - Distance (within radius)
  - Vehicle type
  - Availability status
- ✅ Calculates distance and ETA
- ✅ Shows cost per km for each vehicle type

### 3. Booking Flow (`app/book-ride.tsx`)
- ✅ **Step 1: Location Selection**
  - Pickup location picker
  - Drop location picker
  - Fare estimation display

- ✅ **Step 2: Goods Details**
  - Goods category selection:
    - Farm Produce 🌾
    - Furniture 🚪
    - Construction Material 🧱
    - Household Shifting 📦
    - Other Items
  - Vehicle type selection
  - Weight input
  - Description field

- ✅ **Step 3: Images & Budget**
  - Image upload (Gallery & Camera)
  - Multiple image support (up to 5)
  - Budget input with fare estimate hint
  - Cloudinary integration for image storage

### 4. Location Picker (`app/select-location.tsx`)
- ✅ Interactive map with marker placement
- ✅ Search functionality
- ✅ Current location button
- ✅ Address reverse geocoding
- ✅ Location confirmation

### 5. Trip Tracking (`app/trip-tracking.tsx`)
- ✅ Real-time driver location on map
- ✅ Live route visualization
- ✅ Trip status updates
- ✅ ETA countdown
- ✅ Driver information card
- ✅ Call and SMS driver buttons
- ✅ Trip details display

### 6. My Trips (`app/my-trips.tsx`)
- ✅ Trip history with filters:
  - All trips
  - Active trips
  - Completed trips
- ✅ Pull-to-refresh
- ✅ Trip status indicators
- ✅ Location details
- ✅ Fare information

## 🔧 Backend Implementation

### API Endpoints

#### Vehicles
- `GET /api/vehicles/nearby` - Get nearby available vehicles
  - Query params: `latitude`, `longitude`, `radius`, `vehicleType`
  - Returns: List of vehicles with distance, ETA, cost/km

- `GET /api/vehicles/:id` - Get vehicle details

#### Trips
- `POST /api/trips` - Create new trip/booking
  - Requires authentication
  - Body: pickupLocation, dropLocation, parcelDetails, requestedVehicleType, etc.

- `GET /api/trips` - Get customer's trips
  - Requires authentication
  - Query params: `status` (comma-separated), `page`, `limit`

- `GET /api/trips/:id` - Get trip details
  - Requires authentication
  - Verifies customer ownership

- `POST /api/trips/estimate` - Get fare estimate
  - No authentication required
  - Calculates estimated fare based on distance and vehicle type

### Real-time Updates (Socket.io)

The app uses Socket.io for real-time updates:

- **Vehicle Location Updates**: Drivers send location updates
- **Trip State Updates**: Real-time trip status changes
- **Driver Location**: Live driver tracking during active trips

Socket events:
- `subscribe-trip` - Subscribe to trip updates
- `driver-location-updated` - Receive driver location updates
- `trip-state-updated` - Receive trip state changes

## 📦 Data Models

### Trip Model (Updated)
```javascript
{
  customerId: String,
  driverId: String,
  pickupLocation: { type: 'Point', coordinates: [lng, lat], address: String },
  dropLocation: { type: 'Point', coordinates: [lng, lat], address: String },
  parcelDetails: {
    type: String,
    category: String, // 'Farm Produce', 'Furniture', etc.
    weight: String,
    images: [String], // Array of image URLs
    description: String,
    budget: Number
  },
  requestedVehicleType: String,
  estimatedFare: Number,
  currentTripState: String,
  driverCurrentLocation: { type: 'Point', coordinates: [lng, lat] },
  estimatedTimeToPickup: Number,
  estimatedTimeToDelivery: Number
}
```

### Vehicle Response
```javascript
{
  vehicleId: String,
  driverName: String,
  vehicleType: String,
  vehicleNumber: String,
  currentLocation: { latitude: Number, longitude: Number, address: String },
  distance: Number, // km
  estimatedArrivalTime: Number, // minutes
  rating: Number,
  totalTrips: Number,
  costPerKm: Number,
  status: String
}
```

## 🎨 UI/UX Design

### Color Scheme
- **Primary**: Green (#4CAF50) - Agriculture-friendly
- **Secondary**: Yellow (#FFD600)
- **Accent**: Orange (#FF9800) - Drop locations
- **Background**: White with soft shadows

### Design Principles
- ✅ Clean, minimal design
- ✅ Rounded cards and buttons
- ✅ Floating action buttons
- ✅ Bottom sheets for lists
- ✅ Haptic feedback on interactions
- ✅ Smooth animations
- ✅ Professional status indicators

## 🔐 Security

- ✅ JWT authentication for all trip operations
- ✅ Customer ownership verification
- ✅ Rate limiting on API endpoints
- ✅ Secure image upload via Cloudinary
- ✅ Input validation (Zod schemas)

## 📱 Setup Instructions

### Frontend (customer-app-v2)

1. **Install Dependencies**
   ```bash
   cd customer-app-v2
   npm install
   ```

2. **Configure Environment**
   - Update `app.json` with your API base URL:
     ```json
     {
       "extra": {
         "API_BASE_URL": "http://YOUR_IP:5000",
         "SOCKET_IO_URL": "http://YOUR_IP:5000"
       }
     }
     ```

3. **Run the App**
   ```bash
   npm start
   ```

### Backend

1. **Install Dependencies**
   ```bash
   cd Backend
   npm install
   ```

2. **Environment Variables**
   - Set `JWT_SECRET` in `.env`
   - Configure MongoDB connection
   - Set up Cloudinary credentials

3. **Start Server**
   ```bash
   npm run dev
   ```

## 🚦 Usage Flow

1. **Login/Register** - Customer authenticates
2. **Home Screen** - View map with nearby vehicles
3. **Select Locations** - Choose pickup and drop points
4. **Book Ride** - Fill goods details, upload images, set budget
5. **Trip Tracking** - Monitor driver location in real-time
6. **Trip History** - View all past and active trips

## 🔄 Real-time Features

- **Vehicle Discovery**: Updates every 30 seconds
- **Driver Tracking**: Real-time via Socket.io (< 1 second latency)
- **Trip Status**: Instant updates when driver accepts/rejects
- **Location Updates**: Continuous GPS tracking during active trips

## 📸 Image Upload

- Uses Cloudinary for image storage
- Supports multiple images per booking
- Gallery and camera options
- Automatic compression and optimization

## 🎯 Next Steps (Optional Enhancements)

- [ ] Chat functionality between customer and driver
- [ ] Payment integration
- [ ] Push notifications
- [ ] Trip rating and reviews
- [ ] Favorite locations
- [ ] Trip sharing
- [ ] Multi-language support (Marathi, Hindi)

## 📝 Notes

- The app is optimized for rural areas with low network connectivity
- All API calls have 30-second timeouts
- Error handling is comprehensive with user-friendly messages
- The UI follows Material Design principles
- Real-time updates use WebSocket for low latency

---

**Built with ❤️ for Krushi Express**

