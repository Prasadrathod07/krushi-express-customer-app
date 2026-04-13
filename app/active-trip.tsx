// ActiveTripScreen - Single unified screen for customer & driver with map, OTP, and tracking
import React, { useState, useEffect, useRef } from 'react';
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { tripsAPI } from '../services/tripsAPI';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrip } from '../contexts/TripContext';
import { getRouteInfo } from '../services/directionsService';

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
  customer?: {
    name: string;
    phone: string;
  };
}

export default function ActiveTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tripId = (params.id || params.tripId) as string;
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
  const [otpInput, setOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [userType, setUserType] = useState<'customer' | 'driver'>('customer');
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  // Road route from pickup to drop (fetched once when trip loads)
  const [tripRouteCoordinates, setTripRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);

  const mapRef = useRef<MapView>(null);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // CRITICAL: Sync with TripContext - activeTrip is source of truth
  useEffect(() => {
    if (activeTrip && activeTrip._id === tripId) {
      setTrip(activeTrip);
      if (activeTrip.otp) {
        setOtp(activeTrip.otp);
      }
      if (activeTrip.otpVerified) {
        setOtpVerified(true);
      }
    }
  }, [activeTrip, tripId]);

  // Determine user type
  useEffect(() => {
    const checkUserType = async () => {
      const userId = await AsyncStorage.getItem('userId');
      if (trip && userId) {
        if (trip.driverId === userId || (typeof trip.driverId === 'object' && trip.driverId?._id === userId)) {
          setUserType('driver');
        } else {
          setUserType('customer');
        }
      }
    };
    checkUserType();
  }, [trip]);

  useEffect(() => {
    loadTrip();
    initializeSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [tripId]);

  // Update driver location from trip data
  useEffect(() => {
    if (trip?.driverCurrentLocation) {
      const [lng, lat] = trip.driverCurrentLocation.coordinates;
      const newLocation = { latitude: lat, longitude: lng };
      setDriverLocation(newLocation);
      
      if (trip.currentTripState === 'ENROUTE_TO_PICKUP' || trip.currentTripState === 'ACCEPTED') {
        setEta(trip.estimatedTimeToPickup || null);
      } else if (trip.currentTripState === 'ENROUTE_TO_DELIVERY' || trip.currentTripState === 'PICKED_UP') {
        setEta(trip.estimatedTimeToDelivery || null);
      }
    }
  }, [trip]);

  // Fetch road route from pickup to drop when trip data is available
  useEffect(() => {
    if (!trip) return;
    const pickupCoords = trip.pickupLocation?.coordinates;
    const dropCoords = trip.dropLocation?.coordinates;
    if (!pickupCoords || !dropCoords) return;

    const pickup = { latitude: pickupCoords[1], longitude: pickupCoords[0] };
    const drop = { latitude: dropCoords[1], longitude: dropCoords[0] };

    getRouteInfo(pickup, drop).then((info) => {
      setTripRouteCoordinates(info.coordinates);
    });
  }, [trip?._id]); // Only re-fetch when trip changes, not on every render

  // Fetch road route from driver to pickup when driver location updates
  useEffect(() => {
    if (!driverLocation || !trip?.pickupLocation) return;
    const pickupCoords = trip.pickupLocation.coordinates;
    const pickup = { latitude: pickupCoords[1], longitude: pickupCoords[0] };

    getRouteInfo(driverLocation, pickup).then((info) => {
      setRouteCoordinates(info.coordinates);
    });
  }, [driverLocation]);

  // CRITICAL: Smooth marker animation - only animate if location changed significantly
  useEffect(() => {
    const currentState = activeTrip?.currentTripState || trip?.currentTripState;
    if (driverLocation && mapRef.current && (currentState === 'ACCEPTED' || currentState === 'ENROUTE_TO_PICKUP')) {
      // Only animate if location changed by at least 10 meters
      if (lastLocationRef.current) {
        const distance = calculateDistance(
          lastLocationRef.current.latitude,
          lastLocationRef.current.longitude,
          driverLocation.latitude,
          driverLocation.longitude
        );
        if (distance < 0.01) return; // Less than 10 meters, skip animation
      }
      
      lastLocationRef.current = driverLocation;
      mapRef.current.animateToRegion({
        ...driverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [driverLocation, trip?.currentTripState]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        auth: {
          token: token || '',
        },
      });

      newSocket.on('connect', async () => {
        console.log('✅ ActiveTripScreen: Socket connected');
        
        const userId = await AsyncStorage.getItem('userId');
        newSocket.emit('subscribe-trip', {
          tripId,
          userId,
          userType: userType,
        });
      });

      // CRITICAL: Listen for driver location updates - ONLY when trip is ACCEPTED
      newSocket.on('driver-location-updated', (data: any) => {
        if (data.tripId === tripId && data.driverLocation) {
          // Check activeTrip state (source of truth) or local trip state
          const currentState = activeTrip?.currentTripState || trip?.currentTripState;
          if (currentState === 'ACCEPTED' || currentState === 'ENROUTE_TO_PICKUP') {
            const newLocation = {
              latitude: data.driverLocation.latitude,
              longitude: data.driverLocation.longitude,
            };
            
            setDriverLocation(newLocation);
            
            if (data.eta !== undefined && data.eta !== null) {
              setEta(data.eta);
            }
            if (data.distance !== undefined && data.distance !== null) {
              setDistance(data.distance);
            }
            
            // Route from driver to pickup is updated via useEffect on driverLocation
          }
        }
      });

      // Listen for trip state updates
      newSocket.on('trip-state-updated', (data: any) => {
        if (data.tripId === tripId) {
          updateTripState(tripId, data.state, data.trip);
          loadTrip();
        }
      });

      // Listen for OTP verification
      newSocket.on('otp-verified', (data: any) => {
        if (data.tripId === tripId) {
          setOtpVerified(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (userType === 'driver') {
            setOtpInput('');
          }
        }
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

  const loadTrip = async () => {
    try {
      const response = await tripsAPI.getTrip(tripId);
      
      if (response.ok && response.data) {
        const updatedTrip = response.data;
        setTrip(updatedTrip);
        setActiveTrip(updatedTrip);
        
        if (updatedTrip.otp) {
          setOtp(updatedTrip.otp);
        }
        if (updatedTrip.otpVerified) {
          setOtpVerified(true);
        }
      } else {
        Alert.alert('Error', response.message || 'Failed to load trip details.');
        router.back();
      }
    } catch (error: any) {
      console.error('Error loading trip:', error);
      Alert.alert('Error', 'Failed to load trip details.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput || otpInput.length !== 4) {
      Alert.alert('Invalid OTP', 'Please enter a 4-digit OTP');
      return;
    }

    try {
      const response = await tripsAPI.verifyOtp(tripId, otpInput);
      if (response.ok) {
        setOtpVerified(true);
        setOtpInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Error', response.message || 'Invalid OTP');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to verify OTP');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCall = () => {
    const phone = userType === 'customer' 
      ? trip?.driver?.phone 
      : trip?.customer?.phone;
    
    if (!phone) {
      Alert.alert('Error', 'Phone number not available.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${phone}`);
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
    };
    return statusMap[state] || { text: state, color: '#666', icon: 'help' };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading trip...</Text>
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
            onPress={() => router.replace('/(tabs)/home')}
          >
            <Text style={styles.backButtonText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Guard: location data missing (race condition during state transition)
  if (!trip.pickupLocation?.coordinates || !trip.dropLocation?.coordinates) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator size="large" color="#16A34A" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const status = getTripStatusText(trip.currentTripState);
  const pickupCoords = trip.pickupLocation.coordinates;
  const dropCoords = trip.dropLocation.coordinates;
  const pickupLatLng = { latitude: pickupCoords[1], longitude: pickupCoords[0] };
  const dropLatLng = { latitude: dropCoords[1], longitude: dropCoords[0] };
  const showOtp = trip.currentTripState === 'ACCEPTED' && (otp || trip.otp);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/(tabs)/home');
          }}
          style={styles.headerButton}
        >
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Trip</Text>
        <TouchableOpacity
          onPress={handleCall}
          style={styles.headerButton}
        >
          <Icon name="phone" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

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
        </View>
      </View>

      {/* CRITICAL: OTP Display for Customer - Shows immediately when state === ACCEPTED */}
      {userType === 'customer' && showOtp && !otpVerified && (
        <View style={styles.otpCard}>
          <View style={styles.otpCardHeader}>
            <Icon name="lock" size={24} color="#FF9800" />
            <View style={styles.otpCardInfo}>
              <Text style={styles.otpCardTitle}>Share OTP with Driver</Text>
              <Text style={styles.otpCardSubtitle}>
                Show this OTP to your driver when they arrive at pickup location.
              </Text>
            </View>
          </View>
          <View style={styles.otpDisplay}>
            <Text style={styles.otpText}>{otp || trip.otp}</Text>
          </View>
        </View>
      )}

      {/* CRITICAL: OTP Input for Driver - Shows immediately when state === ACCEPTED */}
      {userType === 'driver' && showOtp && !otpVerified && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.otpInputContainer}
        >
          <View style={styles.otpInputCard}>
            <View style={styles.otpInputHeader}>
              <Icon name="lock" size={24} color="#FF9800" />
              <View style={styles.otpInputInfo}>
                <Text style={styles.otpInputTitle}>Enter Customer OTP</Text>
                <Text style={styles.otpInputSubtitle}>
                  Ask the customer for their OTP to verify pickup.
                </Text>
              </View>
            </View>
            <View style={styles.otpInputWrapper}>
              <TextInput
                style={styles.otpInput}
                placeholder="Enter 4-digit OTP"
                placeholderTextColor="#999"
                value={otpInput}
                onChangeText={setOtpInput}
                keyboardType="numeric"
                maxLength={4}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.verifyButton, !otpInput || otpInput.length !== 4 && styles.verifyButtonDisabled]}
                onPress={handleVerifyOtp}
                disabled={!otpInput || otpInput.length !== 4}
              >
                <Text style={styles.verifyButtonText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* CRITICAL: Map - Always rendered first */}
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

          {/* Driver Location Marker - Only show when trip is ACCEPTED */}
          {driverLocation && (trip.currentTripState === 'ACCEPTED' || trip.currentTripState === 'ENROUTE_TO_PICKUP') && (
            <Marker
              coordinate={driverLocation}
              title="Driver Location"
              description="Driver is here"
            >
              <View style={styles.driverMarker}>
                <Icon name="directions-car" size={32} color="#2196F3" />
              </View>
            </Marker>
          )}

          {/* Route Line from Driver to Pickup - road-based */}
          {driverLocation && routeCoordinates.length > 0 && (trip.currentTripState === 'ACCEPTED' || trip.currentTripState === 'ENROUTE_TO_PICKUP') && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#2196F3"
              strokeWidth={5}
            />
          )}
          
          {/* Route Line from Pickup to Drop - road-based */}
          {(trip.currentTripState === 'PICKED_UP' || trip.currentTripState === 'ENROUTE_TO_DELIVERY') && (
            <Polyline
              coordinates={
                tripRouteCoordinates.length > 0
                  ? tripRouteCoordinates
                  : [pickupLatLng, dropLatLng]
              }
              strokeColor="#4CAF50"
              strokeWidth={5}
            />
          )}
        </MapView>
      </View>

      {/* Trip Details */}
      <ScrollView style={styles.detailsContainer} showsVerticalScrollIndicator={false}>
        {/* Driver/Customer Info */}
        {trip.driver && userType === 'customer' && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {trip.driver.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.infoDetails}>
                <Text style={styles.infoName}>{trip.driver.name}</Text>
                <Text style={styles.infoSubtext}>
                  {trip.driver.vehicleDetails?.type || trip.driver.vehicleType || 'Tempo'} • {trip.driver.vehicleDetails?.number || trip.driver.vehicleNumber || 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {trip.customer && userType === 'driver' && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {trip.customer.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.infoDetails}>
                <Text style={styles.infoName}>{trip.customer.name}</Text>
                <Text style={styles.infoSubtext}>{trip.customer.phone}</Text>
              </View>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    margin: 16,
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
  otpInputContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  otpInputCard: {
    backgroundColor: '#FFF3E0',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  otpInputHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  otpInputInfo: {
    flex: 1,
    marginLeft: 12,
  },
  otpInputTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  otpInputSubtitle: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  otpInputWrapper: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  otpInput: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  verifyButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  verifyButtonDisabled: {
    backgroundColor: '#ccc',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  mapContainer: {
    height: SCREEN_HEIGHT * 0.4,
    marginHorizontal: 16,
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
  },
  detailsContainer: {
    flex: 1,
    marginTop: 16,
  },
  infoCard: {
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  infoDetails: {
    flex: 1,
  },
  infoName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  infoSubtext: {
    fontSize: 14,
    color: '#666',
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

