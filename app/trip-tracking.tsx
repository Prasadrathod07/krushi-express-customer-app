import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { tripsAPI } from '../services/tripsAPI';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/notificationService';
import { useTrip } from '../contexts/TripContext';
import { getRouteInfo, formatDistance, formatDuration, formatArrivalTime } from '../services/directionsService';
import VehicleMarker from '../components/VehicleMarker';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Trip {
  _id: string;
  customerId: string;
  driverId?: string;
  pickupLocation: {
    type: string;
    coordinates: number[];
    address?: string;
  };
  dropLocation: {
    type: string;
    coordinates: number[];
    address?: string;
  };
  parcelDetails: {
    type: string;
    category: string;
    weight: string;
    images: string[];
    description?: string;
    budget: number;
  };
  currentTripState: string;
  estimatedFare: number;
  driverCurrentLocation?: {
    type: string;
    coordinates: number[];
  };
  estimatedTimeToPickup?: number;
  estimatedTimeToDelivery?: number;
  otp?: string;
  otpVerified?: boolean;
  otpGeneratedAt?: string;
  driver?: {
    name: string;
    phone: string;
    email?: string;
    vehicleDetails?: {
      type: string;
      number: string;
    };
    vehicleType?: string;
    vehicleNumber?: string;
  };
}

export default function TripTracking() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tripId = params.id as string;
  const insets = useSafeAreaInsets();
  const { activeTrip, setActiveTrip, updateTripState, clearActiveTrip } = useTrip();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [distanceText, setDistanceText] = useState<string | null>(null);
  const [arrivalTimeText, setArrivalTimeText] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasCheckedRating, setHasCheckedRating] = useState(false);
  const [showCompletedOverlay, setShowCompletedOverlay] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [dropRouteCoordinates, setDropRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [driverHeading, setDriverHeading] = useState<number>(0); // Direction in degrees (0-360)
  const previousDriverLocation = useRef<{ latitude: number; longitude: number } | null>(null);
  const routeFetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const locationPollInterval = useRef<NodeJS.Timeout | null>(null);

  const mapRef = useRef<MapView>(null);
  const driverCancelHandledRef = useRef(false);
  
  // Calculate bearing between two coordinates (in degrees)
  const calculateBearing = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number => {
    const lat1 = from.latitude * Math.PI / 180;
    const lat2 = to.latitude * Math.PI / 180;
    const deltaLon = (to.longitude - from.longitude) * Math.PI / 180;

    const x = Math.sin(deltaLon) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    const bearing = Math.atan2(x, y) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
  };

  // CRITICAL FIX: Sync with TripContext - use activeTrip as source of truth
  useEffect(() => {
    if (activeTrip && activeTrip._id === tripId) {
      setTrip(activeTrip);
      if (activeTrip.otp) {
        setOtp(activeTrip.otp);
      }
    }
  }, [activeTrip, tripId]);

  useEffect(() => {
    // Request notification permissions on mount
    notificationService.requestPermissions();
    
    loadTrip();
    initializeSocket();

    return () => {
      if (socket) {
        // Leave the trip room before disconnecting so the server cleans up subscription
        socket.emit('leave-trip-room', { tripId });
        socket.removeAllListeners();
        socket.disconnect();
      }
      if (locationPollInterval.current) {
        clearInterval(locationPollInterval.current);
        locationPollInterval.current = null;
      }
      if (routeFetchTimeout.current) clearTimeout(routeFetchTimeout.current);
      // Do NOT call notificationService.removeAllListeners() here — that destroys
      // the global listener set up by _layout.tsx, crashing the next notification.
    };
  }, [tripId]);

  useEffect(() => {
    if (trip?.driverCurrentLocation) {
      const [lng, lat] = trip.driverCurrentLocation.coordinates;
      setDriverLocation({ latitude: lat, longitude: lng });

      if (trip.currentTripState === 'ENROUTE_TO_PICKUP' || trip.currentTripState === 'ACCEPTED') {
        setEta(trip.estimatedTimeToPickup || null);
      } else if (trip.currentTripState === 'ENROUTE_TO_DELIVERY' || trip.currentTripState === 'PICKED_UP') {
        setEta(trip.estimatedTimeToDelivery || null);
      }
    }
  }, [trip]);

  // Fetch road route from driver → pickup whenever driver location changes (debounced)
  useEffect(() => {
    if (!driverLocation || !trip?.pickupLocation) return;
    const state = trip.currentTripState;
    if (!['ACCEPTED', 'ENROUTE_TO_PICKUP'].includes(state)) return;
    if (routeFetchTimeout.current) clearTimeout(routeFetchTimeout.current);
    routeFetchTimeout.current = setTimeout(async () => {
      try {
        const pickup = {
          latitude: trip.pickupLocation.coordinates[1],
          longitude: trip.pickupLocation.coordinates[0],
        };
        const info = await getRouteInfo(driverLocation, pickup);
        setRouteCoordinates(info.coordinates);
        setDistance(info.distance);
        setDistanceText(info.distanceText);
        setEta(info.duration);
        setEtaText(info.durationText);
        setArrivalTimeText(info.arrivalTime);
      } catch {}
    }, 1500);
    return () => { if (routeFetchTimeout.current) clearTimeout(routeFetchTimeout.current); };
  }, [driverLocation]);

  // Fetch road route pickup → drop once (for delivery phase)
  useEffect(() => {
    if (!trip?.pickupLocation || !trip?.dropLocation) return;
    const pickup = { latitude: trip.pickupLocation.coordinates[1], longitude: trip.pickupLocation.coordinates[0] };
    const drop   = { latitude: trip.dropLocation.coordinates[1],   longitude: trip.dropLocation.coordinates[0] };
    getRouteInfo(pickup, drop).then(info => setDropRouteCoordinates(info.coordinates)).catch(() => {});
  }, [trip?._id]);

  // Polling fallback: when driver location is missing, poll trip every 5s until we get it
  useEffect(() => {
    const ACTIVE_STATES = ['ACCEPTED','ENROUTE_TO_PICKUP','ARRIVED_AT_PICKUP','PICKED_UP','ENROUTE_TO_DELIVERY','ARRIVED_AT_DELIVERY','DELIVERING'];
    const state = trip?.currentTripState;

    if (!state || !ACTIVE_STATES.includes(state)) {
      if (locationPollInterval.current) {
        clearInterval(locationPollInterval.current);
        locationPollInterval.current = null;
      }
      return;
    }

    // Already have location — clear poll
    if (driverLocation) {
      if (locationPollInterval.current) {
        clearInterval(locationPollInterval.current);
        locationPollInterval.current = null;
      }
      return;
    }

    // Start polling
    if (!locationPollInterval.current) {
      locationPollInterval.current = setInterval(async () => {
        try {
          const res = await tripsAPI.getTrip(tripId) as any;
          if (res.ok && res.data?.driverCurrentLocation) {
            const [lng, lat] = res.data.driverCurrentLocation.coordinates;
            const newLoc = { latitude: lat, longitude: lng };
            setDriverLocation(newLoc);
            setTrip(res.data);
            // Once we have location, stop polling
            if (locationPollInterval.current) {
              clearInterval(locationPollInterval.current);
              locationPollInterval.current = null;
            }
          }
        } catch {}
      }, 5000);
    }

    return () => {
      if (locationPollInterval.current) {
        clearInterval(locationPollInterval.current);
        locationPollInterval.current = null;
      }
    };
  }, [driverLocation, trip?.currentTripState, tripId]);

  useEffect(() => {
    if (!driverLocation || !mapRef.current) return;
    const state = trip?.currentTripState;
    if (state === 'ACCEPTED' || state === 'ENROUTE_TO_PICKUP') {
      // Fit map to show both driver and pickup
      if (trip?.pickupLocation) {
        const pickup = { latitude: trip.pickupLocation.coordinates[1], longitude: trip.pickupLocation.coordinates[0] };
        mapRef.current.fitToCoordinates([driverLocation, pickup], {
          edgePadding: { top: 60, right: 40, bottom: 80, left: 40 },
          animated: true,
        });
      }
    } else if (state === 'PICKED_UP' || state === 'ENROUTE_TO_DELIVERY') {
      // Fit map to show driver and drop
      if (trip?.dropLocation) {
        const drop = { latitude: trip.dropLocation.coordinates[1], longitude: trip.dropLocation.coordinates[0] };
        mapRef.current.fitToCoordinates([driverLocation, drop], {
          edgePadding: { top: 60, right: 40, bottom: 80, left: 40 },
          animated: true,
        });
      }
    } else {
      mapRef.current.animateToRegion({ ...driverLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 1000);
    }
  }, [driverLocation]);

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        auth: {
          token: token || '',
        },
      });

      newSocket.on('connect', async () => {
        console.log('✅ Connected to Socket.IO');
        
        // Subscribe to trip updates
        const userId = await AsyncStorage.getItem('userId');
        newSocket.emit('subscribe-trip', {
          tripId,
          userId,
          userType: 'customer',
        });
      });

      newSocket.on('driver-location-updated', (data: any) => {
        if (data.tripId === tripId && data.driverLocation) {
          // Update driver location state immediately
          const newLocation = {
            latitude: data.driverLocation.latitude,
            longitude: data.driverLocation.longitude,
          };
          
          // Calculate heading/direction based on previous location
          if (previousDriverLocation.current) {
            const bearing = calculateBearing(previousDriverLocation.current, newLocation);
            setDriverHeading(bearing);
          }
          previousDriverLocation.current = newLocation;
          
          setDriverLocation(newLocation);
          
          // Update ETA and distance from socket (backend sends raw numbers)
          if (data.eta !== undefined && data.eta !== null) {
            setEta(data.eta);
            setEtaText(formatDuration(data.eta));
            setArrivalTimeText(formatArrivalTime(data.eta));
          }
          if (data.distance !== undefined && data.distance !== null) {
            setDistance(data.distance);
            setDistanceText(formatDistance(data.distance));
          }
          
          // Road route is fetched via useEffect on driverLocation change
          
          // Update map to show driver location
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              ...newLocation,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }, 500);
          }
        }
      });

      // Listen for trip acceptance - CRITICAL: Only update state, navigation handled by TripContext
      newSocket.on('trip-accepted', async (data: any) => {
        if (data.tripId === tripId) {
          console.log('🎉 Trip accepted event received:', data);
          
          // Show success haptic
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          // CRITICAL: Update context and local state - TripContext handles navigation
          if (data.trip) {
            const tripData = {
              ...data.trip,
              currentTripState: data.trip.currentTripState || 'ACCEPTED',
              otp: data.otp || data.trip.otp,
            };
            
            // Update local state
            setTrip(tripData);
            
            // Update context (source of truth) - TripContext will navigate if needed
            setActiveTrip(tripData);
            
            // Set OTP if available
            if (data.otp || data.trip.otp) {
              setOtp(data.otp || data.trip.otp);
            }
            
            // Force re-render
            setLoading(false);
          }
          
          // Reload trip to get latest state and driver info
          setTimeout(() => {
            loadTrip();
          }, 1000);
        }
      });

      // Listen for OTP verification
      newSocket.on('otp-verified', (data: any) => {
        if (data.tripId === tripId) {
          setOtpVerified(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });

      newSocket.on('trip-state-updated', (data: any) => {
        if (data.tripId === tripId) {
          const previousState = trip?.currentTripState;

          // Driver cancelled — show popup and offer to find another driver
          if (data.state === 'DRIVER_CANCELLED') {
            if (driverCancelHandledRef.current) return;
            driverCancelHandledRef.current = true;
            clearActiveTrip();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            const pickupParam = trip?.pickupLocation ? JSON.stringify(trip.pickupLocation) : undefined;
            const dropParam   = trip?.dropLocation   ? JSON.stringify(trip.dropLocation)   : undefined;
            Alert.alert(
              'Driver Not Available',
              'The driver is not ready for this trip. Please book another driver or try after some time.',
              [
                { text: 'Find Another Driver', onPress: () => router.replace({ pathname: '/searching-drivers', params: { pickupLocation: pickupParam, dropLocation: dropParam } }) },
                { text: 'Go Home', style: 'cancel', onPress: () => router.replace('/(tabs)/home') },
              ],
              { cancelable: false },
            );
            return;
          }

          // CRITICAL FIX: Update context
          updateTripState(tripId, data.state, data.trip);

          loadTrip().then(() => {
            // Check if trip just completed and show rating prompt
            if (previousState !== 'COMPLETED' && data.state === 'COMPLETED') {
              // Small delay to let user see completion
              setTimeout(() => {
                showRatingPrompt();
              }, 2000);
            }
          });
        }
      });

      // Direct trip-cancelled event (emitted to customer room by backend)
      newSocket.on('trip-cancelled', (data: any) => {
        if (data.tripId?.toString() === tripId && data.cancelledBy === 'driver') {
          if (driverCancelHandledRef.current) return;
          driverCancelHandledRef.current = true;
          clearActiveTrip();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const pickupParam = trip?.pickupLocation ? JSON.stringify(trip.pickupLocation) : undefined;
          const dropParam   = trip?.dropLocation   ? JSON.stringify(trip.dropLocation)   : undefined;
          Alert.alert(
            'Driver Not Available',
            'The driver is not ready for this trip. Please book another driver or try after some time.',
            [
              { text: 'Find Another Driver', onPress: () => router.replace({ pathname: '/searching-drivers', params: { pickupLocation: pickupParam, dropLocation: dropParam } }) },
              { text: 'Go Home', style: 'cancel', onPress: () => router.replace('/(tabs)/home') },
            ],
            { cancelable: false },
          );
        }
      });

      // Handle edge case notifications
      newSocket.on('driver-offline-notification', (data: any) => {
        if (data.tripId === tripId) {
          Alert.alert(
            'Driver Offline',
            data.message || 'Your driver has gone offline. Please contact support if needed.',
            [{ text: 'OK' }]
          );
        }
      });

      newSocket.on('pickup-code-regenerated', (data: any) => {
        if (data.tripId === tripId) {
          Alert.alert(
            'New Pickup Code',
            data.message || 'A new pickup code has been generated. Please check with the driver.',
            [{ text: 'OK' }]
          );
        }
      });

      // Stale trip check — ask customer if trip is still happening
      newSocket.on('stale-trip-check', (data: any) => {
        if (data.tripId === tripId) {
          Alert.alert(
            'Is This Trip Still Active?',
            'Your trip has been accepted for a while with no pickup. Is it still happening?',
            [
              {
                text: 'No, Cancel It',
                style: 'destructive',
                onPress: async () => {
                  try {
                    const token = await AsyncStorage.getItem('userToken');
                    await fetch(`${require('../lib/env').API_URL}/api/trips/${tripId}/stale-response`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ response: 'NO' }),
                    });
                  } catch {}
                },
              },
              {
                text: 'Yes, Still Active',
                onPress: async () => {
                  try {
                    const token = await AsyncStorage.getItem('userToken');
                    await fetch(`${require('../lib/env').API_URL}/api/trips/${tripId}/stale-response`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ response: 'YES' }),
                    });
                  } catch {}
                },
              },
            ],
            { cancelable: false },
          );
        }
      });

      // Listen for negotiation updates from driver
      newSocket.on('negotiation-updated', (data: any) => {
        if (data.tripId === tripId) {
          console.log('💰 Negotiation update received:', data);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          // Reload trip to get updated negotiation history
          loadTrip();
          
          // Show notification to user
          Alert.alert(
            'New Price Offer',
            `Driver has sent a new price offer: ₹${data.negotiation?.amount || 'N/A'}`,
            [{ text: 'OK' }]
          );
        }
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

  const loadTrip = async () => {
    try {
      if (__DEV__) {
        console.log('📥 Loading trip:', tripId);
      }
      
      const response = await tripsAPI.getTrip(tripId);
      
      if (__DEV__) {
        console.log('📥 Trip response:', {
          ok: response.ok,
          hasData: !!response.data,
          tripState: response.data?.currentTripState,
          hasDriver: !!response.data?.driverId,
        });
      }
      
      if (response.ok && response.data) {
        const updatedTrip = response.data;
        setTrip(updatedTrip);
        
        // Debug log driver info
        if (__DEV__) {
          console.log('📋 Trip loaded - Driver info:', {
            hasDriver: !!updatedTrip.driver,
            hasDriverId: !!updatedTrip.driverId,
            driverType: typeof updatedTrip.driver,
            driverIdType: typeof updatedTrip.driverId,
            driver: updatedTrip.driver,
            driverId: updatedTrip.driverId,
            state: updatedTrip.currentTripState
          });
        }
        
        // Set OTP if available
        if (updatedTrip.otp) {
          setOtp(updatedTrip.otp);
        }
        if (updatedTrip.otpVerified) {
          setOtpVerified(true);
        }
        
        // Check if trip is completed — show overlay (only once)
        if (updatedTrip.currentTripState === 'COMPLETED' && !hasCheckedRating) {
          setHasCheckedRating(true);
          setShowCompletedOverlay(true);
          // Check if already rated
          try {
            const ratingResponse = await tripsAPI.getTripRating(tripId);
            if (ratingResponse.ok && !ratingResponse.data) {
              // Not rated yet, show prompt after delay
              setTimeout(() => {
                showRatingPrompt();
              }, 2000);
            }
          } catch (error) {
            // If error checking, still show prompt
            setTimeout(() => {
              showRatingPrompt();
            }, 2000);
          }
        }
      } else {
        if (__DEV__) {
          console.error('❌ Trip response not ok:', response);
        }
        Alert.alert('Error', response.message || 'Failed to load trip details.');
        router.back();
      }
    } catch (error: any) {
      console.error('❌ Error loading trip:', error);
      if (__DEV__) {
        console.error('   Error details:', {
          message: error.message,
          code: error.code,
          status: error.status,
          stack: error.stack,
        });
      }
      // Don't show alert if it's a 404 or network error - just go back
      if (error.status === 404 || error.code === 'NOT_FOUND') {
        console.warn('Trip not found, navigating back');
        router.back();
      } else if (error.isNetworkError || error.code === 'NETWORK_ERROR') {
        Alert.alert('Connection Error', 'Unable to load trip details. Please check your connection.');
        router.back();
      } else {
        const errorMessage = error.message || error.error || 'Failed to load trip details.';
        Alert.alert('Error', `${errorMessage}\n\nTrip ID: ${tripId}`);
      router.back();
      }
    } finally {
      setLoading(false);
    }
  };

  const showRatingPrompt = () => {
    setShowCompletedOverlay(true);
  };

  const handleCallDriver = () => {
    const driverPhone = trip?.driver?.phone || (typeof trip?.driverId === 'object' ? trip.driverId?.phone : null);
    if (!driverPhone) {
      Alert.alert('Error', 'Driver phone number not available.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${driverPhone}`);
  };

  const handleChatDriver = () => {
    const driverPhone = trip?.driver?.phone || (typeof trip?.driverId === 'object' ? trip.driverId?.phone : null);
    if (!driverPhone) {
      Alert.alert('Error', 'Driver phone number not available.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`sms:${driverPhone}`);
  };

  const getTripStatusText = (state: string) => {
    const statusMap: { [key: string]: { text: string; color: string; icon: string } } = {
      REQUESTED: { text: 'Request Sent', color: '#FF9800', icon: 'schedule' },
      NEGOTIATING: { text: 'Negotiating', color: '#FF9800', icon: 'attach-money' },
      ACCEPTED: { text: 'Driver Accepted', color: '#4CAF50', icon: 'check-circle' },
      ENROUTE_TO_PICKUP: { text: 'Driver Coming', color: '#2196F3', icon: 'directions-car' },
      ARRIVED_AT_PICKUP: { text: 'Driver Arrived', color: '#4CAF50', icon: 'location-on' },
      PICKED_UP: { text: 'Picked Up', color: '#4CAF50', icon: 'check' },
      ENROUTE_TO_DELIVERY: { text: 'On the Way', color: '#2196F3', icon: 'local-shipping' },
      ARRIVED_AT_DELIVERY: { text: 'Arrived', color: '#4CAF50', icon: 'location-on' },
      DELIVERING: { text: 'Delivering', color: '#4CAF50', icon: 'inventory' },
      COMPLETED: { text: 'Completed', color: '#4CAF50', icon: 'check-circle' },
      CANCELLED: { text: 'Cancelled', color: '#f44336', icon: 'cancel' },
      DRIVER_CANCELLED: { text: 'Driver Cancelled', color: '#f44336', icon: 'cancel' },
      CUSTOMER_CANCELLED: { text: 'Cancelled', color: '#f44336', icon: 'cancel' },
    };
    return statusMap[state] || { text: state, color: '#666', icon: 'help' };
  };

  if (loading) {
    return (
      <View style={s.loadWrap}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadTxt}>Loading trip…</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={s.loadWrap}>
        <Icon name="error-outline" size={48} color="#EF4444" />
        <Text style={s.loadTxt}>Trip not found</Text>
        <TouchableOpacity style={s.goBackBtn} onPress={() => router.back()}>
          <Text style={s.goBackTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Guard: trip is still searching — redirect to the correct screen instead of crashing
  if (['REQUESTED', 'PENDING', 'NEW'].includes(trip.currentTripState)) {
    router.replace({ pathname: '/searching-drivers', params: { tripId: trip._id } });
    return null;
  }

  // Guard: trip is in negotiation — redirect to negotiation chat
  if (trip.currentTripState === 'NEGOTIATING') {
    router.replace({ pathname: '/trip-negotiation', params: { tripId: trip._id } });
    return null;
  }

  // Guard: location data missing (race condition during state transition)
  if (!trip.pickupLocation?.coordinates || !trip.dropLocation?.coordinates) {
    return (
      <View style={s.loadWrap}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.loadTxt}>Loading trip details…</Text>
      </View>
    );
  }

  const status     = getTripStatusText(trip.currentTripState);
  const pickupLL   = { latitude: trip.pickupLocation.coordinates[1], longitude: trip.pickupLocation.coordinates[0] };
  const dropLL     = { latitude: trip.dropLocation.coordinates[1],   longitude: trip.dropLocation.coordinates[0] };

  const driverName = trip.driver?.name
    || (typeof trip.driverId === 'object' ? (trip.driverId as any)?.name : null)
    || 'Your Driver';
  const driverVehicle = [
    trip.driver?.vehicleDetails?.type || trip.driver?.vehicleType
      || (typeof trip.driverId === 'object' ? (trip.driverId as any)?.vehicleType : null),
    trip.driver?.vehicleDetails?.number || trip.driver?.vehicleNumber
      || (typeof trip.driverId === 'object' ? (trip.driverId as any)?.vehicleNumber : null),
  ].filter(Boolean).join(' • ') || 'Tempo';

  const otpCode = otp || (trip as any).otp || (trip as any).pickupCode;
  const showOtp = ['ACCEPTED','ENROUTE_TO_PICKUP','ARRIVED_AT_PICKUP'].includes(trip.currentTripState) && !!otpCode && !otpVerified;
  const hasDriver = !!(trip.driver || (trip.driverId && typeof trip.driverId === 'object'));
  const isActive  = ['ACCEPTED','ENROUTE_TO_PICKUP','ARRIVED_AT_PICKUP','PICKED_UP','ENROUTE_TO_DELIVERY','ARRIVED_AT_DELIVERY','DELIVERING'].includes(trip.currentTripState);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen map ── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={s.map}
        initialRegion={{ ...pickupLL, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        mapType="standard"
        scrollEnabled
        zoomEnabled
      >
        {/* Pickup pin */}
        <Marker coordinate={pickupLL} anchor={{ x: 0.5, y: 1 }}>
          <View style={s.pinWrap}>
            <View style={[s.pin, s.pinGreen]}>
              <Icon name="location-on" size={18} color="#fff" />
            </View>
            <View style={[s.pinTip, { borderTopColor: '#16A34A' }]} />
          </View>
        </Marker>

        {/* Drop pin */}
        <Marker coordinate={dropLL} anchor={{ x: 0.5, y: 1 }}>
          <View style={s.pinWrap}>
            <View style={[s.pin, s.pinOrange]}>
              <Icon name="flag" size={18} color="#fff" />
            </View>
            <View style={[s.pinTip, { borderTopColor: '#EA580C' }]} />
          </View>
        </Marker>

        {/* Driver marker — vehicle-specific SVG with direction */}
        {driverLocation && (
          <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }} flat tracksViewChanges={false}>
            <VehicleMarker
              vehicleType={driverVehicle}
              heading={driverHeading}
              size={52}
            />
          </Marker>
        )}

        {/* Route: driver → pickup — white border + blue fill (Google Maps style) */}
        {driverLocation && ['ACCEPTED','ENROUTE_TO_PICKUP'].includes(trip.currentTripState) && <>
          <Polyline
            coordinates={routeCoordinates.length > 1 ? routeCoordinates : [driverLocation, pickupLL]}
            strokeColor="#fff"
            strokeWidth={9}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={routeCoordinates.length > 1 ? routeCoordinates : [driverLocation, pickupLL]}
            strokeColor="#1A73E8"
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        </>}

        {/* Route: pickup → drop — white border + green fill */}
        {['PICKED_UP','ENROUTE_TO_DELIVERY','ARRIVED_AT_DELIVERY','DELIVERING'].includes(trip.currentTripState) && <>
          <Polyline
            coordinates={dropRouteCoordinates.length > 1 ? dropRouteCoordinates : [pickupLL, dropLL]}
            strokeColor="#fff"
            strokeWidth={9}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={dropRouteCoordinates.length > 1 ? dropRouteCoordinates : [pickupLL, dropLL]}
            strokeColor="#16A34A"
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        </>}
      </MapView>

      {/* ── Floating top bar ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.topBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.dismissAll(); router.replace('/(tabs)/home'); }}>
          <Icon name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>

        {/* Status pill */}
        <View style={[s.statusPill, { backgroundColor: status.color + '22', borderColor: status.color }]}>
          <Icon name={status.icon} size={14} color={status.color} />
          <Text style={[s.statusPillTxt, { color: status.color }]}>{status.text}</Text>
        </View>

        {/* Negotiate chat (if negotiating) */}
        {(trip.currentTripState === 'REQUESTED' || trip.currentTripState === 'NEGOTIATING') && (
          <TouchableOpacity style={s.topBtn} onPress={() => router.push({ pathname: '/trip-negotiation', params: { tripId } })}>
            <Icon name="chat" size={22} color="#F97316" />
          </TouchableOpacity>
        )}
        {!(trip.currentTripState === 'REQUESTED' || trip.currentTripState === 'NEGOTIATING') && <View style={s.topBtn} />}
      </View>

      {/* ── ETA card floating on map (Google Maps style) ── */}
      {driverLocation && (etaText || distanceText) && (
        <View style={[s.etaCard, { top: insets.top + 64 }]}>
          {/* Main: big time */}
          <Text style={s.etaBigTime}>{etaText ?? '—'}</Text>
          {/* Row: distance + arrival */}
          <View style={s.etaSubRow}>
            {distanceText && (
              <Text style={s.etaSubTxt}>
                <Icon name="straighten" size={12} color="#6B7280" /> {distanceText}
              </Text>
            )}
            {distanceText && arrivalTimeText && <Text style={s.etaDot}>·</Text>}
            {arrivalTimeText && (
              <Text style={s.etaSubTxt}>{arrivalTimeText}</Text>
            )}
          </View>
        </View>
      )}

      {/* ── Bottom sheet ── */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>

        {/* Driver row */}
        {(hasDriver || isActive) && (
          <View style={s.driverRow}>
            <View style={s.driverAvatarWrap}>
              <Text style={s.driverAvatarLetter}>{driverName.charAt(0).toUpperCase()}</Text>
              <View style={s.onlineDot} />
            </View>
            <View style={s.driverMeta}>
              <Text style={s.driverNameTxt}>{driverName}</Text>
              <Text style={s.driverVehicleTxt}>{driverVehicle}</Text>
            </View>
            <View style={s.driverBtns}>
              <TouchableOpacity style={[s.iconBtn, s.callBtn]} onPress={handleCallDriver}>
                <Icon name="phone" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.iconBtn, s.chatBtn]} onPress={handleChatDriver}>
                <Icon name="chat" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Divider */}
        {(hasDriver || isActive) && <View style={s.divider} />}

        {/* Route summary */}
        <View style={s.routeRow}>
          <View style={s.routeDots}>
            <View style={[s.dot, s.dotG]} />
            <View style={s.routeVLine} />
            <View style={[s.dot, s.dotO]} />
          </View>
          <View style={s.routeAddrs}>
            <Text style={s.routeAddrTxt} numberOfLines={1}>{trip.pickupLocation.address || 'Pickup'}</Text>
            <View style={{ height: 12 }} />
            <Text style={s.routeAddrTxt} numberOfLines={1}>{trip.dropLocation.address || 'Drop'}</Text>
          </View>
        </View>

        {/* OTP — small inline strip */}
        {showOtp && (
          <View style={s.otpStrip}>
            <Icon name={otpVerified ? 'verified' : 'lock'} size={16} color={otpVerified ? '#16A34A' : '#F59E0B'} />
            <Text style={s.otpLabel}>{otpVerified ? 'Code verified ✓' : 'Pickup code:'}</Text>
            {!otpVerified && <Text style={s.otpCode}>{otpCode}</Text>}
            {!otpVerified && <Text style={s.otpHint}>Show to driver</Text>}
          </View>
        )}
      </View>

      {/* ── Trip Completed Overlay ── */}
      {showCompletedOverlay && (
        <View style={s.completedOverlay}>
          <View style={s.completedCard}>
            {/* Big animated checkmark */}
            <View style={s.completedCircle}>
              <Icon name="check" size={58} color="#fff" />
            </View>
            <Text style={s.completedTitle}>Trip Completed!</Text>
            <Text style={s.completedSub}>Your delivery has been completed successfully.</Text>

            {/* Summary */}
            <View style={s.completedSummary}>
              {hasDriver && (
                <View style={s.completedSummaryRow}>
                  <View style={s.completedAvatar}>
                    <Text style={s.completedAvatarTxt}>{driverName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.completedDriverName}>{driverName}</Text>
                    <Text style={s.completedDriverVehicle}>{driverVehicle}</Text>
                  </View>
                </View>
              )}
              {distanceText && (
                <View style={s.completedMetaRow}>
                  <Icon name="straighten" size={15} color="#6B7280" />
                  <Text style={s.completedMetaTxt}>{distanceText} travelled</Text>
                </View>
              )}
              {trip.estimatedFare > 0 && (
                <View style={s.completedMetaRow}>
                  <Icon name="currency-rupee" size={15} color="#16A34A" />
                  <Text style={[s.completedMetaTxt, { color: '#16A34A', fontWeight: '700' }]}>
                    {trip.estimatedFare} fare
                  </Text>
                </View>
              )}
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={s.rateBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCompletedOverlay(false);
                router.push(`/rate-trip?tripId=${tripId}`);
              }}
            >
              <Icon name="star" size={20} color="#fff" />
              <Text style={s.rateBtnTxt}>Rate Driver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.homeBtn}
              onPress={() => {
                setShowCompletedOverlay(false);
                router.replace('/(tabs)/home');
              }}
            >
              <Text style={s.homeBtnTxt}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f0f0' },

  // loading
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 12 },
  loadTxt:  { fontSize: 15, color: '#6B7280' },
  goBackBtn:{ backgroundColor: '#16A34A', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  goBackTxt:{ color: '#fff', fontWeight: '700', fontSize: 14 },

  // map
  map: { ...StyleSheet.absoluteFillObject },

  // pins
  pinWrap:  { alignItems: 'center' },
  pin: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  pinGreen: { backgroundColor: '#16A34A' },
  pinOrange:{ backgroundColor: '#EA580C' },
  pinTip:   { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },

  // top bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statusPillTxt: { fontSize: 13, fontWeight: '700' },

  // ETA card (Google Maps style — floating on map)
  etaCard: {
    position: 'absolute', right: 12,
    backgroundColor: '#fff',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 8,
    minWidth: 120, alignItems: 'flex-start',
  },
  etaBigTime:  { fontSize: 22, fontWeight: '800', color: '#111827', lineHeight: 26 },
  etaSubRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  etaSubTxt:   { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  etaDot:      { fontSize: 12, color: '#9CA3AF' },

  // bottom sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },

  // driver row
  driverRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 4, gap: 12 },
  driverAvatarWrap: { position: 'relative' },
  driverAvatarLetter: { fontSize: 20, fontWeight: '800', color: '#fff',
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#16A34A',
    textAlign: 'center', lineHeight: 52 },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#fff' },
  driverMeta: { flex: 1 },
  driverNameTxt:  { fontSize: 18, fontWeight: '800', color: '#111827' },
  driverVehicleTxt:{ fontSize: 13, color: '#6B7280', marginTop: 2 },
  driverBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  callBtn: { backgroundColor: '#16A34A' },
  chatBtn: { backgroundColor: '#3B82F6' },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },

  // route summary
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  routeDots: { alignItems: 'center', gap: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  dotG: { backgroundColor: '#22C55E', borderColor: '#16A34A' },
  dotO: { backgroundColor: '#F97316', borderColor: '#EA580C' },
  routeVLine: { width: 2, height: 22, backgroundColor: '#D1FAE5', marginVertical: 2 },
  routeAddrs: { flex: 1 },
  routeAddrTxt: { fontSize: 13, color: '#374151', fontWeight: '500' },

  // OTP strip
  otpStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFBEB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 4,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  otpLabel: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  otpCode:  { fontSize: 16, fontWeight: '800', color: '#D97706', letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  otpHint:  { fontSize: 11, color: '#B45309', marginLeft: 'auto' as any },

  // ─── Trip completed overlay ──────────────────────────────
  completedOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 9999, paddingHorizontal: 20,
  },
  completedCard: {
    backgroundColor: '#fff', borderRadius: 28,
    padding: 28, width: '100%', alignItems: 'center',
  },
  completedCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#16A34A',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#16A34A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 12,
  },
  completedTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 6 },
  completedSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  completedSummary: {
    width: '100%', backgroundColor: '#F9FAFB',
    borderRadius: 16, padding: 16, marginBottom: 22, gap: 10,
  },
  completedSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  completedAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#16A34A',
    justifyContent: 'center', alignItems: 'center',
  },
  completedAvatarTxt:    { fontSize: 18, fontWeight: '800', color: '#fff' },
  completedDriverName:   { fontSize: 15, fontWeight: '700', color: '#111827' },
  completedDriverVehicle:{ fontSize: 12, color: '#6B7280', marginTop: 2 },
  completedMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedMetaTxt: { fontSize: 13, color: '#374151' },

  rateBtn: {
    width: '100%', height: 52, borderRadius: 16,
    backgroundColor: '#F59E0B',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 10,
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  rateBtnTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  homeBtn: {
    width: '100%', height: 52, borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  homeBtnTxt: { fontSize: 15, fontWeight: '700', color: '#374151' },
});

