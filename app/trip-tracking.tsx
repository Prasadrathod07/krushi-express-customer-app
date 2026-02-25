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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { tripsAPI } from '../services/tripsAPI';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/notificationService';
import { useTrip } from '../contexts/TripContext';

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
  const { activeTrip, setActiveTrip, updateTripState } = useTrip();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasCheckedRating, setHasCheckedRating] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [driverHeading, setDriverHeading] = useState<number>(0); // Direction in degrees (0-360)
  const previousDriverLocation = useRef<{ latitude: number; longitude: number } | null>(null);

  const mapRef = useRef<MapView>(null);
  
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
        socket.disconnect();
      }
      notificationService.removeAllListeners();
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

  useEffect(() => {
    if (driverLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...driverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
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
          
          // Update ETA and distance
          if (data.eta !== undefined && data.eta !== null) {
            setEta(data.eta);
          }
          if (data.distance !== undefined && data.distance !== null) {
            setDistance(data.distance);
          }
          
          // Update route if we have pickup location
          if (trip?.pickupLocation) {
            const pickupCoords = trip.pickupLocation.coordinates;
            const pickupLatLng = { latitude: pickupCoords[1], longitude: pickupCoords[0] };
            setRouteCoordinates([
              pickupLatLng,
              newLocation
            ]);
          }
          
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
        
        // Check if trip is completed and show rating prompt (only once)
        if (updatedTrip.currentTripState === 'COMPLETED' && !hasCheckedRating) {
          setHasCheckedRating(true);
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
    Alert.alert(
      'Trip Completed!',
      'How was your experience? Please rate your driver.',
      [
        {
          text: 'Skip',
          style: 'cancel',
          onPress: () => {
            // Store in AsyncStorage that user skipped for this trip
            AsyncStorage.setItem(`rating_skipped_${tripId}`, 'true');
          },
        },
        {
          text: 'Rate Now',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push(`/rate-trip?tripId=${tripId}`);
          },
        },
      ],
      { cancelable: true }
    );
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading trip details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Icon name="error-outline" size={48} color="#f44336" />
          <Text style={styles.loadingText}>Trip not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = getTripStatusText(trip.currentTripState);
  const pickupCoords = trip.pickupLocation.coordinates;
  const dropCoords = trip.dropLocation.coordinates;
  const pickupLatLng = { latitude: pickupCoords[1], longitude: pickupCoords[0] };
  const dropLatLng = { latitude: dropCoords[1], longitude: dropCoords[0] };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Header - Fixed at top */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // Navigate to home screen instead of just going back
            router.replace('/(tabs)/home');
          }}
          style={styles.headerButton}
        >
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Tracking</Text>
        <View style={styles.headerRight}>
          {/* Negotiation Chat Button - Show if trip is in negotiable state */}
          {(trip.currentTripState === 'REQUESTED' || trip.currentTripState === 'NEGOTIATING') && (
            <TouchableOpacity
              style={styles.negotiateChatButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: '/trip-negotiation',
                  params: { tripId: tripId },
                });
              }}
              activeOpacity={0.7}
            >
              <Icon name="chat" size={18} color="#FF9800" />
              <Text style={styles.negotiateChatButtonText}>Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.statusIcon, { backgroundColor: `${status.color}20` }]}>
            <Icon name={status.icon} size={32} color={status.color} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusText}>{status.text}</Text>
            {eta !== null && (
              <Text style={styles.etaText}>
                ETA: {eta} {eta === 1 ? 'minute' : 'minutes'}
              </Text>
            )}
            {distance !== null && (
              <Text style={styles.etaText}>
                Distance: {distance.toFixed(1)} km
              </Text>
            )}
          </View>
        </View>

        {/* OTP Card - CRITICAL FIX: Show based on trip.currentTripState (source of truth) */}
        {trip && trip.currentTripState && ['ACCEPTED', 'ENROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP'].includes(trip.currentTripState) && (otp || trip.otp) && (
          <View style={styles.otpCard}>
            <View style={styles.otpCardHeader}>
              <Icon name={otpVerified ? "verified" : "lock"} size={24} color={otpVerified ? "#4CAF50" : "#FF9800"} />
              <View style={styles.otpCardInfo}>
                <Text style={styles.otpCardTitle}>
                  {otpVerified ? "OTP Verified" : "Share OTP with Driver"}
                </Text>
                <Text style={styles.otpCardSubtitle}>
                  {otpVerified 
                    ? "Driver has verified the OTP. Your ride will start shortly."
                    : "Show this OTP to your driver when they arrive at pickup location."
                  }
                </Text>
              </View>
            </View>
            <View style={styles.otpDisplay}>
              <Text style={styles.otpText}>{otp || trip.otp}</Text>
            </View>
            {!otpVerified && (
              <Text style={styles.otpWarning}>
                ⚠️ Keep this OTP safe. Do not share it with anyone except your driver.
              </Text>
            )}
          </View>
        )}

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: pickupLatLng.latitude,
              longitude: pickupLatLng.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation={true}
            showsMyLocationButton={false}
            mapType="standard"
            scrollEnabled={false}
            zoomEnabled={false}
          >
            {/* Pickup Marker */}
            <Marker
              coordinate={pickupLatLng}
              title="Pickup Location"
              description={trip.pickupLocation.address}
              pinColor="#4CAF50"
            />

            {/* Drop Marker */}
            <Marker
              coordinate={dropLatLng}
              title="Drop Location"
              description={trip.dropLocation.address}
              pinColor="#FF9800"
            />

            {/* Driver Location Marker with Directional Arrow */}
            {driverLocation && (
              <Marker
                coordinate={driverLocation}
                title="Driver Location"
                description="Driver is here"
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <Animated.View 
                  style={[
                    styles.driverMarker,
                    { transform: [{ rotate: `${driverHeading}deg` }] }
                  ]}
                >
                  <Icon name="arrow-upward" size={32} color="#2196F3" />
                </Animated.View>
              </Marker>
            )}

            {/* Route Line from Driver to Pickup (when driver is enroute) */}
            {driverLocation && (trip.currentTripState === 'ENROUTE_TO_PICKUP' || trip.currentTripState === 'ACCEPTED') && (
              <Polyline
                coordinates={routeCoordinates.length > 0 ? routeCoordinates : [
                  pickupLatLng,
                  { latitude: driverLocation.latitude, longitude: driverLocation.longitude }
                ]}
                strokeColor="#2196F3"
                strokeWidth={4}
                lineDashPattern={[5, 5]}
              />
            )}
            
            {/* Route Line from Pickup to Drop (when trip started) */}
            {(trip.currentTripState === 'PICKED_UP' || trip.currentTripState === 'ENROUTE_TO_DELIVERY') && (
              <Polyline
                coordinates={[pickupLatLng, dropLatLng]}
                strokeColor="#4CAF50"
                strokeWidth={4}
              />
            )}

            {/* Legacy Route Line */}
            {driverLocation && (
              <Polyline
                coordinates={[driverLocation, dropLatLng]}
                strokeColor="#2196F3"
                strokeWidth={3}
              />
            )}
          </MapView>
          
          {/* Distance & ETA Overlay (like Ola/Uber) */}
          {driverLocation && (eta !== null || distance !== null) && (
            <View style={styles.distanceETAOverlay}>
              {distance !== null && (
                <View style={styles.distanceETARow}>
                  <Icon name="straighten" size={16} color="#666" />
                  <Text style={styles.distanceETAText}>{distance.toFixed(1)} km</Text>
                </View>
              )}
              {eta !== null && (
                <View style={styles.distanceETARow}>
                  <Icon name="access-time" size={16} color="#666" />
                  <Text style={styles.distanceETAText}>{eta} min</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Driver Info - Show when driver is assigned (ACCEPTED state or later) */}
        {(trip.driver || (trip.driverId && (trip.currentTripState === 'ACCEPTED' || ['ENROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ENROUTE_TO_DELIVERY', 'ARRIVED_AT_DELIVERY', 'DELIVERING', 'COMPLETED'].includes(trip.currentTripState)))) && (
          <View style={styles.driverCard}>
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {((trip.driver?.name || (typeof trip.driverId === 'object' ? trip.driverId?.name : null) || 'D')).charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>
                  {trip.driver?.name || (typeof trip.driverId === 'object' ? trip.driverId?.name : null) || 'Driver'}
                </Text>
                <Text style={styles.vehicleInfo}>
                  {trip.driver?.vehicleDetails?.type || trip.driver?.vehicleType || (typeof trip.driverId === 'object' ? trip.driverId?.vehicleType : null) || 'Tempo'} • {trip.driver?.vehicleDetails?.number || trip.driver?.vehicleNumber || (typeof trip.driverId === 'object' ? trip.driverId?.vehicleNumber : null) || 'N/A'}
                </Text>
              </View>
            </View>
            <View style={styles.driverActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.callButton]}
                onPress={handleCallDriver}
              >
                <Icon name="phone" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.chatButton]}
                onPress={handleChatDriver}
              >
                <Icon name="chat" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Trip Info */}
        <View style={styles.tripInfoCard}>
          <View style={styles.tripInfoRow}>
            <Icon name="location-on" size={20} color="#4CAF50" />
            <View style={styles.tripInfoText}>
              <Text style={styles.tripInfoLabel}>Pickup</Text>
              <Text style={styles.tripInfoValue} numberOfLines={2}>
                {trip.pickupLocation.address || 'Pickup Location'}
              </Text>
            </View>
          </View>

          <View style={styles.tripInfoRow}>
            <Icon name="place" size={20} color="#FF9800" />
            <View style={styles.tripInfoText}>
              <Text style={styles.tripInfoLabel}>Drop</Text>
              <Text style={styles.tripInfoValue} numberOfLines={2}>
                {trip.dropLocation.address || 'Drop Location'}
              </Text>
            </View>
          </View>

          <View style={styles.tripInfoRow}>
            <Icon name="category" size={20} color="#666" />
            <View style={styles.tripInfoText}>
              <Text style={styles.tripInfoLabel}>Goods</Text>
              <Text style={styles.tripInfoValue}>
                {trip.parcelDetails.category} • {trip.parcelDetails.weight}
              </Text>
            </View>
          </View>

          <View style={styles.tripInfoRow}>
            <Icon name="currency-rupee" size={20} color="#666" />
            <View style={styles.tripInfoText}>
              <Text style={styles.tripInfoLabel}>Your Budget</Text>
              <Text style={styles.tripInfoValue}>₹{trip.parcelDetails?.budget?.toFixed(0) || trip.estimatedFare?.toFixed(0) || '0'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1a1a1a',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  negotiateChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    paddingVertical: Math.max(8, SCREEN_WIDTH * 0.02),
    paddingHorizontal: Math.max(14, SCREEN_WIDTH * 0.035),
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFB74D',
    minWidth: SCREEN_WIDTH * 0.2,
  },
  negotiateChatButtonText: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.035),
    fontWeight: '700',
    color: '#FF9800',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    margin: 16,
    marginTop: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  etaText: {
    fontSize: 14,
    color: '#666',
  },
  otpCard: {
    backgroundColor: '#FFF3E0',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FF9800',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  otpCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  otpCardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  otpCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  otpCardSubtitle: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  otpDisplay: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  otpText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FF9800',
    letterSpacing: 8,
    fontFamily: 'monospace',
  },
  otpWarning: {
    fontSize: 12,
    color: '#f44336',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  mapContainer: {
    height: SCREEN_HEIGHT * 0.4,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  driverMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  distanceETAOverlay: {
    position: 'absolute',
    top: 100,
    left: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  distanceETARow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distanceETAText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  driverAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 14,
    color: '#666',
  },
  driverActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButton: {
    backgroundColor: '#4CAF50',
  },
  chatButton: {
    backgroundColor: '#2196F3',
  },
  tripInfoCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tripInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  tripInfoText: {
    flex: 1,
    marginLeft: 12,
  },
  tripInfoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  tripInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});

