// Trip Negotiation Screen - Chat-like interface for offers and bargaining
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { offersAPI } from '../services/offersAPI';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import { useTrip } from '../contexts/TripContext';

const { width } = Dimensions.get('window');

interface Offer {
  _id: string;
  tripId: string;
  userId: string;
  userType: 'customer' | 'driver';
  amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  message?: string;
  createdAt: string;
  expiresAt: string;
  driver?: {
    name: string;
    phone: string;
  };
}

interface Trip {
  _id: string;
  currentTripState: string;
  estimatedFare: number;
  parcelDetails: {
    budget: number;
  };
  driverId?: string;
  driver?: {
    name: string;
    phone: string;
  };
}

export default function TripNegotiation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tripId = params.tripId as string;
  const { setActiveTrip, updateTripState } = useTrip();
  
  const [trip, setTrip] = useState<Trip | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [userId, setUserId] = useState<string>('');
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterOffer, setCounterOffer] = useState<Offer | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  
  // Track trip rejection state from socket events (immediate update)
  const [tripRejectedState, setTripRejectedState] = useState<string | null>(null);
  
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track last sent offer to prevent duplicates from socket events
  const lastSentOfferRef = useRef<{ userId: string; amount: number; timestamp: number } | null>(null);

  useEffect(() => {
    let cleanupFn: (() => void) | null = null;
    
    loadData();
    initializeSocket().then((cleanup) => {
      cleanupFn = cleanup;
    });
    
    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
      if (socket) {
        socket.off('new-offer');
        socket.off('offer-updated');
        socket.off('driver-offer-received');
        socket.off('trip-state-updated');
        socket.disconnect();
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [tripId]);
  
  // Reload trip data when screen comes into focus (in case trip was rejected from another screen)
  useFocusEffect(
    React.useCallback(() => {
      if (tripId) {
        console.log('🔄 Screen focused, reloading trip data...');
        loadData();
      }
    }, [tripId])
  );

  useEffect(() => {
    // Auto-scroll to bottom when new offers arrive (like chat)
    if (offers.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [offers.length]);

  // Debug: Log timer updates
  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      console.log(`⏰ Timer: ${formatTimer(timeRemaining)} remaining`);
    }
  }, [timeRemaining, timerActive]);

  // Check if trip is rejected/cancelled - disable negotiation
  // Check both trip state and immediate socket state
  const isTripRejected = tripRejectedState ? true : (trip?.currentTripState ? [
    'REJECTED',
    'DRIVER_CANCELLED',
    'CUSTOMER_CANCELLED',
    'CANCELLED'
  ].includes(trip.currentTripState) : false);
  
  // Debug log to track trip rejection status
  useEffect(() => {
    if (trip) {
      console.log('🔍 Trip state check:', {
        currentTripState: trip.currentTripState,
        isTripRejected,
        tripId: trip._id
      });
    }
  }, [trip?.currentTripState, isTripRejected]);

  // Stop timer if trip is rejected
  useEffect(() => {
    if (isTripRejected && timerActive) {
      console.log('⏰ Stopping timer - trip is rejected');
      stopTimer();
    }
  }, [isTripRejected, timerActive]);

  // Start timer when page loads and data is ready
  useEffect(() => {
    // Start timer when trip data is loaded and page is ready
    if (!loading && trip && !timerActive && !isTripRejected) {
      // Check if trip is in a negotiable state
      const tripState = trip.currentTripState || '';
      if (['REQUESTED', 'NEGOTIATING'].includes(tripState)) {
        console.log('⏰ Starting timer on page load');
        startTimer();
      }
    }
  }, [loading, trip, isTripRejected]);

  // Timer effect - keep timer running if there are pending offers
  useEffect(() => {
    // If timer is already active, keep it running
    // Only stop if all offers are accepted/rejected and timer was started by offers
    const hasPendingOffer = offers.some((o) => o.status === 'PENDING');
    if (hasPendingOffer && !timerActive) {
      console.log('⏰ Starting timer due to pending offer');
      startTimer();
    }
    // Don't stop timer just because there are no pending offers - let it run until expiry
  }, [offers]);

  const startTimer = () => {
    // Don't start if already active
    if (timerActive) {
      console.log('⏰ Timer already active, skipping start');
      return;
    }

    console.log('⏰ Starting timer with 5 minutes');
    setTimerActive(true);
    setTimeRemaining(300); // Reset to 5 minutes
    
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    // Start new interval
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          console.log('⏰ Timer expired');
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          handleTimerExpiry();
          return 0;
        }
        return newTime;
      });
    }, 1000);
    
    console.log('⏰ Timer interval started');
  };

  const resetTimer = () => {
    console.log('⏰ Resetting timer to 5 minutes');
    setTimeRemaining(300); // Reset to 5 minutes
    
    // If timer is not active, start it
    if (!timerActive) {
      startTimer();
    }
  };

  const stopTimer = () => {
    setTimerActive(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const handleTimerExpiry = async () => {
    stopTimer();
    Alert.alert(
      'Negotiation Time Expired',
      'The negotiation time has expired. Trip will be cancelled.',
      [
        {
          text: 'OK',
          onPress: async () => {
            try {
              if (tripId) {
                await tripsAPI.updateTripState(tripId, 'CUSTOMER_CANCELLED');
                router.replace('/(tabs)/rides');
              }
            } catch (error) {
              console.error('Error cancelling trip:', error);
            }
          },
        },
      ]
    );
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const storedUserId = await AsyncStorage.getItem('userId');
      if (storedUserId) {
        setUserId(storedUserId);
      }

      // Load trip details
      const tripResponse = await tripsAPI.getTrip(tripId);
      if (tripResponse.ok && tripResponse.data) {
        const tripData = tripResponse.data;
        setTrip(tripData);
        
        // Check if trip is rejected and update state immediately
        if (['REJECTED', 'DRIVER_CANCELLED', 'CUSTOMER_CANCELLED', 'CANCELLED'].includes(tripData.currentTripState)) {
          console.log('🚫 Trip is rejected, setting rejected state');
          setTripRejectedState(tripData.currentTripState);
          setOfferAmount(''); // Clear input
          stopTimer();
        } else {
          setTripRejectedState(null);
          // Set initial offer amount to budget only if trip is not rejected
          if (tripData.parcelDetails?.budget) {
            setOfferAmount(tripData.parcelDetails.budget.toString());
          }
        }
      }

      // Load offers
      await loadOffers();
    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message || 'Failed to load negotiation data');
    } finally {
      setLoading(false);
    }
  };

  const loadOffers = async () => {
    try {
      console.log('🔄 Loading offers for trip:', tripId);
      const response = await offersAPI.getTripOffers(tripId);
      if (response.ok && response.data) {
        // Sort offers by creation date (oldest first - like chat messages)
        const sortedOffers = (response.data || []).sort((a: Offer, b: Offer) => {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        const driverOffers = sortedOffers.filter((o: Offer) => o.userType === 'driver');
        console.log('📋 Loaded offers:', sortedOffers.length, 'Driver offers:', driverOffers.length);
        if (driverOffers.length > 0) {
          console.log('💰 Driver offer amounts:', driverOffers.map((o: Offer) => `₹${o.amount}`).join(', '));
        }
        setOffers(sortedOffers);
        
        // Scroll to bottom to show latest offers
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: false });
        }, 100);
        
        // Check if any offer is accepted - if so, stop timer
        const hasAccepted = sortedOffers.some((o: Offer) => o.status === 'ACCEPTED');
        if (hasAccepted && timerActive) {
          stopTimer();
        }
      } else {
        console.warn('⚠️ Failed to load offers:', response.message);
      }
    } catch (error: any) {
      console.error('Error loading offers:', error);
    }
  };

  const initializeSocket = async (): Promise<() => void> => {
    try {
      // Prevent multiple socket initializations
      if (socket && socket.connected) {
        console.log('⚠️ Socket already connected, skipping initialization');
        return () => {};
      }
      
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        return () => {};
      }

      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to Socket.IO for negotiations');
        
        // Subscribe to trip updates (this joins customer room automatically)
        const userId = AsyncStorage.getItem('userId').then(id => {
          if (id) {
            newSocket.emit('subscribe-trip', {
              tripId,
              userId: id,
              userType: 'customer',
            });
          }
        });
      });

      newSocket.on('new-offer', (data: Offer) => {
        console.log('📬 New offer received (real-time):', data);
        const dataTripId = data.tripId?.toString() || data.tripId;
        const currentTripId = tripId?.toString() || tripId;
        
        if (dataTripId === currentTripId) {
          console.log('✅ Offer matches current trip, adding instantly');
          // Update state immediately - no API call needed for real-time feel
          setOffers((prev) => {
            const dataOfferId = data._id?.toString() || data._id;
            const exists = prev.some((o) => {
              const offerId = o._id?.toString() || o._id;
              return offerId === dataOfferId;
            });
            
            if (exists) {
              console.log('🔄 Updating existing offer instantly');
              // Update existing offer immediately
              return prev.map((offer) => {
                const offerId = offer._id?.toString() || offer._id;
                return offerId === dataOfferId ? data : offer;
              });
            } else {
              // Check if this is a duplicate offer we just sent
              // This prevents duplicates when socket event arrives after API response
              const isRecentDuplicate = lastSentOfferRef.current &&
                data.userId === lastSentOfferRef.current.userId &&
                data.userType === 'customer' &&
                Math.abs(data.amount - lastSentOfferRef.current.amount) < 0.01 &&
                (Date.now() - lastSentOfferRef.current.timestamp) < 5000; // Within 5 seconds
              
              if (isRecentDuplicate) {
                console.log('⚠️ Duplicate offer detected (recently sent by current user), skipping socket update');
                return prev;
              }
              
              // Also check if this offer already exists by comparing userId, amount, and recent timestamp
              const isDuplicate = prev.some((o) => {
                // Skip temp/optimistic offers in comparison
                if (o._id?.toString().startsWith('temp-')) return false;
                // Check if same user, same amount, and created within last 3 seconds
                const timeDiff = Math.abs(
                  new Date(o.createdAt).getTime() - new Date(data.createdAt).getTime()
                );
                return (
                  o.userId === data.userId &&
                  o.userType === data.userType &&
                  Math.abs(o.amount - data.amount) < 0.01 &&
                  timeDiff < 3000
                );
              });
              
              if (isDuplicate) {
                console.log('⚠️ Duplicate offer detected (already exists), skipping socket update');
                return prev;
              }
              
              // Add new offer at the end (bottom) - like chat messages
              const updated = [...prev, data].sort((a, b) => {
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              });
              console.log('✅ Added new offer instantly. Total offers:', updated.length);
              // Reset timer on new pending offer (any response resets timer)
              if (data.status === 'PENDING') {
                resetTimer();
              }
              // Auto-scroll to show new offer at bottom
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }, 100);
              return updated;
            }
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          console.log('⚠️ Offer tripId mismatch:', { dataTripId, currentTripId });
        }
      });

      newSocket.on('driver-offer-received', (data: any) => {
        console.log('📬 Driver offer received event:', data);
        // This event is handled by 'new-offer' event above, no need to reload
      });

      newSocket.on('offer-updated', (data: Offer) => {
        console.log('📬 Offer updated (real-time):', data);
        const dataTripId = data.tripId?.toString() || data.tripId;
        const currentTripId = tripId?.toString() || tripId;
        
        if (dataTripId === currentTripId) {
          // Update state immediately, but only if the offer actually changed
          setOffers((prev) => {
            const dataOfferId = data._id?.toString() || data._id;
            const existingOffer = prev.find((o) => {
              const offerId = o._id?.toString() || o._id;
              return offerId === dataOfferId;
            });
            
            // Check if this is a duplicate update (same status and amount)
            if (existingOffer && 
                existingOffer.status === data.status && 
                Math.abs(existingOffer.amount - data.amount) < 0.01) {
              console.log('⚠️ Duplicate offer update detected, skipping');
              return prev;
            }
            
            // Update the offer
            return prev.map((offer) => {
              const offerId = offer._id?.toString() || offer._id;
              if (offerId === dataOfferId) {
                // Stop timer if offer is accepted/rejected
                if (data.status === 'ACCEPTED' || data.status === 'REJECTED') {
                  stopTimer();
                }
                return data;
              }
              return offer;
            });
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });

      // Listen for trip acceptance - CRITICAL: Only update state, navigation handled by TripContext
      newSocket.on('trip-accepted', async (data: { tripId: string; trip: any; otp?: string; message?: string }) => {
        if (data.tripId === tripId) {
          console.log('🎉 Trip accepted in negotiation screen:', data);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          // Stop timer
          stopTimer();
          
          // CRITICAL: Update trip state and context - TripContext handles navigation automatically
          if (data.trip) {
            const tripData = {
              ...data.trip,
              currentTripState: data.trip.currentTripState || 'ACCEPTED',
              otp: data.otp || data.trip.otp,
            };
            
            // Update local state
            setTrip((prevTrip) => ({
              ...prevTrip,
              ...tripData,
            }));
            
            // Update global context - TripContext will navigate to /active-trip
            setActiveTrip(tripData);
          }
        }
      });

      // Listen for trip state updates - CRITICAL: Only update state, navigation handled by TripContext
      newSocket.on('trip-state-updated', (data: { tripId: string; state: string; trip?: any }) => {
        if (data.tripId === tripId) {
          console.log('📬 Trip state updated:', data.state);
          
          // CRITICAL: Update context - TripContext handles navigation automatically
          updateTripState(tripId, data.state, data.trip);
          
          // If trip is rejected, immediately update state (before reload)
          if (['REJECTED', 'DRIVER_CANCELLED', 'CUSTOMER_CANCELLED', 'CANCELLED'].includes(data.state)) {
            console.log('🚫 Trip rejected detected, blocking all communication immediately');
            setTripRejectedState(data.state); // Immediate state update
            stopTimer();
            setOfferAmount(''); // Clear input field
            setShowCounterModal(false); // Close any open modals
            setCounterOffer(null);
            setCounterAmount('');
            
            // Also update trip state immediately if trip data is available
            if (trip) {
              setTrip({ ...trip, currentTripState: data.state });
            }
          } else {
            // Clear rejection state if trip is not rejected
            setTripRejectedState(null);
          }
          
          // Reload trip data to get updated state
          loadData();
        }
      });

      setSocket(newSocket);

      // Cleanup function
      return () => {
        if (newSocket) {
          console.log('🧹 Cleaning up socket listeners');
          newSocket.emit('leave-trip-room', { tripId });
          newSocket.off('new-offer');
          newSocket.off('offer-updated');
          newSocket.off('driver-offer-received');
          newSocket.off('trip-state-updated');
          newSocket.off('trip-accepted');
          newSocket.disconnect();
        }
      };
    } catch (error) {
      console.error('Error initializing socket:', error);
      return () => {}; // Return empty cleanup function on error
    }
  };

  const handleSendOffer = async () => {
    // Check if trip is rejected - prevent sending offers (double check)
    const tripRejected = isTripRejected || (trip?.currentTripState && [
      'REJECTED',
      'DRIVER_CANCELLED',
      'CUSTOMER_CANCELLED',
      'CANCELLED'
    ].includes(trip.currentTripState));
    
    if (tripRejected) {
      Alert.alert('Negotiation Closed', 'This trip has been rejected. Negotiation is no longer available.');
      return;
    }

    if (!offerAmount || isNaN(parseFloat(offerAmount)) || parseFloat(offerAmount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid offer amount');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'User ID not found. Please login again.');
      return;
    }

    setSubmitting(true);
    const amount = parseFloat(offerAmount);
    
    // Optimistic update - add offer immediately for instant feedback
    const optimisticOffer: Offer = {
      _id: `temp-${Date.now()}`,
      tripId,
      userId,
      userType: 'customer',
      amount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    
    setOffers((prev) => {
      // Add new offer at the end (bottom) - like chat messages
      const updated = [...prev, optimisticOffer].sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return updated;
    });
    setOfferAmount('');
    resetTimer(); // Reset timer when sending offer
    
    // Track this offer to prevent duplicate socket events
    lastSentOfferRef.current = {
      userId,
      amount,
      timestamp: Date.now(),
    };
    
    try {
      const response = await offersAPI.createOffer(tripId, amount, userId);
      
      if (response.ok && response.data) {
        // Replace optimistic offer with real one
        setOffers((prev) => {
          const filtered = prev.filter((o) => o._id !== optimisticOffer._id);
          return [...filtered, response.data!].sort((a, b) => {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Clear the tracking after 5 seconds (socket events should arrive within this time)
        setTimeout(() => {
          lastSentOfferRef.current = null;
        }, 5000);
      } else {
        // Remove optimistic offer on error
        setOffers((prev) => prev.filter((o) => o._id !== optimisticOffer._id));
        lastSentOfferRef.current = null;
        throw new Error(response.message || 'Failed to send offer');
      }
    } catch (error: any) {
      console.error('Error sending offer:', error);
      // Remove optimistic offer on error
      setOffers((prev) => prev.filter((o) => o._id !== optimisticOffer._id));
      lastSentOfferRef.current = null;
      Alert.alert('Error', error.message || 'Failed to send offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptOffer = async (offer: Offer) => {
    if (!userId) {
      Alert.alert('Error', 'User ID not found');
      return;
    }

    Alert.alert(
      'Accept Offer',
      `Accept driver's offer of ₹${offer.amount.toFixed(0)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              setSubmitting(true);
              stopTimer(); // Stop timer on accept
              const response = await offersAPI.acceptOffer(offer._id, userId);
              if (response.ok) {
                // Stop all timers immediately
                stopTimer();
                
                // Navigation handled by TripContext when state updates
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                throw new Error(response.message || 'Failed to accept offer');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to accept offer');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleRejectOffer = async (offer: Offer) => {
    if (!userId) {
      Alert.alert('Error', 'User ID not found');
      return;
    }

    try {
      setSubmitting(true);
      const response = await offersAPI.rejectOffer(offer._id, userId);
      if (response.ok) {
        await loadOffers();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        throw new Error(response.message || 'Failed to reject offer');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reject offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCounterOffer = async (offer: Offer, newAmount: number) => {
    // Check if trip is rejected - prevent sending counter offers
    if (isTripRejected) {
      Alert.alert('Negotiation Closed', 'This trip has been rejected. Negotiation is no longer available.');
      setShowCounterModal(false);
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'User ID not found');
      return;
    }

    if (!newAmount || isNaN(newAmount) || newAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid counter offer amount');
      return;
    }

    try {
      setSubmitting(true);
      
      // Track this counter offer to prevent duplicate socket events
      lastSentOfferRef.current = {
        userId,
        amount: newAmount,
        timestamp: Date.now(),
      };
      
      const response = await offersAPI.counterOffer(offer._id, newAmount, userId);
      if (response.ok && response.data) {
        await loadOffers();
        resetTimer(); // Reset timer on counter offer
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', `Your counter offer of ₹${newAmount.toFixed(0)} has been sent to the driver`);
        setOfferAmount('');
        
        // Clear the tracking after 5 seconds (socket events should arrive within this time)
        setTimeout(() => {
          lastSentOfferRef.current = null;
        }, 5000);
      } else {
        lastSentOfferRef.current = null;
        throw new Error(response.message || 'Failed to send counter offer');
      }
    } catch (error: any) {
      lastSentOfferRef.current = null;
      Alert.alert('Error', error.message || 'Failed to send counter offer');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const renderOffer = (offer: Offer, index: number) => {
    const isCustomer = offer.userType === 'customer';
    const isPending = offer.status === 'PENDING';
    const isAccepted = offer.status === 'ACCEPTED';
    const isRejected = offer.status === 'REJECTED';
    const isExpired = offer.status === 'EXPIRED';

    if (!offer._id) {
      console.warn('Offer missing _id:', offer);
      return null;
    }

    return (
      <View
        key={offer._id || `offer-${index}`}
        style={[
          styles.offerBubble,
          isCustomer ? styles.customerOffer : styles.driverOffer,
        ]}
      >
        <View style={styles.offerHeader}>
          <View style={styles.offerSender}>
            <Icon
              name={isCustomer ? 'person' : 'local-taxi'}
              size={16}
              color={isCustomer ? '#4CAF50' : '#FF9800'}
            />
            <Text style={styles.offerSenderText}>
              {isCustomer ? 'You' : offer.driver?.name || 'Driver'}
            </Text>
          </View>
          <Text style={styles.offerTime}>{formatTime(offer.createdAt)}</Text>
        </View>

        <View style={styles.offerContent}>
          <View style={styles.offerAmountContainer}>
            <Text style={styles.offerAmountLabel}>
              {isCustomer ? 'Your Offer' : "Driver's Offer"}
            </Text>
            <Text style={[styles.offerAmount, !isCustomer && styles.driverOfferAmount]}>
              ₹{offer.amount.toFixed(0)}
            </Text>
          </View>

          {offer.message && (
            <Text style={styles.offerMessage}>{offer.message}</Text>
          )}

          {/* Action buttons for pending offers - ONLY show on driver offers, NOT on customer's own offers */}
          {isPending && !isTripRejected && !isCustomer && (
            <View style={styles.offerActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => handleRejectOffer(offer)}
                disabled={submitting}
              >
                <Icon name="close" size={16} color="#fff" />
                <Text style={styles.actionButtonText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.counterButton]}
                onPress={() => {
                  if (isTripRejected) {
                    Alert.alert('Negotiation Closed', 'This trip has been rejected. Negotiation is no longer available.');
                    return;
                  }
                  // For driver offers, show counter offer modal
                  setCounterOffer(offer);
                  setCounterAmount(offer.amount.toString());
                  setShowCounterModal(true);
                }}
                disabled={submitting || isTripRejected}
              >
                <Icon name="swap-horiz" size={16} color="#fff" />
                <Text style={styles.actionButtonText}>Negotiate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() => handleAcceptOffer(offer)}
                disabled={submitting}
              >
                <Icon name="check" size={16} color="#fff" />
                <Text style={styles.actionButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Customer's own offers - Show status badge only, no action buttons */}
          {isPending && isCustomer && (
            <View style={styles.statusBadge}>
              <Icon name="schedule" size={16} color="#FF9800" />
              <Text style={[styles.statusText, { color: '#FF9800' }]}>Waiting for driver response...</Text>
            </View>
          )}

          {isAccepted && (
            <View style={styles.statusBadge}>
              <Icon name="check-circle" size={16} color="#4CAF50" />
              <Text style={styles.statusText}>Accepted</Text>
            </View>
          )}

          {isRejected && (
            <View style={[styles.statusBadge, styles.rejectedBadge]}>
              <Icon name="cancel" size={16} color="#f44336" />
              <Text style={[styles.statusText, styles.rejectedText]}>Rejected</Text>
            </View>
          )}

          {isExpired && (
            <View style={[styles.statusBadge, styles.expiredBadge]}>
              <Icon name="schedule" size={16} color="#999" />
              <Text style={[styles.statusText, styles.expiredText]}>Expired</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading negotiations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const budget = trip?.parcelDetails?.budget || trip?.estimatedFare || 0;
  const hasActiveOffers = offers.some((o) => o.status === 'PENDING');

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
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
          <Icon name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Negotiate Fare</Text>
          <Text style={styles.headerSubtitle}>
            {trip?.driver?.name || 'Driver'} • Trip #{tripId.slice(-6)}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Budget Info */}
      <View style={styles.budgetCard}>
        <View style={styles.budgetInfo}>
          <Icon name="account-balance-wallet" size={20} color="#4CAF50" />
          <View style={styles.budgetTextContainer}>
            <Text style={styles.budgetLabel}>Your Budget</Text>
            <Text style={styles.budgetAmount}>₹{budget.toFixed(0)}</Text>
          </View>
        </View>
        {hasActiveOffers && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Active Negotiations</Text>
          </View>
        )}
      </View>

      {/* Timer Bar - Shows when timer is active */}
      {timerActive && timeRemaining > 0 && (
        <View style={[
          styles.timerBar,
          timeRemaining <= 60 && styles.timerBarWarning
        ]}>
          <Icon 
            name="access-time" 
            size={18} 
            color={timeRemaining <= 60 ? "#f44336" : "#FF9800"} 
          />
          <Text style={[
            styles.timerText,
            timeRemaining <= 60 && styles.timerTextWarning
          ]}>
            {timeRemaining <= 60 
              ? `Time running out: ${formatTimer(timeRemaining)}`
              : `Negotiation time: ${formatTimer(timeRemaining)}`
            }
          </Text>
        </View>
      )}

      {/* Offers List */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.offersList}
          contentContainerStyle={styles.offersContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
        >
          {!offers || offers.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="chat-bubble-outline" size={64} color="#ccc" />
              <Text style={styles.emptyStateText}>No offers yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Start negotiating by sending your first offer
              </Text>
            </View>
          ) : (
            offers.map((offer, index) => {
              if (!offer || !offer._id) {
                console.warn('Invalid offer at index:', index, offer);
                return null;
              }
              return renderOffer(offer, index);
            })
          )}
        </ScrollView>

        {/* Input Section - Completely hidden when trip is rejected */}
        {!loading && trip && !isTripRejected && (
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Icon name="currency-rupee" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your offer amount"
                placeholderTextColor="#999"
                value={offerAmount}
                onChangeText={setOfferAmount}
                keyboardType="numeric"
                editable={!submitting && !isTripRejected}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendButton, (submitting || isTripRejected) && styles.sendButtonDisabled]}
              onPress={handleSendOffer}
              disabled={submitting || !offerAmount || isTripRejected}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="send" size={20} color="#fff" />
                  <Text style={styles.sendButtonText}>Send</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        
        {/* Rejected Message - Show when trip is rejected */}
        {!loading && trip && isTripRejected && (
          <View style={[styles.inputContainer, styles.rejectedContainer]}>
            <View style={styles.rejectedMessage}>
              <Icon name="close" size={24} color="#f44336" />
              <Text style={styles.rejectedMessageText}>
                Negotiation Closed - This trip has been rejected
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Counter Offer Modal */}
      {showCounterModal && counterOffer && !isTripRejected && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Counter Offer</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCounterModal(false);
                  setCounterOffer(null);
                  setCounterAmount('');
                }}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>
                Driver offered: ₹{counterOffer.amount.toFixed(0)}
              </Text>
              <Text style={styles.modalSubtext}>
                Enter your counter offer amount:
              </Text>

              <View style={styles.modalInputWrapper}>
                <Icon name="currency-rupee" size={20} color="#666" style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter amount"
                  placeholderTextColor="#999"
                  value={counterAmount}
                  onChangeText={setCounterAmount}
                  keyboardType="numeric"
                  autoFocus
                  editable={!isTripRejected}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => {
                    setShowCounterModal(false);
                    setCounterOffer(null);
                    setCounterAmount('');
                  }}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalSubmitButton]}
                  onPress={async () => {
                    if (!counterAmount || isNaN(parseFloat(counterAmount)) || parseFloat(counterAmount) <= 0) {
                      Alert.alert('Invalid Amount', 'Please enter a valid counter offer amount');
                      return;
                    }
                    await handleCounterOffer(counterOffer, parseFloat(counterAmount));
                    setShowCounterModal(false);
                    setCounterOffer(null);
                    setCounterAmount('');
                  }}
                  disabled={submitting || isTripRejected}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="send" size={18} color="#fff" />
                      <Text style={styles.modalSubmitText}>Send Counter</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 1,
    borderBottomColor: '#FFB74D',
  },
  timerBarWarning: {
    backgroundColor: '#FFEBEE',
    borderBottomColor: '#f44336',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
  },
  timerTextWarning: {
    color: '#f44336',
    fontWeight: '700',
  },
  budgetCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  budgetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  budgetTextContainer: {
    flex: 1,
  },
  budgetLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  budgetAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  activeText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  offersList: {
    flex: 1,
  },
  offersContent: {
    padding: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  offerBubble: {
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    maxWidth: width * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  customerOffer: {
    backgroundColor: '#E8F5E9',
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  driverOffer: {
    backgroundColor: '#FFF3E0', // Light orange/peach background for driver offers
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFB74D', // Orange border to match driver theme
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  offerSender: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerSenderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  offerTime: {
    fontSize: 11,
    color: '#999',
  },
  offerContent: {
    gap: 8,
  },
  offerAmountContainer: {
    marginBottom: 4,
  },
  offerAmountLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  offerAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  driverOfferAmount: {
    color: '#FF9800', // Orange color to highlight driver's offer amount
    fontSize: 30,
  },
  offerMessage: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  offerActions: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  counterButton: {
    backgroundColor: '#FF9800',
  },
  singleActionButton: {
    marginTop: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignSelf: 'flex-start',
  },
  rejectedBadge: {
    backgroundColor: '#FFEBEE',
  },
  expiredBadge: {
    backgroundColor: '#F5F5F5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  rejectedText: {
    color: '#f44336',
  },
  expiredText: {
    color: '#999',
  },
  rejectedContainer: {
    backgroundColor: '#FFEBEE',
    borderTopWidth: 1,
    borderTopColor: '#FFCDD2',
  },
  rejectedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rejectedMessageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f44336',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    paddingVertical: 12,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    minWidth: 100,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: width * 0.9,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  modalSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 20,
  },
  modalInputIcon: {
    marginRight: 8,
  },
  modalInput: {
    flex: 1,
    fontSize: 18,
    color: '#1a1a1a',
    paddingVertical: 14,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalCancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalSubmitButton: {
    backgroundColor: '#FF9800',
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
