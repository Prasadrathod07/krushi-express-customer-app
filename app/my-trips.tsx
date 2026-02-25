import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { tripsAPI } from '../services/tripsAPI';
import { offersAPI } from '../services/offersAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';

interface Trip {
  _id: string;
  pickupLocation: {
    address?: string;
  };
  dropLocation: {
    address?: string;
  };
  parcelDetails: {
    category: string;
    weight: string;
  };
  currentTripState: string;
  estimatedFare: number;
  tripDate: string;
  driver?: {
    name: string;
    vehicleDetails: {
      type: string;
      number: string;
    };
  };
}

export default function MyTrips() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [tripsWithDriverOffers, setTripsWithDriverOffers] = useState<Set<string>>(new Set());
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    loadTrips();
    initializeSocket();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [filter]);

  // Periodically check for new driver offers (every 30 seconds to avoid rate limiting)
  useEffect(() => {
    const interval = setInterval(() => {
      if (trips.length > 0) {
        checkDriverOffers(trips);
      }
    }, 30000); // Check every 30 seconds to avoid rate limiting

    return () => clearInterval(interval);
  }, [trips]);

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to Socket.IO for trips');
      });

      // Listen for new driver offers
      newSocket.on('new-offer', (data: any) => {
        console.log('📬 New offer received in my-trips:', data);
        if (data.userType === 'driver' && (data.status === 'PENDING' || !data.status)) {
          const tripIdStr = data.tripId?.toString() || data.tripId;
          if (tripIdStr) {
            console.log('✅ Adding trip to driver offers list:', tripIdStr);
            setTripsWithDriverOffers((prev) => new Set([...prev, tripIdStr]));
            // Refresh trips to update UI
            setTimeout(() => loadTrips(), 300);
          }
        }
      });

      // Listen for driver offer received event
      newSocket.on('driver-offer-received', (data: any) => {
        console.log('📬 Driver offer received event in my-trips:', data);
        const tripIdStr = data.tripId?.toString() || data.tripId;
        if (tripIdStr) {
          console.log('✅ Adding trip to driver offers list from driver-offer-received:', tripIdStr);
          setTripsWithDriverOffers((prev) => new Set([...prev, tripIdStr]));
          // Refresh trips to update UI
          setTimeout(() => loadTrips(), 300);
        }
      });

      // Listen for offer updates
      newSocket.on('offer-updated', (data: any) => {
        console.log('📬 Offer updated:', data);
        if (data.userType === 'driver' && data.status === 'PENDING') {
          setTripsWithDriverOffers((prev) => new Set([...prev, data.tripId]));
        } else if (data.status === 'REJECTED' || data.status === 'EXPIRED') {
          // Remove from set if offer is rejected/expired
          setTripsWithDriverOffers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(data.tripId);
            return newSet;
          });
        }
      });

      // Listen for new notifications (which might include offer notifications)
      newSocket.on('new-notification', (data: any) => {
        console.log('📬 New notification received:', data);
        if (data.type === 'offer' && data.data?.tripId) {
          setTripsWithDriverOffers((prev) => new Set([...prev, data.data.tripId]));
          loadTrips();
        }
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Error initializing socket:', error);
    }
  };

  const loadTripsRef = useRef(false);
  
  const loadTrips = async () => {
    // Prevent concurrent loads
    if (loadTripsRef.current) {
      return;
    }
    
    try {
      loadTripsRef.current = true;
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) {
        router.replace('/login');
        return;
      }

      // Map filter to status values
      const statusMap: { [key: string]: string | undefined } = {
        'all': undefined,
        'completed': 'COMPLETED',
        'cancelled': 'CANCELLED,CUSTOMER_CANCELLED,DRIVER_CANCELLED',
        'active': 'REQUESTED,NEGOTIATING,ACCEPTED,ENROUTE_TO_PICKUP,ARRIVED_AT_PICKUP,PICKED_UP,ENROUTE_TO_DELIVERY,ARRIVED_AT_DELIVERY,DELIVERING',
      };
      const status = statusMap[filter];
      
      const response = await tripsAPI.getMyTrips(status);
      if (response.ok && response.data) {
        // Filter trips for current user
        const userTrips = Array.isArray(response.data) 
          ? response.data.filter((trip: any) => trip.customerId === userId)
          : [];
        setTrips(userTrips);
        
        // Check for driver offers for each trip (with delay to avoid rate limiting)
        setTimeout(() => {
          checkDriverOffers(userTrips);
        }, 500);
      }
    } catch (error: any) {
      // Handle rate limit errors gracefully
      if (error.message?.includes('slow down') || error.status === 429) {
        console.log('⚠️ Rate limited, will retry later');
        // Retry after delay
        setTimeout(() => {
          loadTripsRef.current = false;
          loadTrips();
        }, 5000);
        return;
      }
      console.error('Error loading trips:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadTripsRef.current = false;
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTrips();
  };

  const checkDriverOffersRef = useRef(false);
  
  const checkDriverOffers = async (tripsList: Trip[]) => {
    // Prevent concurrent checks
    if (checkDriverOffersRef.current) {
      return;
    }
    
    try {
      checkDriverOffersRef.current = true;
      const tripsWithOffers = new Set<string>();
      
      // Check offers for trips in REQUESTED or NEGOTIATING state
      const tripsToCheck = tripsList.filter(
        (trip) => trip.currentTripState === 'REQUESTED' || trip.currentTripState === 'NEGOTIATING'
      );
      
      // Limit to max 5 trips at a time to avoid rate limiting
      const tripsToCheckLimited = tripsToCheck.slice(0, 5);
      
      // Check offers for each trip sequentially (not parallel) to avoid rate limiting
      for (const trip of tripsToCheckLimited) {
        try {
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const offersResponse = await offersAPI.getTripOffers(trip._id);
          if (offersResponse.ok && offersResponse.data) {
            // Check if there are any pending offers from drivers
            const hasDriverOffer = offersResponse.data.some(
              (offer: any) => offer.userType === 'driver' && offer.status === 'PENDING'
            );
            if (hasDriverOffer) {
              tripsWithOffers.add(trip._id);
            }
          }
        } catch (error: any) {
          // Skip rate limit errors silently
          if (error.message?.includes('slow down') || error.status === 429) {
            console.log('⚠️ Rate limited, skipping offer check');
            break; // Stop checking if rate limited
          }
          console.error(`Error checking offers for trip ${trip._id}:`, error);
        }
      }
      
      setTripsWithDriverOffers(tripsWithOffers);
    } catch (error) {
      console.error('Error checking driver offers:', error);
    } finally {
      checkDriverOffersRef.current = false;
    }
  };

  const getTripStatusColor = (state: string) => {
    const statusMap: { [key: string]: string } = {
      REQUESTED: '#FF9800',
      NEGOTIATING: '#FF9800',
      ACCEPTED: '#4CAF50',
      ENROUTE_TO_PICKUP: '#2196F3',
      ARRIVED_AT_PICKUP: '#4CAF50',
      PICKED_UP: '#4CAF50',
      ENROUTE_TO_DELIVERY: '#2196F3',
      ARRIVED_AT_DELIVERY: '#4CAF50',
      DELIVERING: '#4CAF50',
      COMPLETED: '#4CAF50',
      CANCELLED: '#f44336',
      DRIVER_CANCELLED: '#f44336',
      CUSTOMER_CANCELLED: '#f44336',
    };
    return statusMap[state] || '#666';
  };

  const getTripStatusText = (state: string) => {
    const statusMap: { [key: string]: string } = {
      REQUESTED: 'Request Sent',
      NEGOTIATING: 'Negotiating',
      ACCEPTED: 'Driver Accepted',
      ENROUTE_TO_PICKUP: 'Driver Coming',
      ARRIVED_AT_PICKUP: 'Driver Arrived',
      PICKED_UP: 'Picked Up',
      ENROUTE_TO_DELIVERY: 'On the Way',
      ARRIVED_AT_DELIVERY: 'Arrived',
      DELIVERING: 'Delivering',
      COMPLETED: 'Completed',
      CANCELLED: 'Canceled',
      DRIVER_CANCELLED: 'Driver Canceled',
      CUSTOMER_CANCELLED: 'Canceled',
    };
    return statusMap[state] || state;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleTripPress = async (trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // If trip is completed, check if needs rating
    if (trip.currentTripState === 'COMPLETED') {
      try {
        const skipped = await AsyncStorage.getItem(`rating_skipped_${trip._id}`);
        if (!skipped) {
          const ratingResponse = await tripsAPI.getTripRating(trip._id);
          if (ratingResponse.ok && !ratingResponse.data) {
            // Not rated and not skipped, show rating prompt
            Alert.alert(
              'Rate Your Trip',
              'How was your experience? Please rate your driver.',
              [
                {
                  text: 'Later',
                  style: 'cancel',
                  onPress: () => router.push(`/trip-tracking?id=${trip._id}`),
                },
                {
                  text: 'Rate Now',
                  onPress: () => router.push(`/rate-trip?tripId=${trip._id}`),
                },
              ]
            );
            return;
          }
        }
      } catch (error) {
        console.error('Error checking rating:', error);
      }
    }
    
    router.push(`/trip-tracking?id=${trip._id}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading trips...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]} edges={['top']}>
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
        <Text style={styles.headerTitle}>My Trips</Text>
        <View style={styles.backButton} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {[
          { key: 'all', label: 'All' },
          { key: 'completed', label: 'Done' },
          { key: 'cancelled', label: 'Canceled' },
          { key: 'active', label: 'Active' },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterTab, filter === key && styles.filterTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilter(key as 'all' | 'active' | 'completed' | 'cancelled');
            }}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === key && styles.filterTabTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trips List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
        }
      >
        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="history" size={64} color="#ccc" />
            <Text style={styles.emptyStateText}>No trips found</Text>
            <Text style={styles.emptyStateSubtext}>
              {filter === 'all'
                ? 'Your trip history will appear here'
                : filter === 'active'
                ? 'You have no active trips'
                : filter === 'completed'
                ? 'You have no completed trips'
                : 'You have no canceled trips'}
            </Text>
          </View>
        ) : (
          trips.map((trip) => (
            <TouchableOpacity
              key={trip._id}
              style={styles.tripCard}
              onPress={() => handleTripPress(trip)}
              activeOpacity={0.7}
            >
              <View style={styles.tripHeader}>
                <View style={styles.tripStatus}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: getTripStatusColor(trip.currentTripState) },
                    ]}
                  />
                  <Text style={styles.tripStatusText}>
                    {getTripStatusText(trip.currentTripState)}
                  </Text>
                </View>
                <Text style={styles.tripDate}>{formatDate(trip.tripDate)}</Text>
              </View>

              <View style={styles.tripLocations}>
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {trip.pickupLocation.address || 'Pickup Location'}
                  </Text>
                </View>
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: '#FF9800' }]} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {trip.dropLocation.address || 'Drop Location'}
                  </Text>
                </View>
              </View>

              <View style={styles.tripDetails}>
                <View style={styles.detailItem}>
                  <Icon name="category" size={16} color="#666" />
                  <Text style={styles.detailText}>
                    {trip.parcelDetails.category} • {trip.parcelDetails.weight}
                  </Text>
                </View>
                {trip.driver ? (
                  <View style={styles.driverNameContainer}>
                    <Icon name="person" size={18} color="#4CAF50" />
                    <Text style={styles.driverNameText}>
                      {trip.driver.name}
                    </Text>
                    {trip.driver.vehicleDetails?.type && (
                      <Text style={styles.driverVehicleText}>
                        • {trip.driver.vehicleDetails.type}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.detailItem}>
                    <Icon name="person-outline" size={16} color="#999" />
                    <Text style={[styles.detailText, { color: '#999', fontStyle: 'italic' }]}>
                      Driver not assigned yet
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.tripFooter}>
                <View style={styles.footerLeft}>
                  <Text style={styles.tripFare}>₹{trip.estimatedFare.toFixed(0)}</Text>
                  {/* Only show negotiate button if driver has sent an offer */}
                  {tripsWithDriverOffers.has(trip._id) && (
                    <TouchableOpacity
                      style={styles.negotiateButton}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/trip-negotiation?tripId=${trip._id}`);
                      }}
                      activeOpacity={0.7}
                    >
                      <Icon name="chat" size={16} color="#FF9800" />
                      <Text style={styles.negotiateButtonText}>Negotiate</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Icon name="chevron-right" size={24} color="#ccc" />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
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
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#4CAF50',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 24,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  tripCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tripStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  tripDate: {
    fontSize: 12,
    color: '#999',
  },
  tripLocations: {
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  tripDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
  },
  driverNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F7FDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  driverNameText: {
    fontSize: Math.max(14, SCREEN_WIDTH * 0.038),
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  driverVehicleText: {
    fontSize: Math.max(12, SCREEN_WIDTH * 0.033),
    color: '#666',
    fontWeight: '500',
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tripFare: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
  },
  negotiateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  negotiateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },
});

