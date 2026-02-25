import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { vehiclesAPI } from '../services/vehiclesAPI';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';

interface Driver {
  driverId: string;
  driverName: string;
  driverPhone: string;
  profilePhoto?: string; // Driver profile photo
  vehicleType: string;
  vehicleNumber: string;
  rating: number;
  totalTrips: number;
  distance: number;
  estimatedArrivalTime: number;
  costPerKm: number;
  fixedPrice?: number; // Fixed price for this route
  currentLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
}

export default function SelectDriver() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [userEnteredAmount, setUserEnteredAmount] = useState<number | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successTripId, setSuccessTripId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [tripAccepted, setTripAccepted] = useState(false);
  const [tripCancelled, setTripCancelled] = useState(false);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const checkmarkAnim = useRef(new Animated.Value(0)).current;
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const pickupLocation = params.pickupLocation ? JSON.parse(params.pickupLocation as string) : null;
  const dropLocation = params.dropLocation ? JSON.parse(params.dropLocation as string) : null;
  const tripDetails = params.tripDetails ? JSON.parse(params.tripDetails as string) : null;
  const tripId = params.tripId as string | undefined;

  // Extract user-entered amount from tripDetails
  const getUserEnteredAmount = () => {
    if (!tripDetails) {
      if (__DEV__) console.log('⚠️ No tripDetails found');
      return null;
    }
    
    // Try estimatedFare first, then budget
    let amount = tripDetails.estimatedFare;
    if (amount === undefined || amount === null) {
      amount = tripDetails.budget;
    }
    
    if (amount !== undefined && amount !== null) {
      const parsed = typeof amount === 'number' ? amount : parseFloat(String(amount));
      if (!isNaN(parsed) && parsed > 0) {
        if (__DEV__) console.log('✅ Found user amount:', parsed, 'from field:', tripDetails.estimatedFare !== undefined ? 'estimatedFare' : 'budget');
        return parsed;
      } else {
        if (__DEV__) console.log('⚠️ Amount is invalid:', amount, 'parsed:', parsed);
      }
    } else {
      if (__DEV__) console.log('⚠️ No amount found in tripDetails.estimatedFare or tripDetails.budget');
      if (__DEV__) console.log('📦 Full tripDetails:', JSON.stringify(tripDetails, null, 2));
    }
    return null;
  };

  useEffect(() => {
    // Extract and store user-entered amount once, then load drivers
    const amount = getUserEnteredAmount();
    setUserEnteredAmount(amount);
    
    // Load drivers (will use amount from getUserEnteredAmount if state not set yet)
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDrivers = async () => {
    if (!pickupLocation) return;

    setLoading(true);
    try {
      const response = await vehiclesAPI.getNearbyVehicles(
        pickupLocation.latitude,
        pickupLocation.longitude,
        20 // 20km radius
      );

      if (response.ok && response.data) {
        // Use user-entered amount from state (or get it fresh if state not set yet)
        const amount = userEnteredAmount !== null ? userEnteredAmount : getUserEnteredAmount();
        
        const driversWithPrice = response.data.map((driver: Driver) => {
          let fixedPrice;
          if (amount !== null && amount > 0) {
            // Use the amount the user entered
            fixedPrice = amount;
          } else {
            // Fallback: Calculate based on distance if user didn't enter amount
          const distance = driver.distance || 0;
          const basePrice = 100; // Base fare
            fixedPrice = Math.round(basePrice + (distance * (driver.costPerKm || 10)));
          }
          return { ...driver, fixedPrice: Math.round(fixedPrice) };
        });
        setDrivers(driversWithPrice);
      }
    } catch (error) {
      console.error('Error loading drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDriver = (driver: Driver) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDriver(driver);
  };

  const handleRequestTrip = async () => {
    if (!selectedDriver || !pickupLocation || !dropLocation) {
      Alert.alert('Error', 'Please select a driver');
      return;
    }

    setRequesting(true);
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) {
        router.replace('/login');
        return;
      }

      // Don't send customerId - backend will set it from authenticated user
      // Include driverId if driver is selected - this allows the trip to be assigned to the driver
      // Ensure budget is included in parcelDetails if provided
      const parcelDetailsData = tripDetails ? {
        ...tripDetails,
        budget: tripDetails.budget ? parseFloat(tripDetails.budget.toString()) : undefined,
      } : {
        category: 'Other Items',
        weight: '0',
        quantity: 1,
      };

      // Get customer's budget - this is what the customer entered (mandatory)
      const customerBudget = tripDetails?.budget 
        ? parseFloat(tripDetails.budget.toString()) 
        : undefined;

      if (!customerBudget || customerBudget <= 0) {
        Alert.alert('Error', 'Budget is required. Please go back and enter your budget.');
        setRequesting(false);
        return;
      }

      const tripData = {
        pickupLocation: {
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          address: pickupLocation.address,
        },
        dropLocation: {
          latitude: dropLocation.latitude,
          longitude: dropLocation.longitude,
          address: dropLocation.address,
        },
        parcelDetails: parcelDetailsData,
        // Use customer's budget as estimatedFare
        estimatedFare: customerBudget,
        requestedVehicleType: selectedDriver.vehicleType,
        driverId: selectedDriver.driverId, // Include driverId so the trip is assigned to this driver
      };

      // Always create a new trip with driverId when driver is selected
      // The trip created in searching-drivers.tsx was without driverId, so we create a new one with driverId
      // This ensures the driver receives the notification via socket
      console.log('🚀 Creating trip with driverId:', selectedDriver.driverId);
      console.log('📦 Trip data:', {
        driverId: tripData.driverId,
        estimatedFare: tripData.estimatedFare,
        requestedVehicleType: tripData.requestedVehicleType,
        hasPickupLocation: !!tripData.pickupLocation,
        hasDropLocation: !!tripData.dropLocation,
        hasParcelDetails: !!tripData.parcelDetails,
      });
      
        const response = await tripsAPI.createTrip(tripData);
      
      let finalTripId = null;
        if (response.ok && response.data) {
          finalTripId = response.data._id;
        console.log('✅ Trip created successfully!');
        console.log('📋 Trip ID:', finalTripId);
        console.log('👤 Trip driverId:', response.data.driverId);
        console.log('📊 Trip state:', response.data.currentTripState);
        
        if (!response.data.driverId) {
          console.warn('⚠️ WARNING: Trip created but driverId is missing!');
          console.warn('📦 Full response:', JSON.stringify(response.data, null, 2));
        }
        } else {
        console.error('❌ Failed to create trip:', response);
          Alert.alert('Error', response.message || 'Failed to create trip request');
        setRequesting(false);
          return;
      }

      if (finalTripId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSuccessTripId(finalTripId);
        setTimeRemaining(300); // Reset to 5 minutes
        setTripAccepted(false);
        setTripCancelled(false);
        setShowSuccessModal(true);
        
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
            tempSocket.emit('join-trip', { tripId: finalTripId });
            const userId = await AsyncStorage.getItem('userId');
            if (userId) {
              tempSocket.emit('join-user', { userId });
            }
            console.log(`✅ customer joined trip room: ${finalTripId}`);
            // Keep socket connected for trip updates
          });
        }
        
        // Initialize socket to listen for trip status changes
        initializeSuccessSocket(finalTripId);
        
        // Start countdown timer
        startCountdownTimer();
        
        // Animate modal fade and scale in
        Animated.parallel([
          Animated.spring(opacityAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            delay: 100,
            tension: 50,
            friction: 7,
          }),
          Animated.sequence([
            Animated.delay(300),
            Animated.spring(checkmarkAnim, {
              toValue: 1,
              useNativeDriver: true,
              tension: 100,
              friction: 6,
            }),
          ]),
        ]).start();
      } else {
        Alert.alert('Error', 'Failed to create trip request');
        setRequesting(false);
      }
    } catch (error: any) {
      console.error('Error requesting trip:', error);
      Alert.alert('Error', 'Failed to send trip request. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Icon
          key={i}
          name={i <= rating ? 'star' : 'star-border'}
          size={16}
          color={i <= rating ? '#FFD600' : '#ddd'}
        />
      );
    }
    return stars;
  };

  const initializeSuccessSocket = async (tripId: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userId = await AsyncStorage.getItem('userId');
      if (!token || !userId) return;

      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        console.log('✅ Success socket connected');
        // Join customer room
        newSocket.emit('join-room', `customer-${userId}`);
        // Also join trip room to receive trip-accepted events
        newSocket.emit('join-trip', { tripId });
      });

      // Listen for trip accepted
      newSocket.on('trip-accepted', (data: any) => {
        console.log('✅ Trip accepted event received:', data);
        const eventTripId = data.tripId?.toString() || data.tripId;
        if (eventTripId === tripId || eventTripId === tripId.toString()) {
          setTripAccepted(true);
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
          }
          
          // Auto-redirect to trip tracking screen
          const finalTripIdToUse = eventTripId || tripId;
          if (finalTripIdToUse) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Close modal and redirect
            setShowSuccessModal(false);
            setTimeout(() => {
              router.replace({
                pathname: '/trip-tracking',
                params: { id: finalTripIdToUse },
              });
            }, 500);
          }
        }
      });

      // Listen for trip status changes
      newSocket.on('trip-updated', (data: any) => {
        console.log('📬 Trip updated event:', data);
        const eventTripId = data.tripId?.toString() || data.tripId;
        if (eventTripId === tripId || eventTripId === tripId.toString()) {
          if (data.status === 'ACCEPTED') {
            setTripAccepted(true);
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
            }
            
            // Auto-redirect to trip tracking screen
            const finalTripIdToUse = eventTripId || successTripId || tripId;
            if (finalTripIdToUse) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Close modal and redirect
              setShowSuccessModal(false);
              setTimeout(() => {
                router.replace({
                  pathname: '/trip-tracking',
                  params: { id: finalTripIdToUse },
                });
              }, 500);
            }
          } else if (data.status === 'CANCELLED' || data.status === 'DRIVER_CANCELLED' || data.status === 'CUSTOMER_CANCELLED') {
            setTripCancelled(true);
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
            }
          }
        }
      });

      socketRef.current = newSocket;
    } catch (error) {
      console.error('Error initializing success socket:', error);
    }
  };

  const startCountdownTimer = () => {
    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    // Start countdown
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - auto cancel trip
          handleAutoCancel();
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAutoCancel = async () => {
    if (!successTripId) return;

    try {
      // Cancel the trip
      const response = await tripsAPI.updateTripState(successTripId, 'CUSTOMER_CANCELLED');
      if (response.ok) {
        setTripCancelled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (error) {
      console.error('Error auto-cancelling trip:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      // Cleanup
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Cleanup when modal closes
  useEffect(() => {
    if (!showSuccessModal) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }
  }, [showSuccessModal]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={22} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Driver</Text>
        <View style={styles.backButton} />
      </View>

      {/* Trip Summary */}
      {pickupLocation && dropLocation && (
        <View style={styles.tripSummary}>
          <View style={styles.locationRow}>
            <View style={styles.locationDot} />
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Pickup</Text>
              <Text style={styles.locationText} numberOfLines={1}>
                {pickupLocation.address}
              </Text>
            </View>
          </View>
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, styles.dropDot]} />
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Drop</Text>
              <Text style={styles.locationText} numberOfLines={1}>
                {dropLocation.address}
              </Text>
            </View>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Finding available drivers...</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="directions-car" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No drivers available</Text>
          <Text style={styles.emptySubtext}>Try again later or expand your search radius</Text>
        </View>
      ) : (
        <ScrollView style={styles.container}>
          {drivers.map((driver) => (
            <TouchableOpacity
              key={driver.driverId}
              style={[
                styles.driverCard,
                selectedDriver?.driverId === driver.driverId && styles.selectedCard,
              ]}
              onPress={() => handleSelectDriver(driver)}
              activeOpacity={0.7}
            >
              <View style={styles.driverHeader}>
                <View style={styles.driverAvatar}>
                  {driver.profilePhoto ? (
                    <Image 
                      source={{ uri: driver.profilePhoto }} 
                      style={styles.driverAvatarImage}
                    />
                  ) : (
                  <Text style={styles.driverAvatarText}>
                    {driver.driverName.charAt(0).toUpperCase()}
                  </Text>
                  )}
                </View>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driver.driverName}</Text>
                  <View style={styles.ratingContainer}>
                    {renderStars(Math.round(driver.rating))}
                    <Text style={styles.ratingText}>
                      {driver.rating.toFixed(1)} ({driver.totalTrips} trips)
                    </Text>
                  </View>
                </View>
                {selectedDriver?.driverId === driver.driverId && (
                  <View style={styles.selectedBadge}>
                    <Icon name="check-circle" size={20} color="#fff" />
                  </View>
                )}
              </View>

              <View style={styles.vehicleInfo}>
                <View style={styles.vehicleRow}>
                  <Icon name="local-shipping" size={20} color="#666" />
                  <Text style={styles.vehicleText}>
                    {driver.vehicleType} • {driver.vehicleNumber}
                  </Text>
                </View>
                <View style={styles.vehicleRow}>
                  <Icon name="location-on" size={20} color="#666" />
                  <Text style={styles.vehicleText}>
                    {driver.distance.toFixed(1)} km away • {driver.estimatedArrivalTime} min
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Request Button */}
      {selectedDriver && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.requestButton}
            onPress={handleRequestTrip}
            disabled={requesting}
          >
            {requesting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.requestButtonText}>Send Request</Text>
                <Icon name="send" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.successModal,
              {
                opacity: opacityAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={styles.successContent}>
              {/* Success Icon with Animation */}
              <Animated.View
                style={[
                  styles.successIconContainer,
                  {
                    transform: [
                      {
                        scale: checkmarkAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.successIconCircle}>
                  <Icon name="check" size={60} color="#4CAF50" />
                </View>
              </Animated.View>

              {/* Success Text */}
              <Text style={styles.successTitle}>Request Sent Successfully!</Text>
              <Text style={styles.successMessage}>
                {tripCancelled 
                  ? 'Sorry, no driver responded. Please check another driver.'
                  : tripAccepted
                  ? 'Driver accepted your request!'
                  : 'Wait for driver response...'}
              </Text>

              {/* Countdown Timer */}
              {!tripAccepted && !tripCancelled && (
                <View style={styles.timerContainer}>
                  <View style={styles.timerCircle}>
                    <Text style={styles.timerText}>{formatTime(timeRemaining)}</Text>
                  </View>
                  <Text style={styles.timerLabel}>Waiting for driver response</Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.successButtonsContainer}>
                <TouchableOpacity
                  style={[styles.successButton, styles.backButtonStyle]}
                  onPress={() => {
                    setShowSuccessModal(false);
                    opacityAnim.setValue(0);
                    scaleAnim.setValue(0);
                    checkmarkAnim.setValue(0);
                    if (timerIntervalRef.current) {
                      clearInterval(timerIntervalRef.current);
                    }
                    if (socketRef.current) {
                      socketRef.current.disconnect();
                    }
                    router.replace('/(tabs)/rides');
                  }}
                  activeOpacity={0.8}
                >
                  <Icon name="arrow-back" size={18} color="#666" />
                  <Text style={styles.backButtonText}>Back to Trips</Text>
                </TouchableOpacity>

                {!tripCancelled && (
                  <>
                    <TouchableOpacity
                      style={[styles.successButton, styles.negotiateButton]}
                      onPress={() => {
                        setShowSuccessModal(false);
                        opacityAnim.setValue(0);
                        scaleAnim.setValue(0);
                        checkmarkAnim.setValue(0);
                        if (timerIntervalRef.current) {
                          clearInterval(timerIntervalRef.current);
                        }
                        if (socketRef.current) {
                          socketRef.current.disconnect();
                        }
                        if (successTripId) {
                          router.push({
                            pathname: '/trip-negotiation',
                            params: { tripId: successTripId },
                          });
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Icon name="chat" size={18} color="#fff" />
                      <Text style={styles.negotiateButtonText}>Negotiate Fare</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.successButton, styles.successButtonPrimary]}
                      onPress={() => {
                        setShowSuccessModal(false);
                        opacityAnim.setValue(0);
                        scaleAnim.setValue(0);
                        checkmarkAnim.setValue(0);
                        if (timerIntervalRef.current) {
                          clearInterval(timerIntervalRef.current);
                        }
                        if (socketRef.current) {
                          socketRef.current.disconnect();
                        }
                        if (successTripId) {
                          router.push({
                            pathname: '/trip-tracking',
                            params: { id: successTripId },
                          });
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.successButtonPrimaryText}>View Trip</Text>
                      <Icon name="arrow-forward" size={18} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E9EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  tripSummary: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E9EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    marginTop: 3,
    marginRight: 14,
    borderWidth: 2,
    borderColor: '#E8F5E9',
  },
  dropDot: {
    backgroundColor: '#FF9800',
    borderColor: '#FFF3E0',
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '600',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  container: {
    flex: 1,
    paddingBottom: 100,
  },
  driverCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E8E9EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedCard: {
    borderColor: '#4CAF50',
    backgroundColor: '#F0FDF4',
    borderWidth: 2.5,
    shadowColor: '#4CAF50',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#E8F5E9',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  driverAvatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  driverAvatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  selectedBadge: {
    marginLeft: 'auto',
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    padding: 4,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  vehicleInfo: {
    marginTop: 4,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 10,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vehicleText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E8E9EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  requestButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  successModal: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  successContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  successIconContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  successIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  successMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  successButtonPrimary: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  successButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  successButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  successButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  negotiateButton: {
    backgroundColor: '#FF9800',
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  negotiateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  backButtonStyle: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  timerContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  timerCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#4CAF50',
    marginBottom: 12,
  },
  timerText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4CAF50',
  },
  timerLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});

