import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
  Dimensions,
  Animated,
  ActivityIndicator,
  Alert,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
MapboxGL.setAccessToken(Constants.expoConfig?.extra?.MAPBOX_TOKEN || '');
import { vehiclesAPI } from '../services/vehiclesAPI';
import { permanentDriversAPI } from '../services/permanentDriversAPI';
import { socketManager } from '../services/socketManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../lib/env';
import { useNotifications } from '../contexts/NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTrip } from '../contexts/TripContext';

const { width, height } = Dimensions.get('window');

interface Vehicle {
  vehicleId: string;
  driverName: string;
  vehicleType: string;
  vehicleNumber: string;
  currentLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  distance: number;
  estimatedArrivalTime: number;
  rating: number;
  totalTrips: number;
  costPerKm: number;
  status: string;
}

interface Driver {
  _id: string;
  name: string;
  profilePhoto?: string;
  vehicleDetails?: {
    type: string;
    number: string;
    capacity?: string;
    imageUrl?: string;
  };
  rating?: number;
  totalTrips?: number;
  status?: string;
  isVerified?: boolean;
  phone?: string;
  email?: string;
  currentLocation?: {
    type: string;
    coordinates: [number, number]; // [longitude, latitude]
    address?: string;
  };
  agriculturalExperience?: {
    years?: number;
  };
  distance?: number;
  address?: string;
  city?: string;
  isPermanent?: boolean;
  mobileNumber?: string;
  isOnDuty?: boolean;
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { lastNotification: contextLastNotification } = useNotifications();
  const { activeTrip, clearActiveTrip } = useTrip();
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const [_userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [pickupLocation, setPickupLocation] = useState<string>('');
  const [pickupLocationCoords, setPickupLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [dropLocation, setDropLocation] = useState<string>('');
  
  // Filters and search
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('All');

  // 5-min countdown for PENDING/REQUESTED trip request banner (null=idle, 0=expired, >0=seconds left)
  const [pendingSecondsLeft, setPendingSecondsLeft] = useState<number | null>(null);
  
  const mapRef    = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  
  // Bottom sheet animation values
  const COLLAPSED_HEIGHT = height * 0.3; // 30% of screen
  const EXPANDED_HEIGHT = height * 0.85; // 85% of screen (leaves some space at top)
  const bottomSheetAnim = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const panY = useRef(new Animated.Value(0)).current; // Track pan gesture
  const [_isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  const currentSheetHeight = useRef(COLLAPSED_HEIGHT); // Track current height for smooth transitions
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // PanResponder for dragging bottom sheet (industry standard implementation)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_evt) => {
        // Allow starting from anywhere on the sheet
        return true;
      },
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Only respond to vertical gestures (more vertical than horizontal)
        // Allow dragging from anywhere on the sheet
        // Lower threshold for better responsiveness
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animation and capture current height
        bottomSheetAnim.stopAnimation((value) => {
          currentSheetHeight.current = value;
          panY.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // Track the gesture
        panY.setValue(gestureState.dy);
        
        // Calculate new height based on current height and gesture
        const newHeight = currentSheetHeight.current - gestureState.dy;
        
        // Clamp between min and max heights with resistance at boundaries (rubber band effect)
        let clampedHeight = newHeight;
        if (newHeight < COLLAPSED_HEIGHT) {
          // Add resistance when dragging below minimum
          const resistance = (COLLAPSED_HEIGHT - newHeight) * 0.3;
          clampedHeight = COLLAPSED_HEIGHT - resistance;
        } else if (newHeight > EXPANDED_HEIGHT) {
          // Add resistance when dragging above maximum
          const resistance = (newHeight - EXPANDED_HEIGHT) * 0.3;
          clampedHeight = EXPANDED_HEIGHT + resistance;
        } else {
          clampedHeight = newHeight;
        }
        
        bottomSheetAnim.setValue(clampedHeight);
      },
      onPanResponderRelease: (_, gestureState) => {
        const finalHeight = currentSheetHeight.current - gestureState.dy;
        const threshold = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
        const velocity = gestureState.vy;
        
        let targetHeight: number;
        let shouldExpand: boolean;
        
        // Determine target state based on velocity, position, and distance
        // Strong upward swipe -> expand
        if (velocity < -0.8 || (velocity < -0.3 && finalHeight > threshold)) {
          shouldExpand = true;
          targetHeight = EXPANDED_HEIGHT;
        }
        // Strong downward swipe -> collapse
        else if (velocity > 0.8 || (velocity > 0.3 && finalHeight < threshold)) {
          shouldExpand = false;
          targetHeight = COLLAPSED_HEIGHT;
        }
        // Slow or no velocity -> snap to nearest position based on threshold
        else {
          shouldExpand = finalHeight > threshold;
          targetHeight = shouldExpand ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        }
        
        // Update current height reference
        currentSheetHeight.current = targetHeight;
        
        // Smooth spring animation with industry-standard parameters (iOS-like)
        Animated.spring(bottomSheetAnim, {
          toValue: targetHeight,
          useNativeDriver: false,
          tension: 68, // Standard iOS-like tension for smooth feel
          friction: 8.5, // Standard iOS-like friction
          velocity: velocity * 0.1, // Scale velocity for natural feel
        }).start(() => {
          // Update state after animation completes
          setIsBottomSheetExpanded(shouldExpand);
          panY.setValue(0);
        });
      },
      onPanResponderTerminate: () => {
        // Handle interruption (e.g., by another gesture or system)
        Animated.spring(bottomSheetAnim, {
          toValue: currentSheetHeight.current,
          useNativeDriver: false,
          tension: 68,
          friction: 8.5,
        }).start();
        panY.setValue(0);
      },
    })
  ).current;

  useEffect(() => {
    loadUserInfo();
    requestLocationPermission();
    loadStoredLocations();

    // Use singleton socketManager for home-screen events (no per-mount socket)
    const handleVehicleLocation = (data: any) => updateVehicleLocation(data);
    const handleNewNotification = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };
    socketManager.on('vehicle-location-updated', handleVehicleLocation);
    socketManager.on('new-notification', handleNewNotification);

    return () => {
      socketManager.off('vehicle-location-updated', handleVehicleLocation);
      socketManager.off('new-notification', handleNewNotification);
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);


  // Sync lastNotification from context
  useEffect(() => {
    if (contextLastNotification) {
      setLastNotification(contextLastNotification);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setLastNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [contextLastNotification]);

  // Track last user info load time to prevent excessive calls
  const lastUserInfoLoadRef = useRef<number>(0);
  const USER_INFO_RELOAD_INTERVAL = 30000; // 30 seconds

  // Reload locations when screen comes into focus (after returning from select-location)
  useFocusEffect(
    useCallback(() => {
      loadStoredLocations();
      
      // Only reload user info if it's been more than 30 seconds since last load
      const now = Date.now();
      if (now - lastUserInfoLoadRef.current > USER_INFO_RELOAD_INTERVAL) {
        loadUserInfo();
        lastUserInfoLoadRef.current = now;
      }
    }, [])
  );

  // Sync lastNotification from context and auto-hide after 5 seconds
  useEffect(() => {
    if (contextLastNotification) {
      setLastNotification(contextLastNotification);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setLastNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setLastNotification(null);
    }
  }, [contextLastNotification]);

  // Debounce vehicle loading to prevent too frequent calls
  const loadVehiclesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any pending timeout and interval
    if (loadVehiclesTimeoutRef.current) {
      clearTimeout(loadVehiclesTimeoutRef.current);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const searchLocation = pickupLocationCoords || userLocation;
    if (!searchLocation) return;

    // Debounce: Wait 2 seconds after location change before loading
    loadVehiclesTimeoutRef.current = setTimeout(() => {
      if (!isLoadingRef.current) {
        loadNearbyVehicles();
      }
    }, 2000);

    // Refresh vehicles every 60 seconds (only if location is stable and not loading) - increased to reduce rate limiting
    intervalRef.current = setInterval(() => {
      const currentLocation = pickupLocationCoords || userLocation;
      if (currentLocation && !isLoadingRef.current) {
        loadNearbyVehicles();
      }
    }, 60000); // Increased from 30s to 60s to reduce API calls

    return () => {
      if (loadVehiclesTimeoutRef.current) {
        clearTimeout(loadVehiclesTimeoutRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pickupLocationCoords, userLocation]); // loadNearbyVehicles captured by closure inside setTimeout/setInterval



  const updateVehicleLocation = (data: any) => {
    setVehicles((prevVehicles) =>
      prevVehicles.map((vehicle) =>
        vehicle.vehicleId === data.vehicleId
          ? {
              ...vehicle,
              currentLocation: {
                ...vehicle.currentLocation,
                latitude: data.latitude,
                longitude: data.longitude,
              },
            }
          : vehicle
      )
    );
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to find nearby vehicles.');
        return;
      }

      // Get an immediate fix first so the map centers quickly
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const initialCoords = {
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      };
      setUserLocation(initialCoords);

      // Center map on user's real position (do NOT set pickupLocationCoords here —
      // the pickup marker should only appear when the user explicitly selects a location)
      if (cameraRef.current) {
        cameraRef.current.setCamera({ centerCoordinate: [initialCoords.longitude, initialCoords.latitude], zoomLevel: 13, animationDuration: 1000 });
      }

      // Stop any existing watcher before starting a new one
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
      }

      // Continuously watch GPS position so the map always shows correct location
      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10, // update every 10 metres of movement
          timeInterval: 5000,   // or at least every 5 seconds
        },
        (loc) => {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(coords);
        },
      );
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get your location. Please enable location services.');
    }
  };

  // Use ref to track loading state to avoid dependency issues
  const isLoadingRef = useRef(false);

  const loadNearbyVehicles = useCallback(async () => {
    // Use pickup location if available, otherwise use user location
    const searchLocation = pickupLocationCoords || userLocation;
    if (!searchLocation) return;

    // Prevent concurrent requests using ref
    if (isLoadingRef.current) {
      console.log('⏸️ Vehicle loading already in progress, skipping...');
      return;
    }

    isLoadingRef.current = true;
    setLoadingVehicles(true);
    try {
      console.log('📍 Loading vehicles near:', pickupLocationCoords ? 'Pickup Location' : 'User Location', {
        latitude: searchLocation.latitude,
        longitude: searchLocation.longitude,
      });

      const response = await vehiclesAPI.getNearbyVehicles(
        searchLocation.latitude,
        searchLocation.longitude,
        10 // 10km radius
      );

      if (response.ok && response.data) {
        setVehicles(response.data);
        console.log(`✅ Found ${response.data.length} vehicles`);
      }
    } catch (error: any) {
      console.error('Error loading vehicles:', error);
      // Don't show error to user, just log it
    } finally {
      isLoadingRef.current = false;
      setLoadingVehicles(false);
    }
  }, [pickupLocationCoords, userLocation]);


  // Load all registered drivers + permanent drivers and merge into one list
  const loadAllDrivers = useCallback(async () => {
    try {
      setLoadingDrivers(true);

      // Fetch regular drivers and permanent drivers in parallel.
      // If pickup is set, use nearby endpoint (returns proximity-sorted drivers with GPS).
      // Otherwise fall back to getAllDrivers (all ONLINE).
      const searchLoc = pickupLocationCoords || userLocation;
      const [regularRes, permRes] = await Promise.allSettled([
        searchLoc
          ? vehiclesAPI.getNearbyVehicles(searchLoc.latitude, searchLoc.longitude, 30,
              selectedVehicleType !== 'All' ? selectedVehicleType : undefined)
          : vehiclesAPI.getAllDrivers(100, 0, 'ONLINE'),
        permanentDriversAPI.getAll(
          selectedVehicleType !== 'All' ? { vehicleType: selectedVehicleType } : undefined
        ),
      ]);

      // --- Regular drivers ---
      // getNearbyVehicles returns { vehicleId, driverId, driverName, currentLocation:{lat,lng,address}, ... }
      // getAllDrivers returns raw Driver objects with currentLocation.coordinates:[lng,lat]
      // Normalise both to the Driver interface used by this screen.
      let regularDrivers: Driver[] = [];
      if (regularRes.status === 'fulfilled' && regularRes.value?.ok && regularRes.value?.data) {
        const raw = regularRes.value.data;
        if (searchLoc && Array.isArray(raw) && raw[0]?.driverName !== undefined) {
          // From getNearbyVehicles — convert to Driver shape
          regularDrivers = raw.map((v: any): Driver => ({
            _id: v.driverId || v.vehicleId,
            name: v.driverName,
            phone: v.driverPhone,
            profilePhoto: v.profilePhoto,
            vehicleDetails: {
              type: v.vehicleType || 'Unknown',
              number: v.vehicleNumber || 'N/A',
            },
            rating: v.rating,
            totalTrips: v.totalTrips,
            status: v.status || 'ONLINE',
            currentLocation: v.currentLocation
              ? {
                  type: 'Point',
                  coordinates: [v.currentLocation.longitude, v.currentLocation.latitude] as [number, number],
                  address: v.currentLocation.address,
                }
              : undefined,
            distance: v.distance,
          }));
        } else {
          // From getAllDrivers — already in Driver shape
          regularDrivers = raw;
        }
      }

      // --- Permanent drivers → normalise to Driver shape ---
      let permDrivers: Driver[] = [];
      if (permRes.status === 'fulfilled' && permRes.value?.ok && permRes.value?.data) {
        permDrivers = permRes.value.data.drivers
          .map((pd: any): Driver => ({
            _id: pd._id,
            name: pd.name,
            profilePhoto: pd.profilePhoto || undefined,
            vehicleDetails: {
              type: pd.vehicleType,
              number: pd.vehicleNumber || '',
              imageUrl: pd.profilePhoto || undefined,
            },
            status: 'ONLINE',
            city: pd.city,
            address: pd.serviceArea || pd.city,
            isPermanent: true,
            mobileNumber: pd.mobileNumber,
            isOnDuty: pd.isOnDuty !== false, // default true if field missing
          }));
      }

      // Merge: regular drivers first (they have GPS), then permanent
      let allDrivers: Driver[] = [...regularDrivers, ...permDrivers];

      // Filter by vehicle type
      if (selectedVehicleType !== 'All') {
        allDrivers = allDrivers.filter(d =>
          d.vehicleDetails?.type === selectedVehicleType
        );
      }

      // Sort regular drivers with GPS by proximity to pickup
      if (pickupLocationCoords) {
        allDrivers = allDrivers.map(d => {
          if (d.currentLocation?.coordinates) {
            const [lon, lat] = d.currentLocation.coordinates;
            return { ...d, distance: calculateDistance(pickupLocationCoords.latitude, pickupLocationCoords.longitude, lat, lon) };
          }
          return { ...d, distance: Infinity };
        }).sort((a: any, b: any) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      }

      setDrivers(allDrivers);
      applyFilters(allDrivers);
      console.log(`✅ Loaded ${regularDrivers.length} regular + ${permDrivers.length} permanent drivers`);
    } catch (error: any) {
      console.error('Error loading drivers:', error);
    } finally {
      setLoadingDrivers(false);
    }
  }, [pickupLocationCoords, userLocation, selectedVehicleType]);

  // 5-minute countdown for PENDING/REQUESTED trip request banner
  useEffect(() => {
    const FIVE_MIN_S = 5 * 60;
    const isPending = activeTrip && ['PENDING', 'REQUESTED'].includes(activeTrip.currentTripState);

    if (!isPending) {
      setPendingSecondsLeft(null);
      return;
    }

    // Use trip createdAt to correctly resume countdown after app restart
    const createdMs = activeTrip.createdAt
      ? new Date(activeTrip.createdAt).getTime()
      : Date.now();
    const elapsed = Math.floor((Date.now() - createdMs) / 1000);
    const remaining = Math.max(0, FIVE_MIN_S - elapsed);

    setPendingSecondsLeft(remaining);
    if (remaining === 0) return;

    const interval = setInterval(() => {
      setPendingSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          // Timer expired — the driver didn't respond in time. Clear the stale trip
          // so the banner doesn't reappear on the next app launch.
          clearActiveTrip();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrip?._id, activeTrip?.currentTripState]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Apply filters to drivers
  const applyFilters = (driversList: Driver[]) => {
    let filtered = [...driversList];
    
    // Filter by vehicle type (already done in loadAllDrivers, but keep for consistency)
    if (selectedVehicleType !== 'All') {
      filtered = filtered.filter(driver => 
        driver.vehicleDetails?.type === selectedVehicleType
      );
    }
    
    setFilteredDrivers(filtered);
  };


  // Update filters when they change
  useEffect(() => {
    if (drivers.length > 0) {
      applyFilters(drivers);
    }
  }, [selectedVehicleType, drivers]);
  
  // Load drivers when pickup location or filters change
  useEffect(() => {
    loadAllDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLocationCoords, selectedVehicleType, userLocation]);
  
  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const loadStoredLocations = async () => {
    try {
      // Load pickup location
      const storedPickup = await AsyncStorage.getItem('pickupLocation');
      if (storedPickup) {
        const pickup = JSON.parse(storedPickup);
        setPickupLocation(pickup.address || '');
          // Store coordinates for vehicle search
          if (pickup.latitude && pickup.longitude) {
            setPickupLocationCoords({
              latitude: pickup.latitude,
              longitude: pickup.longitude,
            });
            
            // Center map on pickup location
            if (cameraRef.current) {
              cameraRef.current.setCamera({ centerCoordinate: [pickup.longitude, pickup.latitude], zoomLevel: 13, animationDuration: 1000 });
            }
            
            // Load drivers with new pickup location
            setTimeout(() => {
              loadAllDrivers();
            }, 500);
          }
      } else {
        // Clear pickup location if no stored location
        setPickupLocation('');
        setPickupLocationCoords(null);
      }

      // Load drop location
      const storedDrop = await AsyncStorage.getItem('dropLocation');
      if (storedDrop) {
        const drop = JSON.parse(storedDrop);
        setDropLocation(drop.address || '');
      } else {
        // Clear drop location if no stored location
        setDropLocation('');
      }
    } catch (error) {
      console.error('Error loading stored locations:', error);
    }
  };

  const loadUserInfo = async () => {
    try {
      const email = await AsyncStorage.getItem('userEmail');
      let name = await AsyncStorage.getItem('userName');
      const photo = await AsyncStorage.getItem('profilePhoto');
      const userId = await AsyncStorage.getItem('userId');
      
      console.log('[Home] Loading user info:', { email, name, userId: userId?.substring(0, 8) });
      
      setUserEmail(email || '');
      
      // First, set the stored name immediately (for fast display)
      if (name && name.trim() && name.trim().length > 0 && !name.includes('@') && name.toLowerCase() !== email?.toLowerCase()) {
        const trimmedName = name.trim();
        setUserName(trimmedName);
        console.log('[Home] ✅ Using stored name:', trimmedName);
      } else if (email) {
        // Extract username from email as temporary fallback
        const extractedName = email.split('@')[0];
        const formattedName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1);
        setUserName(formattedName);
        console.log('[Home] ⚠️ Using extracted name from email:', formattedName);
      } else {
        setUserName('User');
        console.log('[Home] ⚠️ Using default name: User');
      }
      
      setProfilePhoto(photo);
      
      // Then, fetch the actual name from backend in background to update if different
      // This ensures we always show the correct name from database
      fetchUserNameFromBackend().then((actualName) => {
        if (actualName && actualName.trim()) {
          setUserName(actualName.trim());
          console.log('[Home] ✅ Updated name from backend:', actualName.trim());
        }
      }).catch((error) => {
        console.error('[Home] Error in background name fetch:', error);
        // Don't update UI if fetch fails, keep the stored name
      });
    } catch (error) {
      console.error('[Home] Error loading user info:', error);
      // Set fallback values
      setUserName('User');
      setUserEmail('');
    }
  };

  // Track if backend fetch is in progress to prevent concurrent calls
  const fetchingUserNameRef = useRef(false);

  const fetchUserNameFromBackend = async (): Promise<string | null> => {
    // Prevent concurrent fetches
    if (fetchingUserNameRef.current) {
      console.log('[Home] ⏸️ User name fetch already in progress, skipping...');
      return null;
    }

    try {
      fetchingUserNameRef.current = true;
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        console.log('[Home] No token, skipping name fetch');
        return null;
      }
      
      // Ensure API_URL is defined
      const apiUrl = API_URL || 'http://192.168.12.83:5000';
      
      // Create timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Try /me endpoint first (better for authenticated requests)
      let response = await fetch(`${apiUrl}/api/customers/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // If /me fails, fallback to /:id endpoint
      if (!response.ok) {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          // Create new timeout for fallback request
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 10000);
          
          response = await fetch(`${apiUrl}/api/customers/${userId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            signal: fallbackController.signal,
          });
          
          clearTimeout(fallbackTimeoutId);
        }
      }
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Home] Customer data received:', data);
        
        if (data.ok && data.data) {
          // Check for name in different possible fields
          const actualName = data.data.name || data.data.userName || data.data.displayName || null;
          
          if (actualName && typeof actualName === 'string') {
            const trimmedName = actualName.trim();
            // Only return if it's a valid name (not an email and not empty)
            if (trimmedName && trimmedName.length > 0 && !trimmedName.includes('@')) {
              // Update AsyncStorage with the correct name
              await AsyncStorage.setItem('userName', trimmedName);
              console.log('[Home] ✅ Fetched name from backend:', trimmedName);
              
              // Also fetch and update profile photo if available
              const profilePhoto = data.data.profilePhoto || data.data.photo || null;
              if (profilePhoto && typeof profilePhoto === 'string' && profilePhoto.trim()) {
                await AsyncStorage.setItem('profilePhoto', profilePhoto.trim());
                setProfilePhoto(profilePhoto.trim());
                console.log('[Home] ✅ Fetched profile photo from backend');
              } else {
                console.log('[Home] ⚠️ No profile photo found in customer data');
              }
              
              return trimmedName;
            } else {
              console.log('[Home] ⚠️ Backend returned invalid name:', trimmedName);
            }
          } else {
            console.log('[Home] ⚠️ No name field found in customer data');
          }
          
          // Also check for profile photo even if name is not found
          const profilePhoto = data.data.profilePhoto || data.data.photo || null;
          if (profilePhoto && typeof profilePhoto === 'string' && profilePhoto.trim()) {
            await AsyncStorage.setItem('profilePhoto', profilePhoto.trim());
            setProfilePhoto(profilePhoto.trim());
            console.log('[Home] ✅ Fetched profile photo from backend');
          }
        } else {
          console.log('[Home] ⚠️ Invalid response format:', data);
        }
      } else {
        const errorText = await response.text();
        console.log('[Home] ❌ Failed to fetch customer:', response.status, errorText.substring(0, 100));
      }
    } catch (error: any) {
      // Don't log timeout errors as errors, just as info
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        console.log('[Home] ⏸️ User name fetch timed out');
      } else {
        console.error('[Home] ❌ Error fetching user name:', error.message || error);
      }
      return null;
    } finally {
      fetchingUserNameRef.current = false;
    }
    return null;
  };


  const handleBookRide = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Check if both locations are set
    try {
      const pickupStored = await AsyncStorage.getItem('pickupLocation');
      const dropStored = await AsyncStorage.getItem('dropLocation');
      
      if (pickupStored && dropStored) {
        const pickupLocation = JSON.parse(pickupStored);
        const dropLocation = JSON.parse(dropStored);
        
        // Validate both locations have coordinates
        if (
          pickupLocation.latitude &&
          pickupLocation.longitude &&
          dropLocation.latitude &&
          dropLocation.longitude
        ) {
          // Both locations are set - navigate directly to step 2
          router.push({
            pathname: '/book-ride',
            params: {
              step: '2',
              pickupLat: pickupLocation.latitude.toString(),
              pickupLng: pickupLocation.longitude.toString(),
              pickupAddress: pickupLocation.address,
              dropLat: dropLocation.latitude.toString(),
              dropLng: dropLocation.longitude.toString(),
              dropAddress: dropLocation.address,
            },
          });
          return;
        }
      }
      
      // If locations not set, navigate to step 1 (default behavior)
      router.push('/book-ride');
    } catch (error) {
      console.error('Error checking locations:', error);
      // Fallback to default navigation
      router.push('/book-ride');
    }
  };

  const handleVehicleSelect = (vehicle: Vehicle) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedVehicle(vehicle);

    // Animate map to vehicle location
    if (cameraRef.current && vehicle.currentLocation) {
      cameraRef.current.setCamera({ centerCoordinate: [vehicle.currentLocation.longitude, vehicle.currentLocation.latitude], zoomLevel: 16, animationDuration: 500 });
    }
  };

  const handleMyLocation = () => {
    // Center on pickup location if set, otherwise user location
    const centerLocation = pickupLocationCoords || userLocation;
    if (centerLocation && cameraRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      cameraRef.current.setCamera({ centerCoordinate: [centerLocation.longitude, centerLocation.latitude], zoomLevel: 13, animationDuration: 1000 });
    }
  };

  const getVehicleIcon = (vehicleType: string) => {
    const icons: { [key: string]: string } = {
      'Pickup': 'local-shipping',
      'Tata Ace': 'directions-car',
      'Bolero Pickup': 'airport-shuttle',
      'Eicher Mini': 'local-shipping',
      'Tempo': 'local-shipping',
      'Mini Truck': 'local-shipping',
      'Truck': 'local-shipping',
    };
    return icons[vehicleType] || 'directions-car';
  };

  const getVehicleColor = (vehicleType: string) => {
    const colors: { [key: string]: string } = {
      'Pickup': '#4CAF50',
      'Tata Ace': '#2196F3',
      'Bolero Pickup': '#FF9800',
      'Eicher Mini': '#9C27B0',
      'Tempo': '#4CAF50',
      'Mini Truck': '#F44336',
      'Truck': '#795548',
    };
    return colors[vehicleType] || '#4CAF50';
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Notification Banner - Shows when new notification arrives (temporary, auto-dismisses) */}
      {lastNotification && (
        <TouchableOpacity
          style={[styles.notificationBanner, { top: insets.top + 10 }]}
          onPress={() => {
            setLastNotification(null);
            // Navigate to track-trip if it's a trip-accepted notification
            if (lastNotification.type === 'trip-accepted' && lastNotification.tripId) {
              router.push('/track-trip');
            } else {
              router.push('/(tabs)/notifications');
            }
          }}
          activeOpacity={0.8}
        >
          <View style={styles.notificationBannerContent}>
            <Icon name={lastNotification.type === 'trip-accepted' ? 'directions-car' : 'notifications'} size={20} color="#fff" />
            <View style={styles.notificationBannerText}>
              <Text style={styles.notificationBannerTitle} numberOfLines={2}>
                {lastNotification.title}
              </Text>
              <Text style={styles.notificationBannerMessage} numberOfLines={2}>
                {lastNotification.message}
              </Text>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setLastNotification(null);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Active Trip Banner */}
      {(() => {
        if (!activeTrip) return null;
        const st = activeTrip.currentTripState;
        if (['COMPLETED','CANCELLED','CUSTOMER_CANCELLED','DRIVER_CANCELLED','REJECTED'].includes(st)) return null;
        if (pendingSecondsLeft === 0 && ['PENDING','REQUESTED','NEW'].includes(st)) return null;

        const otpCode = activeTrip.otp || activeTrip.pickupCode;
        // Hide OTP as soon as it has been verified, even if trip state hasn't updated yet
        const showOtpInBanner = ['ACCEPTED','ENROUTE_TO_PICKUP','EN_ROUTE_TO_PICKUP','ARRIVED_AT_PICKUP'].includes(st)
          && !!otpCode
          && !activeTrip.otpVerified;

        // Per-state config
        const cfg: Record<string, { bg: string; icon: string; title: string; sub: string; action: string }> = {
          NEW:                    { bg: '#B45309', icon: 'hourglass-top',    title: 'Finding Your Driver',       sub: `Searching nearby drivers…${pendingSecondsLeft && pendingSecondsLeft > 0 ? ` (${formatCountdown(pendingSecondsLeft)} left)` : ''}`,        action: 'View' },
          PENDING:                { bg: '#B45309', icon: 'hourglass-top',    title: 'Finding Your Driver',       sub: `Searching nearby drivers…${pendingSecondsLeft && pendingSecondsLeft > 0 ? ` (${formatCountdown(pendingSecondsLeft)} left)` : ''}`,        action: 'View' },
          REQUESTED:              { bg: '#B45309', icon: 'hourglass-top',    title: 'Awaiting Driver Response',  sub: `Driver reviewing your request…${pendingSecondsLeft && pendingSecondsLeft > 0 ? ` (${formatCountdown(pendingSecondsLeft)} left)` : ''}`,   action: 'View' },
          NEGOTIATING:            { bg: '#D97706', icon: 'chat',             title: 'Negotiation in Progress',   sub: 'Driver sent an offer — tap to respond',                                                                                                   action: 'Chat' },
          ACCEPTED:               { bg: '#16A34A', icon: 'directions-car',   title: 'Driver Accepted!',          sub: showOtpInBanner ? `On the way · Pickup Code: ${otpCode}` : 'Driver is on the way to you',                                                 action: 'Track' },
          ENROUTE_TO_PICKUP:      { bg: '#1D4ED8', icon: 'directions-car',   title: 'Driver Heading to You',     sub: showOtpInBanner ? `Live tracking · Code: ${otpCode}` : 'Track driver on map',                                                             action: 'Track' },
          EN_ROUTE_TO_PICKUP:     { bg: '#1D4ED8', icon: 'directions-car',   title: 'Driver Heading to You',     sub: showOtpInBanner ? `Live tracking · Code: ${otpCode}` : 'Track driver on map',                                                             action: 'Track' },
          ARRIVED_AT_PICKUP:      { bg: '#C2410C', icon: 'location-on',      title: 'Driver Has Arrived!',       sub: showOtpInBanner ? `Show Code ${otpCode} to driver` : 'Driver is at pickup point',                                                         action: 'Show Code' },
          PICKUP_VERIFIED:        { bg: '#7C3AED', icon: 'inventory',        title: 'Goods Picked Up',           sub: 'Your goods are with the driver — tap to track',                                                                                           action: 'Track' },
          PICKED_UP:              { bg: '#7C3AED', icon: 'inventory',        title: 'Goods Picked Up',           sub: 'Driver heading to delivery point — tap to track',                                                                                         action: 'Track' },
          IN_TRANSIT:             { bg: '#0369A1', icon: 'local-shipping',   title: 'Goods in Transit',          sub: 'En route to delivery — tap to track live',                                                                                                action: 'Track' },
          ENROUTE_TO_DELIVERY:    { bg: '#0369A1', icon: 'local-shipping',   title: 'Goods in Transit',          sub: 'Driver heading to delivery point — tap to track',                                                                                         action: 'Track' },
          ARRIVED_AT_DELIVERY:    { bg: '#0F766E', icon: 'place',            title: 'Driver at Delivery Point',  sub: 'Your goods are being delivered',                                                                                                          action: 'Track' },
          DELIVERING:             { bg: '#0F766E', icon: 'move-to-inbox',    title: 'Delivering Your Goods',     sub: 'Almost there — tap to track',                                                                                                             action: 'Track' },
          ARRIVED_AT_DROPOFF:     { bg: '#0F766E', icon: 'place',            title: 'Delivery Point Reached',    sub: 'Driver completing delivery',                                                                                                              action: 'Track' },
        };
        const c = cfg[st] || { bg: '#16A34A', icon: 'local-shipping', title: 'Trip in Progress', sub: 'Tap to track your shipment', action: 'Track' };

        return (
          <TouchableOpacity
            style={[styles.activeTripBanner, { top: insets.top + 10, backgroundColor: c.bg, shadowColor: c.bg }]}
            onPress={() => {
              if (st === 'NEGOTIATING') {
                router.replace({ pathname: '/trip-negotiation', params: { tripId: activeTrip._id } });
              } else if (['NEW','PENDING','REQUESTED'].includes(st)) {
                // Reconnect to the searching screen at correct phase (wave timer not reset)
                router.replace({ pathname: '/searching-drivers', params: { tripId: activeTrip._id } });
              } else {
                router.replace({ pathname: '/trip-tracking', params: { id: activeTrip._id } });
              }
            }}
            activeOpacity={0.9}
          >
            <View style={styles.activeTripBannerLeft}>
              <View style={styles.activeTripPulse}>
                <Icon name={c.icon} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.activeTripBannerTitle}>{c.title}</Text>
                {showOtpInBanner && st === 'ARRIVED_AT_PICKUP' ? (
                  <View style={styles.activeTripOtpRow}>
                    <Text style={styles.activeTripOtpLabel}>Show Code </Text>
                    <Text style={styles.activeTripOtpCode}>{otpCode}</Text>
                    <Text style={styles.activeTripOtpLabel}> to driver</Text>
                  </View>
                ) : (
                  <Text style={styles.activeTripBannerSub} numberOfLines={1}>{c.sub}</Text>
                )}
              </View>
            </View>
            <View style={styles.activeTripBannerRight}>
              <Text style={styles.activeTripBannerTrack}>{c.action}</Text>
              <Icon name="chevron-right" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        );
      })()}

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.7}
          >
            <View style={styles.avatarContainer}>
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  style={styles.avatarImage}
                  onError={() => {
                    console.log('[Home] ⚠️ Failed to load profile photo, using fallback');
                    setProfilePhoto(null);
                  }}
                />
              ) : (
                <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.greeting}>{t.home.hello}</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {userName && userName.trim() ? userName.trim() : 'User'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Location Search Bar */}
        <TouchableOpacity
          style={styles.locationBar}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/select-location?type=pickup');
          }}
        >
          <View style={styles.locationIcon}>
            <Icon name="location-on" size={20} color="#4CAF50" />
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationLabel}>{t.home.pickupLocation}</Text>
            <Text style={[styles.locationText, !pickupLocation && styles.placeholderText]} numberOfLines={1}>
              {pickupLocation || t.home.whereFrom}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color="#999" />
        </TouchableOpacity>

        {/* Drop Location Search Bar */}
        <TouchableOpacity
          style={[styles.locationBar, styles.dropLocationBar]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/select-location?type=drop');
          }}
        >
          <View style={[styles.locationIcon, { backgroundColor: '#FFF3E0' }]}>
            <Icon name="place" size={20} color="#FF9800" />
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationLabel}>{t.home.dropLocation}</Text>
            <Text style={[styles.locationText, !dropLocation && styles.placeholderText]} numberOfLines={1}>
              {dropLocation || t.home.whereTo}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        {(pickupLocationCoords || userLocation) ? (
          <MapboxGL.MapView ref={mapRef} style={styles.map} styleURL={MapboxGL.StyleURL.Street} logoEnabled={false} attributionEnabled={false}>
            <MapboxGL.Camera
              ref={cameraRef}
              zoomLevel={13}
              centerCoordinate={[(pickupLocationCoords || userLocation)!.longitude, (pickupLocationCoords || userLocation)!.latitude]}
              animationMode="flyTo"
            />
            <MapboxGL.UserLocation visible={true} />

            {pickupLocationCoords && (
              <MapboxGL.PointAnnotation id="pickup" coordinate={[pickupLocationCoords.longitude, pickupLocationCoords.latitude]}>
                <View style={styles.pickupMarker}>
                  <Icon name="location-on" size={30} color="#4CAF50" />
                </View>
              </MapboxGL.PointAnnotation>
            )}

            {filteredDrivers.filter(d => d.currentLocation?.coordinates).map((driver) => {
              const [lon, lat] = driver.currentLocation!.coordinates;
              const vehicleType = driver.vehicleDetails?.type || 'Tempo';
              return (
                <MapboxGL.PointAnnotation key={`driver-${driver._id}`} id={`driver-${driver._id}`} coordinate={[lon, lat]}>
                  <View style={[styles.vehicleMarker, { backgroundColor: '#FFC107' }]}>
                    <Icon name={getVehicleIcon(vehicleType)} size={22} color="#fff" />
                  </View>
                </MapboxGL.PointAnnotation>
              );
            })}

            {vehicles
              .filter(v => v.currentLocation !== null)
              .filter(v => !filteredDrivers.some(d =>
                d.currentLocation?.coordinates &&
                Math.abs(d.currentLocation.coordinates[1] - v.currentLocation!.latitude) < 0.0001 &&
                Math.abs(d.currentLocation.coordinates[0] - v.currentLocation!.longitude) < 0.0001
              ))
              .map((vehicle) => (
                <MapboxGL.PointAnnotation
                  key={vehicle.vehicleId}
                  id={`vehicle-${vehicle.vehicleId}`}
                  coordinate={[vehicle.currentLocation!.longitude, vehicle.currentLocation!.latitude]}
                  onSelected={() => handleVehicleSelect(vehicle)}
                >
                  <View style={[styles.vehicleMarker, { backgroundColor: '#FFC107', borderColor: selectedVehicle?.vehicleId === vehicle.vehicleId ? '#fff' : 'transparent' }]}>
                    <Icon name={getVehicleIcon(vehicle.vehicleType)} size={24} color="#fff" />
                  </View>
                </MapboxGL.PointAnnotation>
              ))
            }
          </MapboxGL.MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.mapPlaceholderText}>Loading map...</Text>
          </View>
        )}

        {/* Map Controls */}
        <View style={[styles.mapControls, { bottom: 16 }]}>
          <TouchableOpacity style={styles.mapControlButton} onPress={handleMyLocation}>
            <Icon name="my-location" size={24} color="#4CAF50" />
          </TouchableOpacity>
        </View>

        {/* Loading Overlay */}
        {loadingVehicles && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.loadingText}>Finding nearby vehicles...</Text>
          </View>
        )}
      </View>

      {/* Bottom Sheet - Nearby Vehicles */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: bottomSheetAnim,
          },
        ]}
      >
        <View style={styles.bottomSheetContent}>

          {/* ── Sticky header zone: handle + title + filter ── */}
          <View style={styles.sheetHeaderZone} {...panResponder.panHandlers}>
            {/* Drag handle */}
            <View style={styles.bottomSheetHandle} />

            {/* Title row */}
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                Available Vehicles
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  loadAllDrivers();
                }}
              >
                <Icon name="refresh" size={24} color="#16a34a" />
              </TouchableOpacity>
            </View>

            {/* Filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterContainer}
            >
              {['All', 'Tempo', 'Pickup', 'Tata Ace', 'Bolero Pickup', 'Eicher Mini', 'Mini Truck'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.filterChip, selectedVehicleType === type && styles.filterChipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedVehicleType(type);
                  }}
                >
                  <Text style={[styles.filterChipText, selectedVehicleType === type && styles.filterChipTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── Content area: fills all remaining space ── */}
          <View style={styles.sheetContentArea}>
        {loadingDrivers ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.emptyStateText}>Loading drivers...</Text>
          </View>
        ) : filteredDrivers.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="directions-car" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>{t.home.noDriversNearby}</Text>
            <Text style={styles.emptyStateSubtext}>
              {selectedVehicleType !== 'All' ? `Try changing the vehicle type filter` : 'Check back later'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.driversScrollView}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.driversGrid}
            nestedScrollEnabled={true}
            scrollEnabled={true} // Always allow scrolling
          >
            {filteredDrivers.map((driver) => (
              <TouchableOpacity
                key={driver._id}
                style={styles.driverCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (driver.isPermanent) {
                    router.push({
                      pathname: '/permanent-driver-detail',
                      params: { id: driver._id },
                    });
                  } else {
                    router.push({
                      pathname: '/driver-detail',
                      params: { driverId: driver._id },
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                {/* Vehicle Image */}
                <View>
                  {driver.vehicleDetails?.imageUrl ? (
                    <Image
                      source={{ uri: driver.vehicleDetails.imageUrl }}
                      style={styles.driverVehicleImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.driverVehicleImagePlaceholder, { backgroundColor: `${getVehicleColor(driver.vehicleDetails?.type || 'Tempo')}20` }]}>
                      <Icon
                        name={getVehicleIcon(driver.vehicleDetails?.type || 'Tempo')}
                        size={40}
                        color={getVehicleColor(driver.vehicleDetails?.type || 'Tempo')}
                      />
                    </View>
                  )}
                  {/* Duty status dot — green for online/on-duty, red for off-duty (permanent only) */}
                  <View style={[
                    styles.dutyDot,
                    {
                      backgroundColor: driver.isPermanent
                        ? (driver.isOnDuty !== false ? '#16A34A' : '#EF4444')
                        : '#16A34A', // regular drivers only appear when ONLINE so always green
                    },
                  ]} />
                </View>

                {/* Vehicle Info */}
                <View style={styles.driverCardContent}>
                  <Text style={styles.driverCardName} numberOfLines={1}>
                    {driver.vehicleDetails?.type || 'Tempo'}
                  </Text>
                  <View style={styles.driverCardLocationRow}>
                    <Icon name="location-on" size={12} color="#4CAF50" />
                    <Text style={styles.driverCardVehicleType} numberOfLines={2}>
                      {driver.currentLocation?.address
                        ? driver.currentLocation.address
                        : driver.address && driver.city
                        ? `${driver.address}, ${driver.city}`
                        : driver.address || driver.city || 'On duty'}
                    </Text>
                  </View>

                  {/* Contact row — permanent drivers only */}
                  {driver.isPermanent && driver.mobileNumber && (
                    <View style={styles.driverCardContactRow}>
                      <Icon name="phone" size={11} color="#16A34A" />
                      <Text style={styles.driverCardContactText} numberOfLines={1}>
                        {driver.mobileNumber}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
          </View>{/* end sheetContentArea */}
        </View>
      </Animated.View>

      {/* Floating Action Button - Book Ride */}
      {dropLocation && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 100 }]}
          onPress={handleBookRide}
          activeOpacity={0.9}
        >
          <Icon name="add" size={32} color="#fff" />
        </TouchableOpacity>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    backgroundColor: '#1a1a1a',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
    // Ensure minimum touch target
    minWidth: 44,
    minHeight: 44,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ccc',
    marginBottom: 2,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropLocationBar: {
    marginBottom: 0,
  },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  locationText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  placeholderText: {
    color: '#999',
    fontWeight: '400',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  pickupMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  mapControls: {
    position: 'absolute',
    right: 20,
  },
  mapControlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  vehicleMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: height * 0.85, // Match EXPANDED_HEIGHT (85% of screen)
    overflow: 'hidden',
  },
  bottomSheetContent: {
    flex: 1,
    flexDirection: 'column',
  },
  sheetHeaderZone: {
    flexShrink: 0,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sheetContentArea: {
    flex: 1,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  bottomSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  vehiclesList: {
    padding: 20,
    paddingTop: 0,
  },
  driversScrollView: {
    flex: 1,
  },
  driversGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 8,
  },
  driverCard: {
    width: (width - 28) / 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  driverVehicleImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#f5f5f5',
  },
  driverVehicleImagePlaceholder: {
    width: '100%',
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverCardContent: {
    padding: 8,
  },
  driverCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  driverCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverCardLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
    marginTop: 4,
  },
  driverCardVehicleType: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  driverCardVehicleNumber: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  driverCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  driverCardRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  driverCardDistance: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 2,
  },
  dutyDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  driverCardContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  driverCardContactText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
  },
  clearSearchButton: {
    padding: 4,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: 200,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    flex: 1,
    marginLeft: 12,
  },
  suggestionMainText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  suggestionSecondaryText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  filterScroll: {
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  vehicleCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  vehicleCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  vehicleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  vehicleType: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 2,
  },
  vehicleNumber: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  vehicleDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  vehicleAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  notificationBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 12,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
  },
  notificationBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationBannerText: {
    flex: 1,
  },
  notificationBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  notificationBannerMessage: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
  },
  fab: {
    position: 'absolute',
    bottom: height * 0.3 + 20,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  // ── Permanent Drivers Section ──────────────────────────────────────────────
  permSection: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 14,
    paddingBottom: 8,
  },
  permSectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  permSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  permSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
  },
  permSectionSub: {
    fontSize: 12,
    color: '#888',
    marginLeft: 24,
  },
  permCardsRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  permCard: {
    width: 150,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E3F2FD',
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  permPhotoWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 8,
    alignSelf: 'center',
    position: 'relative',
  },
  permPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#BBDEFB',
  },
  permPhotoFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permPhotoInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  permFeaturedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFC107',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  permName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 2,
  },
  permVehicle: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginBottom: 6,
  },
  permBadgeRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginBottom: 5,
    flexWrap: 'wrap',
  },
  permBadgeVerified: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  permBadgeVerifiedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1565C0',
    letterSpacing: 0.5,
  },
  permBadgePricing: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  permBadgePricingText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2E7D32',
    letterSpacing: 0.5,
  },
  permPricingLine: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 4,
  },
  permMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    justifyContent: 'center',
    marginBottom: 2,
  },
  permMetaText: {
    fontSize: 11,
    color: '#888',
    maxWidth: 110,
  },
  permActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  permCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingVertical: 7,
  },
  permCallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  permWaBtn: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 7,
  },
  activeTripBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 800,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  activeTripBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activeTripPulse: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTripBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  activeTripBannerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  activeTripBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  activeTripBannerTrack: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  activeTripOtpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  activeTripOtpLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  activeTripOtpCode: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  driverCallout: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    minWidth: 140,
    maxWidth: 200,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  driverCalloutType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  driverCalloutAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
  },
  driverCalloutAddress: {
    fontSize: 11,
    color: '#555',
    flex: 1,
    lineHeight: 15,
  },
});
