import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { vehiclesAPI } from '../services/vehiclesAPI';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SEARCH_TIMEOUT = 10000; // 10 seconds

export default function SearchingDrivers() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [searching, setSearching] = useState(true);
  const [driversFound, setDriversFound] = useState(false);
  const [noDrivers, setNoDrivers] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tripCreated, setTripCreated] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const startTime = useRef(Date.now());
  const mapRef = useRef<MapView>(null);

  const pickupLocation = params.pickupLocation ? JSON.parse(params.pickupLocation as string) : null;
  const dropLocation = params.dropLocation ? JSON.parse(params.dropLocation as string) : null;
  const tripDetails = params.tripDetails ? JSON.parse(params.tripDetails as string) : null;

  useEffect(() => {
    // Center map on pickup location
    if (pickupLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
    
    // Start animations
    startAnimations();
    // Start searching
    searchForDrivers();
    // Start timer
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    
    return () => {
      clearInterval(timer);
    };
  }, []);

  const startAnimations = () => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotation animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  };

  const searchForDrivers = async () => {
    if (!pickupLocation) {
      setNoDrivers(true);
      setSearching(false);
      return;
    }

    try {
      // First, create the trip request
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) {
        router.replace('/login');
        return;
      }

      // Create trip first - format data to match backend model
      // Ensure category is valid enum value
      const validCategories = ['Farm Produce', 'Furniture', 'Construction Material', 'Household Shifting', 'Other Items'];
      const category = tripDetails?.category && validCategories.includes(tripDetails.category) 
        ? tripDetails.category 
        : 'Other Items';

      const tripData = {
        pickupLocation: {
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          address: pickupLocation.address || '',
        },
        dropLocation: {
          latitude: dropLocation.latitude,
          longitude: dropLocation.longitude,
          address: dropLocation.address || '',
        },
        parcelDetails: {
          type: category, // Required field - must match category
          category: category, // Must be from enum
          weight: tripDetails?.weight || 'Not specified',
          images: tripDetails?.images || [],
          description: tripDetails?.description || '',
          budget: tripDetails?.budget ? parseFloat(tripDetails.budget.toString()) : undefined,
        },
        requestedVehicleType: tripDetails?.vehicleType || 'Tempo',
        // Use customer's budget as estimatedFare
        estimatedFare: tripDetails?.budget 
          ? parseFloat(tripDetails.budget.toString()) 
          : undefined,
        tripDate: new Date().toISOString(),
      };

      let tripResponse;
      try {
        tripResponse = await tripsAPI.createTrip(tripData);
      } catch (apiError: any) {
        // Handle API errors
        console.error('Trip creation API error:', apiError);
        throw new Error(apiError.message || 'Failed to create trip request. Please check your connection.');
      }
      
      let createdTripId = null;
      if (tripResponse && tripResponse.ok && tripResponse.data) {
        createdTripId = tripResponse.data._id || tripResponse.data.id;
        setTripId(createdTripId);
        setTripCreated(true);
        
        // CRITICAL: Join trip room immediately after creation
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
          const { io } = await import('socket.io-client');
          const { SOCKET_URL } = await import('../lib/env');
          const tempSocket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            auth: { token },
          });
          tempSocket.on('connect', async () => {
            tempSocket.emit('join-trip', { tripId: createdTripId });
            const userId = await AsyncStorage.getItem('userId');
            if (userId) {
              tempSocket.emit('join-user', { userId });
            }
            console.log(`✅ customer joined trip room: ${createdTripId}`);
            // Keep socket connected for trip updates
          });
        }
      } else {
        // Trip creation failed
        const errorMsg = tripResponse?.message || tripResponse?.error || 'Failed to create trip request';
        console.error('Trip creation failed:', tripResponse);
        throw new Error(errorMsg);
      }

      // Search for drivers with timeout
      let searchResult;
      try {
        if (__DEV__) {
          console.log('🔍 Searching for drivers:', {
            lat: pickupLocation.latitude,
            lng: pickupLocation.longitude,
            radius: 20,
            vehicleType: tripDetails?.vehicleType,
          });
        }

        const searchPromise = vehiclesAPI.getNearbyVehicles(
          pickupLocation.latitude,
          pickupLocation.longitude,
          20, // 20km radius
          tripDetails?.vehicleType
        );

        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ok: false, timeout: true, message: 'Search timeout - no drivers found' });
          }, SEARCH_TIMEOUT);
        });

        searchResult = await Promise.race([searchPromise, timeoutPromise]) as any;
        
        if (__DEV__) {
          console.log('📡 Search result:', {
            ok: searchResult?.ok,
            timeout: searchResult?.timeout,
            dataLength: searchResult?.data?.length,
            count: searchResult?.count,
            message: searchResult?.message,
          });
        }
      } catch (searchError: any) {
        console.error('❌ Error searching for drivers:', searchError);
        if (__DEV__) {
          console.error('   Error details:', {
            message: searchError.message,
            code: searchError.code,
            status: searchError.status,
          });
        }
        // If search fails but trip was created, show "No drivers available" UI
        // This handles network errors, API errors, etc. - treat as "no drivers found"
        setNoDrivers(true);
        setSearching(false);
        // Stop animations
        pulseAnim.stopAnimation();
        rotateAnim.stopAnimation();
        return;
      }

      // Handle timeout or no drivers found
      if (searchResult.timeout || !searchResult.ok || !searchResult.data || searchResult.data.length === 0) {
        if (__DEV__) {
          console.warn('⚠️ No drivers found. Reason:', {
            timeout: searchResult.timeout,
            ok: searchResult.ok,
            hasData: !!searchResult.data,
            dataLength: searchResult.data?.length,
            message: searchResult.message,
          });
        }
        // No drivers found or timeout - show "No drivers available" message
        // Trip was already created, so we just show the "no drivers" UI
        setNoDrivers(true);
        setSearching(false);
        // Stop animations
        pulseAnim.stopAnimation();
        rotateAnim.stopAnimation();
      } else {
        // Drivers found
        if (__DEV__) {
          console.log(`✅ Found ${searchResult.data.length} drivers!`);
        }
        setDrivers(searchResult.data);
        setDriversFound(true);
        setSearching(false);
        
        // Navigate to select driver screen after short delay
        setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace({
            pathname: '/select-driver',
            params: {
              pickupLocation: params.pickupLocation,
              dropLocation: params.dropLocation,
              tripDetails: params.tripDetails,
              tripId: createdTripId || tripId || '',
            },
          });
        }, 1500);
      }
    } catch (error: any) {
      console.error('Error in searchForDrivers:', error);
      setSearching(false);
      // Stop animations
      pulseAnim.stopAnimation();
      rotateAnim.stopAnimation();
      
      // If trip was created but search failed, show "no drivers available" UI
      // This ensures user sees "No drivers available" instead of error alert
      if (tripCreated) {
        setNoDrivers(true);
      } else {
        // Only show error alert if trip creation itself failed (not search)
        const errorMessage = error.message || error.error || 'Failed to create trip request. Please check your connection and try again.';
        
        Alert.alert(
          'Error',
          errorMessage,
          [
            {
              text: 'Go Back',
              style: 'cancel',
              onPress: () => router.back(),
            },
            {
              text: 'Retry',
              onPress: () => {
                setSearching(true);
                setNoDrivers(false);
                setElapsedTime(0);
                startTime.current = Date.now();
                startAnimations();
                searchForDrivers();
              },
            },
          ]
        );
      }
    }
  };

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSearching(true);
    setNoDrivers(false);
    setDriversFound(false);
    setElapsedTime(0);
    startTime.current = Date.now();
    // Restart animations
    startAnimations();
    // Retry search (trip already created, just search again)
    retryDriverSearch();
  };

  const retryDriverSearch = async () => {
    if (!pickupLocation) {
      setNoDrivers(true);
      setSearching(false);
      return;
    }

    try {
      if (__DEV__) {
        console.log('🔄 Retrying driver search:', {
          lat: pickupLocation.latitude,
          lng: pickupLocation.longitude,
          radius: 20,
          vehicleType: tripDetails?.vehicleType,
        });
      }

      // Search for drivers with timeout (trip already created)
      const searchPromise = vehiclesAPI.getNearbyVehicles(
        pickupLocation.latitude,
        pickupLocation.longitude,
        20, // 20km radius
        tripDetails?.vehicleType
      );

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: false, timeout: true, message: 'Search timeout - no drivers found' });
        }, SEARCH_TIMEOUT);
      });

      const searchResult = await Promise.race([searchPromise, timeoutPromise]) as any;

      if (__DEV__) {
        console.log('📡 Retry search result:', {
          ok: searchResult?.ok,
          timeout: searchResult?.timeout,
          dataLength: searchResult?.data?.length,
          count: searchResult?.count,
        });
      }

      // Handle timeout or no drivers found
      if (searchResult.timeout || !searchResult.ok || !searchResult.data || searchResult.data.length === 0) {
        // No drivers found - show "No drivers available" UI
        setNoDrivers(true);
        setSearching(false);
        pulseAnim.stopAnimation();
        rotateAnim.stopAnimation();
      } else {
        // Drivers found
        if (__DEV__) {
          console.log(`✅ Found ${searchResult.data.length} drivers on retry!`);
        }
        setDrivers(searchResult.data);
        setDriversFound(true);
        setSearching(false);
        
        // Navigate to select driver screen after short delay
        setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace({
            pathname: '/select-driver',
            params: {
              pickupLocation: params.pickupLocation,
              dropLocation: params.dropLocation,
              tripDetails: params.tripDetails,
              tripId: tripId || '',
            },
          });
        }, 1500);
      }
    } catch (searchError: any) {
      console.error('❌ Error in retry search:', searchError);
      if (__DEV__) {
        console.error('   Error details:', {
          message: searchError.message,
          code: searchError.code,
          status: searchError.status,
        });
      }
      // On error, show "no drivers available" UI
      setNoDrivers(true);
      setSearching(false);
      pulseAnim.stopAnimation();
      rotateAnim.stopAnimation();
    }
  };

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to home instead of just going back
    router.replace('/(tabs)/home');
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Finding Drivers</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.container}>
        {/* Background Map */}
        {pickupLocation && (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={{
                latitude: pickupLocation.latitude,
                longitude: pickupLocation.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              mapType="standard"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: pickupLocation.latitude,
                  longitude: pickupLocation.longitude,
                }}
                title="Pickup Location"
                pinColor="#4CAF50"
              />
            </MapView>
            {/* Map Overlay for darker background */}
            <View style={styles.mapOverlay} />
          </View>
        )}

        {searching ? (
          <>
            {/* Searching Animation */}
            <View style={styles.searchingContainer}>
              <Animated.View
                style={[
                  styles.searchIconContainer,
                  {
                    transform: [
                      { scale: pulseAnim },
                      { rotate: rotateInterpolate },
                    ],
                  },
                ]}
              >
                <Icon name="search" size={64} color="#4CAF50" />
              </Animated.View>
              
              <Text style={styles.searchingTitle}>Searching for nearby drivers...</Text>
              <Text style={styles.searchingSubtext}>
                We're looking for available drivers in your area
              </Text>

              {/* Progress Indicator */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min((elapsedTime / (SEARCH_TIMEOUT / 1000)) * 100, 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {elapsedTime}s / {SEARCH_TIMEOUT / 1000}s
                </Text>
              </View>

              {/* Loading Dots */}
              <View style={styles.dotsContainer}>
                <View style={[styles.dot, styles.dot1]} />
                <View style={[styles.dot, styles.dot2]} />
                <View style={[styles.dot, styles.dot3]} />
              </View>
            </View>
          </>
        ) : noDrivers ? (
          <>
            {/* No Drivers Found */}
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Icon name="directions-car" size={80} color="#ccc" />
                <Icon name="close" size={40} color="#f44336" style={styles.overlayIcon} />
              </View>
              
              <Text style={styles.emptyTitle}>No Drivers Available</Text>
              <Text style={styles.emptySubtext}>
                We couldn't find any drivers in your location at the moment.
              </Text>
              <Text style={styles.emptyHint}>
                Your trip request has been saved. We'll notify you when a driver becomes available.
              </Text>
              {tripId && (
                <View style={styles.tripSavedInfo}>
                  <Icon name="check-circle" size={20} color="#4CAF50" />
                  <Text style={styles.tripSavedText}>Trip request saved (ID: {tripId.substring(0, 8)}...)</Text>
                </View>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetry}
                  activeOpacity={0.8}
                >
                  <Icon name="refresh" size={20} color="#fff" />
                  <Text style={styles.retryButtonText}>Search Again</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.backButtonStyle}
                  onPress={handleGoBack}
                  activeOpacity={0.8}
                >
                  <Text style={styles.backButtonText}>Go to Home</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : driversFound ? (
          <>
            {/* Drivers Found - Will navigate automatically */}
            <View style={styles.successContainer}>
              <Animated.View
                style={[
                  styles.successIconContainer,
                  {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              >
                <Icon name="check-circle" size={80} color="#4CAF50" />
              </Animated.View>
              
              <Text style={styles.successTitle}>Drivers Found!</Text>
              <Text style={styles.successSubtext}>
                We found {drivers.length} driver{drivers.length > 1 ? 's' : ''} near you
              </Text>
              <ActivityIndicator size="large" color="#4CAF50" style={styles.loadingSpinner} />
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  searchingContainer: {
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  searchIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  searchingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  searchingSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyIconContainer: {
    position: 'relative',
    marginBottom: 32,
  },
  overlayIcon: {
    position: 'absolute',
    bottom: -10,
    right: -10,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  backButtonStyle: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  tripSavedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  tripSavedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  successIconContainer: {
    marginBottom: 32,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingSpinner: {
    marginTop: 16,
  },
});
