import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  PanResponder,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { vehiclesAPI } from '../services/vehiclesAPI';
import { placesAPI, PlaceSuggestion } from '../services/placesAPI';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../lib/env';
import { useNotifications } from '../contexts/NotificationContext';

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
  distance?: number; // Calculated distance for nearby sorting
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lastNotification: contextLastNotification } = useNotifications();
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const [userEmail, setUserEmail] = useState('');
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
  const [showBookingSheet, setShowBookingSheet] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Filters and search
  const [filteredDrivers, setFilteredDrivers] = useState<Driver[]>([]);
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('All');
  const [pickupSearchQuery, setPickupSearchQuery] = useState<string>(''); // For searching pickup points
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  
  const mapRef = useRef<MapView>(null);
  
  // Bottom sheet animation values
  const COLLAPSED_HEIGHT = height * 0.3; // 30% of screen
  const EXPANDED_HEIGHT = height * 0.85; // 85% of screen (leaves some space at top)
  const bottomSheetAnim = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const panY = useRef(new Animated.Value(0)).current; // Track pan gesture
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  const currentSheetHeight = useRef(COLLAPSED_HEIGHT); // Track current height for smooth transitions
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // PanResponder for dragging bottom sheet (industry standard implementation)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // Allow starting from anywhere on the sheet
        return true;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
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
        const distance = Math.abs(gestureState.dy);
        
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
    initializeSocket();
    loadStoredLocations();
    
    return () => {
      if (socket) {
        socket.disconnect();
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
  }, [pickupLocationCoords, userLocation, loadNearbyVehicles]);

  const initializeSocket = async () => {
    try {
      // Get authentication token
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        console.log('⚠️ No token found, skipping Socket.IO connection');
        return;
      }

      const newSocket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        auth: {
          token: token,
        },
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to Socket.IO (authenticated)');
      });

      newSocket.on('connect_error', async (error: any) => {
        console.error('❌ Socket.IO connection error:', error);
        
        // Check if it's a token expiration error
        if (error.message?.includes('expired') || error.message?.includes('Invalid or expired token')) {
          console.log('⚠️ Token expired, clearing stored token');
          await AsyncStorage.removeItem('userToken');
          // Optionally redirect to login or show a message
          Alert.alert(
            'Session Expired',
            'Your session has expired. Please log in again.',
            [
              {
                text: 'OK',
                onPress: () => {
                  router.replace('/login');
                }
              }
            ]
          );
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from Socket.IO:', reason);
      });

      // Listen for vehicle location updates
      newSocket.on('vehicle-location-updated', (data: any) => {
        updateVehicleLocation(data);
      });

      // Listen for new notifications (in case customer is on home screen)
      newSocket.on('new-notification', (data: any) => {
        console.log('📬 New notification received on home screen:', data);
        // Haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Haptics.impactAsync(Haptics.ImpactFeedbackType.Medium);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

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

      const location = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(coords);

      // Get address
      const [address] = await Location.reverseGeocodeAsync(coords);
      if (address) {
        const addressString = `${address.street || ''} ${address.city || ''} ${address.region || ''}`.trim() ||
          'Current Location';
        setPickupLocation(addressString);
        
        // Only set as pickup location coords if no pickup location is already set
        if (!pickupLocationCoords) {
          setPickupLocationCoords(coords);
        }
      }

      // Center map on user location only if no pickup location is set
      if (mapRef.current && !pickupLocationCoords) {
        mapRef.current.animateToRegion({
          ...coords,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      }
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

  // Load all registered drivers with filters
  const loadAllDrivers = useCallback(async () => {
    try {
      setLoadingDrivers(true);
      
      // If pickup location is set, get nearby drivers first
      let nearbyDrivers: Driver[] = [];
      if (pickupLocationCoords) {
        try {
          const nearbyResponse = await vehiclesAPI.getNearbyVehicles(
            pickupLocationCoords.latitude,
            pickupLocationCoords.longitude,
            10 // 10km radius
          );
          if (nearbyResponse.ok && nearbyResponse.data) {
            // Convert vehicle format to driver format for nearby results
            // For now, we'll use all drivers and filter by location later
          }
        } catch (error) {
          console.log('No nearby drivers found, showing all');
        }
      }
      
      // Get all drivers
      const response = await vehiclesAPI.getAllDrivers(100, 0);
      
      if (response.ok && response.data) {
        let allDrivers = response.data;
        
        // Filter by vehicle type if selected
        if (selectedVehicleType !== 'All') {
          allDrivers = allDrivers.filter(driver => 
            driver.vehicleDetails?.type === selectedVehicleType
          );
        }
        
        // If pickup location is set, prioritize nearby drivers
        if (pickupLocationCoords) {
          // Calculate distance and sort by proximity
          allDrivers = allDrivers.map(driver => {
            if (driver.currentLocation?.coordinates) {
              const [lon, lat] = driver.currentLocation.coordinates;
              const distance = calculateDistance(
                pickupLocationCoords.latitude,
                pickupLocationCoords.longitude,
                lat,
                lon
              );
              return { ...driver, distance };
            }
            return { ...driver, distance: Infinity };
          }).sort((a: any, b: any) => (a.distance || Infinity) - (b.distance || Infinity));
        }
        
        setDrivers(allDrivers);
        applyFilters(allDrivers);
        console.log(`✅ Loaded ${allDrivers.length} drivers`);
      }
    } catch (error: any) {
      console.error('Error loading drivers:', error);
    } finally {
      setLoadingDrivers(false);
    }
  }, [pickupLocationCoords, selectedVehicleType]);

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

  // Handle search for pickup points (debounced)
  const handleSearchPickupPoints = async (query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (query.trim().length < 2) {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      setSearching(false);
      return;
    }
    
    setSearching(true);
    setShowSearchSuggestions(true);
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const location = pickupLocationCoords || userLocation;
        const response = await placesAPI.getAutocomplete(
          query,
          location ? { latitude: location.latitude, longitude: location.longitude } : undefined,
          10000 // 10km radius
        );
        
        if (response.ok && response.data) {
          setSearchSuggestions(response.data);
        }
      } catch (error: any) {
        console.error('Error searching pickup points:', error);
        setSearchSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce
  };

  // Handle pickup point selection
  const handleSelectPickupPoint = async (suggestion: PlaceSuggestion) => {
    try {
      const response = await placesAPI.getPlaceDetails(suggestion.placeId);
      if (response.ok && response.data) {
        const place = response.data;
        setPickupLocation(place.address);
        setPickupLocationCoords({
          latitude: place.latitude,
          longitude: place.longitude,
        });
        setPickupSearchQuery('');
        setShowSearchSuggestions(false);
        
        // Store pickup location
        await AsyncStorage.setItem('pickupLocation', JSON.stringify({
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        }));
        
        // Center map on pickup location
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: place.latitude,
            longitude: place.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }, 1000);
        }
        
        // Reload drivers with new pickup location
        setTimeout(() => {
          loadAllDrivers();
        }, 500);
      }
    } catch (error: any) {
      console.error('Error getting place details:', error);
    }
  };

  // Update filters when they change
  useEffect(() => {
    if (drivers.length > 0) {
      applyFilters(drivers);
    }
  }, [selectedVehicleType, drivers]);
  
  // Load drivers when pickup location or filters change
  useEffect(() => {
    if (pickupLocationCoords || userLocation) {
      loadAllDrivers();
    }
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
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: pickup.latitude,
                longitude: pickup.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }, 1000);
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
      const apiUrl = API_URL || 'http://192.168.12.81:5000';
      
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
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userEmail');
    await AsyncStorage.removeItem('userId');
    await AsyncStorage.removeItem('userName');
    if (socket) socket.disconnect();
    router.replace('/login');
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
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: vehicle.currentLocation.latitude,
        longitude: vehicle.currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  const handleMyLocation = () => {
    // Center on pickup location if set, otherwise user location
    const centerLocation = pickupLocationCoords || userLocation;
    if (centerLocation && mapRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      mapRef.current.animateToRegion({
        ...centerLocation,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
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
      
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.userInfo}>
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
              <Text style={styles.greeting}>Hello</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {userName && userName.trim() ? userName.trim() : 'User'}
              </Text>
            </View>
          </View>
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
            <Text style={styles.locationLabel}>Pickup Location</Text>
            <Text style={[styles.locationText, !pickupLocation && styles.placeholderText]} numberOfLines={1}>
              {pickupLocation || 'Where from?'}
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
            <Text style={styles.locationLabel}>Drop Location</Text>
            <Text style={[styles.locationText, !dropLocation && styles.placeholderText]} numberOfLines={1}>
              {dropLocation || 'Where to?'}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        {(pickupLocationCoords || userLocation) ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: (pickupLocationCoords || userLocation)!.latitude,
              longitude: (pickupLocationCoords || userLocation)!.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation={!pickupLocationCoords} // Only show user location if no pickup location set
            showsMyLocationButton={false}
            mapType="standard"
          >
            {/* Pickup Location Marker */}
            {pickupLocationCoords && (
              <Marker
                coordinate={pickupLocationCoords}
                title="Pickup Location"
                description={pickupLocation}
                pinColor="#4CAF50"
              >
                <View style={styles.pickupMarker}>
                  <Icon name="location-on" size={30} color="#4CAF50" />
                </View>
              </Marker>
            )}

            {/* User Location Marker (only if no pickup location) */}
            {userLocation && !pickupLocationCoords && (
              <Marker
                coordinate={userLocation}
                title="Your Location"
                pinColor="#4CAF50"
              />
            )}

            {/* Vehicle Markers */}
            {vehicles.map((vehicle) => (
              <Marker
                key={vehicle.vehicleId}
                coordinate={{
                  latitude: vehicle.currentLocation.latitude,
                  longitude: vehicle.currentLocation.longitude,
                }}
                title={`${vehicle.driverName} - ${vehicle.vehicleType}`}
                description={`${vehicle.distance.toFixed(1)} km away • ₹${vehicle.costPerKm}/km`}
                onPress={() => handleVehicleSelect(vehicle)}
              >
                <View
                  style={[
                    styles.vehicleMarker,
                    {
                      backgroundColor: getVehicleColor(vehicle.vehicleType),
                      borderColor: selectedVehicle?.vehicleId === vehicle.vehicleId ? '#fff' : 'transparent',
                    },
                  ]}
                >
                  <Icon
                    name={getVehicleIcon(vehicle.vehicleType)}
                    size={24}
                    color="#fff"
                  />
                </View>
              </Marker>
            ))}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.mapPlaceholderText}>Loading map...</Text>
          </View>
        )}

        {/* Map Controls */}
        <View style={[styles.mapControls, { bottom: Platform.OS === 'android' ? insets.bottom + 90 : insets.bottom + 100 }]}>
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
            bottom: Platform.OS === 'android' ? insets.bottom + 70 : insets.bottom + 85, // Account for tab bar + system nav
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.bottomSheetContent}>
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>
              Available Vehicles ({filteredDrivers.length})
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                loadAllDrivers();
              }}
            >
              <Icon name="refresh" size={24} color="#4CAF50" />
            </TouchableOpacity>
          </View>

          {/* Filters and Search Bar */}
          <View style={styles.filtersContainer}>
          {/* Search Bar for Pickup Points */}
          <View style={styles.searchBarContainer}>
            <Icon name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search pickup points..."
              placeholderTextColor="#999"
              value={pickupSearchQuery}
              onChangeText={(text) => {
                setPickupSearchQuery(text);
                handleSearchPickupPoints(text);
              }}
              onFocus={() => {
                if (pickupSearchQuery.length >= 2) {
                  setShowSearchSuggestions(true);
                }
              }}
            />
            {pickupSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setPickupSearchQuery('');
                  setShowSearchSuggestions(false);
                  setSearchSuggestions([]);
                }}
                style={styles.clearSearchButton}
              >
                <Icon name="close" size={18} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          {/* Search Suggestions Dropdown */}
          {showSearchSuggestions && searchSuggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <ScrollView style={styles.suggestionsList} nestedScrollEnabled>
                {searchSuggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectPickupPoint(suggestion)}
                  >
                    <Icon name="place" size={20} color="#4CAF50" />
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionMainText} numberOfLines={1}>
                        {suggestion.mainText}
                      </Text>
                      <Text style={styles.suggestionSecondaryText} numberOfLines={1}>
                        {suggestion.secondaryText}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Vehicle Type Filter */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContainer}
          >
            {['All', 'Tempo', 'Pickup', 'Tata Ace', 'Bolero Pickup', 'Eicher Mini', 'Mini Truck'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  selectedVehicleType === type && styles.filterChipActive,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedVehicleType(type);
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedVehicleType === type && styles.filterChipTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          </View>

        {loadingDrivers ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.emptyStateText}>Loading drivers...</Text>
          </View>
        ) : filteredDrivers.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="directions-car" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No drivers available</Text>
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
                  router.push({
                    pathname: '/driver-detail',
                    params: { driverId: driver._id },
                  });
                }}
                activeOpacity={0.7}
              >
                {/* Vehicle Image */}
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

                {/* Vehicle Info - Show Vehicle Name instead of Driver Name */}
                <View style={styles.driverCardContent}>
                  <View style={styles.driverCardNameRow}>
                    <Text style={styles.driverCardName} numberOfLines={1}>
                      {driver.vehicleDetails?.type || 'Tempo'}
                    </Text>
                    {/* Status Indicator Dot */}
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            driver.status === 'ONLINE' ? '#4CAF50' : '#f44336',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.driverCardVehicleType} numberOfLines={2}>
                    {driver.status === 'ONLINE' && driver.currentLocation?.address
                      ? driver.currentLocation.address
                      : driver.status !== 'ONLINE' && driver.address && driver.city
                      ? `${driver.address}, ${driver.city}`
                      : driver.address
                      ? driver.address
                      : driver.city
                      ? driver.city
                      : 'Location not available'}
                  </Text>
                  {driver.distance !== undefined && driver.distance < Infinity && (
                    <Text style={styles.driverCardDistance} numberOfLines={1}>
                      {driver.distance.toFixed(1)} km away
                    </Text>
                  )}
                  {driver.rating !== undefined && driver.rating > 0 && (
                    <View style={styles.driverCardRating}>
                      <Icon name="star" size={14} color="#FFD600" />
                      <Text style={styles.driverCardRatingText}>
                        {driver.rating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        </View>
      </Animated.View>

      {/* Floating Action Button - Book Ride */}
      {dropLocation && (
        <TouchableOpacity
          style={[styles.fab, { bottom: Platform.OS === 'android' ? insets.bottom + 90 : insets.bottom + 100 }]}
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
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    // Make handle area larger for easier dragging
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 12,
  },
  bottomSheetTitle: {
    fontSize: 18,
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
    padding: 12,
    paddingTop: 0,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  driverCard: {
    width: (width - 48) / 2, // 2 cards per row with padding
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  driverVehicleImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#f5f5f5',
  },
  driverVehicleImagePlaceholder: {
    width: '100%',
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverCardContent: {
    padding: 12,
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
  driverCardVehicleType: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 2,
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
    marginTop: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterChipActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
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
    alignItems: 'center',
    paddingVertical: 40,
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
});
