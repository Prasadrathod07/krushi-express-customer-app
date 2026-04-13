import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar,
  Animated, TouchableOpacity, Alert, Dimensions, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { tripsAPI } from '../services/tripsAPI';
import { socketManager } from '../services/socketManager';
import { useTrip } from '../contexts/TripContext';

const { width } = Dimensions.get('window');

// ── Sonar ring animation ──────────────────────────────────────────────────────
function SonarRing({ delay, color }: { delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.8] });
  const opacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.sonarRing, { borderColor: color, opacity, transform: [{ scale }] }]}
    />
  );
}

function BounceDot({ delay }: { delay: number }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -7, duration: 300, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0,  duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[s.dot, { transform: [{ translateY: y }] }]} />;
}

// ── Wave messages ─────────────────────────────────────────────────────────────
const WAVE_MESSAGES: Record<number, string> = {
  0: 'Searching nearest drivers...',
  1: 'Searching within 2.5km...',
  2: 'Expanding to 5km...',
  3: 'Expanding to 7.5km...',
  4: 'Searching up to 10km...',
  5: 'Priority Search — 10km+...',
  6: 'Priority Search — 12.5km+...',
  7: 'Priority Search — 15km+...',
  8: 'Priority Search — up to 20km...',
};

type Phase = 'searching' | 'offer' | 'no-drivers' | 'priority-searching' | 'exhausted';

interface DriverOffer {
  driverId: string;
  driver: { name: string; phone: string; vehicleType: string; vehicleNumber: string };
  offerAmount: number;
  originalFare: number;
}

export default function SearchingDrivers() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams();
  const { setActiveTrip, clearActiveTrip } = useTrip();

  const [phase, setPhase]           = useState<Phase>('searching');
  const [waveNum, setWaveNum]       = useState(0);
  const [waveMsg, setWaveMsg]       = useState(WAVE_MESSAGES[0]);
  const [elapsed, setElapsed]       = useState(0);
  const [tripId, setTripId]         = useState<string | null>(null);
  const [driverOffer, setDriverOffer] = useState<DriverOffer | null>(null);
  const [respondingOffer, setRespondingOffer] = useState(false);

  const tripIdRef        = useRef<string | null>(null);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef     = useRef(Date.now());
  const handledRef       = useRef(false); // prevent duplicate handling of trip-accepted

  const iconBounce   = useRef(new Animated.Value(0)).current;
  const cardSlide    = useRef(new Animated.Value(80)).current;
  const cardOpacity  = useRef(new Animated.Value(0)).current;
  const mapRef       = useRef<MapView>(null);

  const pickupLocation = params.pickupLocation ? JSON.parse(params.pickupLocation as string) : null;
  const dropLocation   = params.dropLocation   ? JSON.parse(params.dropLocation   as string) : null;
  const tripDetails    = params.tripDetails    ? JSON.parse(params.tripDetails    as string) : null;

  // Reconnect mode: tripId passed but no trip creation data (returning from failed negotiation)
  const reconnectTripId = (params.tripId as string) || null;
  const isReconnect = !!reconnectTripId && !pickupLocation;

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Map animation
    if (pickupLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: pickupLocation.latitude, longitude: pickupLocation.longitude,
        latitudeDelta: 0.08, longitudeDelta: 0.08,
      }, 800);
    }
    // Truck bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconBounce, { toValue: -10, duration: 700, useNativeDriver: true }),
        Animated.timing(iconBounce, { toValue: 0,   duration: 700, useNativeDriver: true }),
      ])
    ).start();
    // Card slide up
    Animated.parallel([
      Animated.timing(cardSlide,   { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
    // Elapsed timer
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);

    if (isReconnect) {
      // Returning from failed negotiation — reconnect to existing trip, don't create new one
      reconnectToExistingTrip(reconnectTripId!);
    } else {
      // Fresh search — start fallback timer + create new trip
      fallbackTimerRef.current = setTimeout(() => {
        setPhase(prev => (prev === 'searching' ? 'no-drivers' : prev));
      }, 100000);
      createTripAndBroadcast();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      // Unsubscribe from trip room and remove all our listeners
      if (tripIdRef.current) socketManager.unsubscribeFromTrip(tripIdRef.current);
      socketManager.off('wave-expanding', handleWaveExpanding);
      socketManager.off('no-drivers-found', handleNoDriversFound);
      socketManager.off('priority-search-started', handlePrioritySearchStarted);
      socketManager.off('search-exhausted', handleSearchExhausted);
      socketManager.off('driver-offer', handleDriverOffer);
      socketManager.off('negotiation-expired', handleNegotiationExpired);
      socketManager.off('trip-accepted', handleTripAccepted);
      socketManager.off('trip-state-updated', handleTripStateUpdated);
    };
  }, []);

  // ── Create trip then connect socket ───────────────────────────────────────
  const createTripAndBroadcast = async () => {
    if (!pickupLocation || !dropLocation || !tripDetails) {
      setPhase('exhausted');
      return;
    }
    try {
      const res = await tripsAPI.createTrip({
        pickupLocation: { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, address: pickupLocation.address },
        dropLocation:   { latitude: dropLocation.latitude,   longitude: dropLocation.longitude,   address: dropLocation.address },
        parcelDetails: {
          type: tripDetails.parcelType || 'Other Items',
          category: tripDetails.category || 'Other Items',
          weight: tripDetails.weight || 'Not specified',
          images: tripDetails.images || [],
          description: tripDetails.description || '',
          budget: tripDetails.budget,
        },
        requestedVehicleType: tripDetails.vehicleType || 'Tempo',
        estimatedFare: tripDetails.budget || tripDetails.estimatedFare,
      }) as any;

      if (!res?.ok || !res?.data?._id) {
        Alert.alert('Error', res?.message || 'Failed to create trip. Please try again.');
        router.back();
        return;
      }

      const newTripId = res.data._id.toString();
      setTripId(newTripId);
      tripIdRef.current = newTripId;

      connectSocket(newTripId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start search.');
      router.back();
    }
  };

  // ── Reconnect to existing trip after failed negotiation ───────────────────
  const reconnectToExistingTrip = async (existingTripId: string) => {
    setTripId(existingTripId);
    tripIdRef.current = existingTripId;

    // Subscribe to socket FIRST so we don't miss the resumeOrNotify event from backend
    connectSocket(existingTripId);

    try {
      const res = await tripsAPI.getTrip(existingTripId) as any;
      const trip = res?.data || res;
      if (!trip) { setPhase('exhausted'); return; }

      const currentWave = trip.broadcastWave || 0;
      setWaveNum(currentWave);

      // Use broadcastStatus (set by wave service) to determine exactly where we are
      const status: string = trip.broadcastStatus || 'ACTIVE';

      if (status === 'PHASE2_EXPIRED') {
        // Both phases done
        setPhase('exhausted');
      } else if (status === 'PHASE1_EXPIRED') {
        // Phase 1 done, customer can start phase 2
        setPhase('no-drivers');
      } else if (trip.prioritySearchActive) {
        // Phase 2 still running
        setPhase('priority-searching');
        setWaveMsg(WAVE_MESSAGES[currentWave] || 'Priority Search active...');
        startTimeRef.current = Date.now(); // reset elapsed for phase 2 display
      } else {
        // Phase 1 still running
        setPhase('searching');
        setWaveMsg(WAVE_MESSAGES[currentWave] || 'Searching...');
      }
    } catch {
      // Network issue — show searching, wave events will update state
      setPhase('searching');
    }
  };

  // ── Named handlers (defined before useEffect cleanup can reference them) ────

  const handleWaveExpanding = useCallback((data: { tripId: string; waveNum: number; message: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    setWaveNum(data.waveNum);
    setWaveMsg(data.message || WAVE_MESSAGES[data.waveNum] || 'Still searching...');
  }, []);

  const handleNoDriversFound = useCallback((data: { tripId: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setPhase('no-drivers');
  }, []);

  const handlePrioritySearchStarted = useCallback((data: { tripId: string; message: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    setPhase('priority-searching');
    setWaveMsg(data.message || 'Priority Search active...');
    startTimeRef.current = Date.now();
  }, []);

  const handleSearchExhausted = useCallback((data: { tripId: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setPhase('exhausted');
  }, []);

  const handleDriverOffer = useCallback((data: { tripId: string; driverId: string; driver: any; offerAmount: number; originalFare: number }) => {
    if (data.tripId !== tripIdRef.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDriverOffer({ driverId: data.driverId, driver: data.driver, offerAmount: data.offerAmount, originalFare: data.originalFare });
    setPhase('offer');
  }, []);

  const handleNegotiationExpired = useCallback((data: { tripId: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    setDriverOffer(null);
    setPhase('searching');
  }, []);

  const handleTripAccepted = useCallback((data: { tripId: string; trip: any; otp: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    if (handledRef.current) return;
    handledRef.current = true;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (data.trip) setActiveTrip({ ...data.trip, otp: data.otp || data.trip.otp });
    router.replace({ pathname: '/trip-tracking', params: { id: tripIdRef.current! } });
  }, []);

  // ── Trip state socket events ──────────────────────────────────────────────
  const handleTripStateUpdated = useCallback((data: { tripId: string; state: string }) => {
    if (data.tripId !== tripIdRef.current) return;
    if (data.state === 'NEGOTIATING') {
      // Driver started negotiation — go to chat
      if (handledRef.current) return;
      handledRef.current = true;
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/trip-negotiation', params: { tripId: tripIdRef.current! } });
    } else if (data.state === 'REQUESTED') {
      // Wave resumed after negotiation ended — stay/return to searching
      handledRef.current = false; // allow future navigation again
      setPhase(prev => (prev === 'no-drivers' || prev === 'exhausted') ? prev : 'searching');
    }
  }, []);

  // ── Register socketManager listeners and subscribe to trip room ─────────────
  const connectSocket = (tId: string) => {
    socketManager.subscribeToTrip(tId);
    socketManager.on('wave-expanding', handleWaveExpanding);
    socketManager.on('no-drivers-found', handleNoDriversFound);
    socketManager.on('priority-search-started', handlePrioritySearchStarted);
    socketManager.on('search-exhausted', handleSearchExhausted);
    socketManager.on('driver-offer', handleDriverOffer);
    socketManager.on('negotiation-expired', handleNegotiationExpired);
    socketManager.on('trip-accepted', handleTripAccepted);
    socketManager.on('trip-state-updated', handleTripStateUpdated);
  };

  // ── Respond to offer ───────────────────────────────────────────────────────
  const handleOfferAccept = async () => {
    if (!tripId || !driverOffer) return;
    setRespondingOffer(true);
    try {
      const res = await tripsAPI.respondToOffer(tripId, 'accept') as any;
      if (!res?.ok) throw new Error(res?.message || 'Failed to accept offer');
      // trip-accepted socket will fire and navigate
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept offer');
      setRespondingOffer(false);
    }
  };

  const handleOfferReject = async () => {
    if (!tripId) return;
    setRespondingOffer(true);
    try {
      await tripsAPI.respondToOffer(tripId, 'reject');
      setDriverOffer(null);
      setPhase('searching');
    } catch {
      setPhase('searching');
    } finally {
      setRespondingOffer(false);
    }
  };

  // ── Priority search triggered by customer ─────────────────────────────────
  const handlePrioritySearch = async () => {
    if (!tripId) return;
    try {
      await tripsAPI.startPrioritySearch(tripId);
      // socket will fire 'priority-search-started' event
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start priority search');
    }
  };

  // ── Cancel trip and go home ───────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert('Cancel Search', 'Are you sure you want to cancel?', [
      { text: 'Keep Searching', style: 'cancel' },
      {
        text: 'Cancel', style: 'destructive', onPress: async () => {
          if (tripId) {
            try {
              await (tripsAPI as any).cancelTrip?.(tripId);
            } catch {}
          }
          if (tripId) socketManager.unsubscribeFromTrip(tripId);
          router.replace('/(tabs)/home');
        },
      },
    ]);
  };

  const SEARCH_TOTAL_SECS = 94; // 4s grace + 90s search
  const progress = Math.min((elapsed / SEARCH_TOTAL_SECS) * 100, 100);
  const ringColor = phase === 'priority-searching' ? '#F59E0B' : '#4CAF50';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Map */}
      {pickupLocation ? (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
        >
          <Marker coordinate={{ latitude: pickupLocation.latitude, longitude: pickupLocation.longitude }} pinColor="#2E7D32" title="Pickup" />
          {dropLocation && <Marker coordinate={{ latitude: dropLocation.latitude, longitude: dropLocation.longitude }} pinColor="#E65100" title="Drop" />}
        </MapView>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1B5E20' }]} />
      )}
      <View style={s.mapOverlay} />

      {/* Top bar */}
      <SafeAreaView style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} onPress={handleCancel}>
          <Icon name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle}>
          {phase === 'priority-searching' ? '⭐ Priority Search' : 'Finding Drivers'}
        </Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Center animation */}
      <View style={s.centerWrap}>
        {(phase === 'searching' || phase === 'offer' || phase === 'priority-searching') && (
          <View style={s.sonarWrap}>
            <SonarRing delay={0}    color={ringColor} />
            <SonarRing delay={600}  color={ringColor} />
            <SonarRing delay={1200} color={ringColor} />
            <Animated.View style={[s.truckCircle, { backgroundColor: phase === 'priority-searching' ? '#D97706' : '#2E7D32', transform: [{ translateY: iconBounce }] }]}>
              <Icon name="local-shipping" size={36} color="#fff" />
            </Animated.View>
          </View>
        )}
        {phase === 'no-drivers' && (
          <View style={s.noDriverCircle}>
            <Icon name="location-searching" size={38} color="#fff" />
          </View>
        )}
        {phase === 'exhausted' && (
          <View style={[s.noDriverCircle, { borderColor: '#EF4444' }]}>
            <Icon name="directions-car-filled" size={38} color="#fff" />
            <View style={s.noDriverBadge}><Icon name="close" size={14} color="#fff" /></View>
          </View>
        )}
      </View>

      {/* Bottom card */}
      <Animated.View style={[s.card, { paddingBottom: insets.bottom + 16, transform: [{ translateY: cardSlide }], opacity: cardOpacity }]}>

        {/* ── SEARCHING ── */}
        {(phase === 'searching' || phase === 'priority-searching') && (
          <>
            <Text style={[s.cardTitle, phase === 'priority-searching' && { color: '#D97706' }]}>
              {phase === 'priority-searching' ? '⭐ Priority Search Active' : 'Searching for drivers...'}
            </Text>
            <Text style={s.cardSub}>{waveMsg}</Text>

            {/* Route */}
            <View style={s.routeRow}>
              <View style={s.routePoint}>
                <View style={s.dotGreen} />
                <Text style={s.routeAddr} numberOfLines={1}>{pickupLocation?.address || 'Pickup'}</Text>
              </View>
              <Icon name="arrow-forward" size={14} color="#aaa" style={{ marginHorizontal: 6 }} />
              <View style={s.routePoint}>
                <View style={s.dotOrange} />
                <Text style={s.routeAddr} numberOfLines={1}>{dropLocation?.address || 'Drop'}</Text>
              </View>
            </View>

            {/* Wave indicator */}
            <View style={s.waveRow}>
              {[1, 2, 3, 4].map(w => (
                <View key={w} style={[s.waveDot, waveNum >= w && (phase === 'priority-searching' ? s.waveDotActivePriority : s.waveDotActive)]} />
              ))}
              <View style={s.waveSep} />
              {[5, 6, 7, 8].map(w => (
                <View key={w} style={[s.waveDot, waveNum >= w && s.waveDotActivePriority]} />
              ))}
            </View>
            <Text style={s.waveLabel}>
              Wave {waveNum || 1} of 8 · {phase === 'priority-searching' ? '10-20km range' : '0-10km range'}
            </Text>

            {/* Progress */}
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: phase === 'priority-searching' ? '#D97706' : '#4CAF50' }]} />
              </View>
              <View style={s.progressMeta}>
                <Text style={s.progressLabel}>Scanning area...</Text>
                <Text style={s.progressTimer}>{elapsed}s</Text>
              </View>
            </View>

            <View style={s.dotsRow}>
              {[0, 1, 2, 3].map(i => <BounceDot key={i} delay={i * 150} />)}
            </View>
          </>
        )}

        {/* ── DRIVER OFFER ── */}
        {phase === 'offer' && driverOffer && (
          <>
            <Text style={s.cardTitle}>Driver Made an Offer</Text>
            <Text style={s.cardSub}>Review the offer and decide</Text>

            <View style={s.offerCard}>
              <View style={s.offerDriverRow}>
                <View style={s.offerAvatar}>
                  <Text style={s.offerAvatarTxt}>{driverOffer.driver?.name?.charAt(0)?.toUpperCase() || 'D'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.offerDriverName}>{driverOffer.driver?.name || 'Driver'}</Text>
                  <Text style={s.offerDriverSub}>{driverOffer.driver?.vehicleType} · {driverOffer.driver?.vehicleNumber}</Text>
                </View>
              </View>

              <View style={s.offerPriceRow}>
                <View style={s.offerPriceBlock}>
                  <Text style={s.offerPriceLbl}>Original</Text>
                  <Text style={s.offerPriceOld}>₹{driverOffer.originalFare}</Text>
                </View>
                <Icon name="arrow-forward" size={20} color="#9CA3AF" />
                <View style={s.offerPriceBlock}>
                  <Text style={s.offerPriceLbl}>Offer</Text>
                  <Text style={s.offerPriceNew}>₹{driverOffer.offerAmount}</Text>
                </View>
              </View>

              <View style={s.offerActions}>
                <TouchableOpacity
                  style={[s.offerBtn, s.offerBtnReject]}
                  onPress={handleOfferReject}
                  disabled={respondingOffer}
                >
                  <Icon name="close" size={18} color="#EF4444" />
                  <Text style={s.offerBtnRejectTxt}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.offerBtn, s.offerBtnAccept]}
                  onPress={handleOfferAccept}
                  disabled={respondingOffer}
                >
                  <Icon name="check" size={18} color="#fff" />
                  <Text style={s.offerBtnAcceptTxt}>Accept ₹{driverOffer.offerAmount}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.offerNote}>You can also wait — another driver may accept at original price</Text>
            </View>
          </>
        )}

        {/* ── NO DRIVERS — Priority search prompt ── */}
        {phase === 'no-drivers' && (
          <>
            <Text style={s.cardTitle}>No Nearby Drivers</Text>
            <Text style={s.cardSub}>No drivers found within 10km right now.</Text>

            <View style={s.priorityBox}>
              <Icon name="star" size={22} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={s.priorityTitle}>Start Priority Search?</Text>
                <Text style={s.prioritySub}>Search up to 20km for a driver. Driver may take longer to arrive.</Text>
              </View>
            </View>

            <TouchableOpacity style={s.priorityBtn} onPress={handlePrioritySearch} activeOpacity={0.85}>
              <Icon name="search" size={18} color="#fff" />
              <Text style={s.priorityBtnTxt}>Yes, Search Further (up to 20km)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.homeBtn}
              onPress={async () => {
                // Customer chose not to search now — cancel the trip and clear local state
                if (tripIdRef.current) {
                  try { await (tripsAPI as any).cancelTrip?.(tripIdRef.current); } catch {}
                  socketManager.unsubscribeFromTrip(tripIdRef.current);
                }
                clearActiveTrip();
                router.replace('/(tabs)/home');
              }}
              activeOpacity={0.8}
            >
              <Icon name="home" size={16} color="#555" />
              <Text style={s.homeBtnTxt}>Try Later</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── EXHAUSTED — Final no drivers ── */}
        {phase === 'exhausted' && (
          <>
            <Text style={s.cardTitle}>No Drivers Available</Text>
            <Text style={s.cardSub}>No drivers found up to 20km on this route right now.</Text>

            <View style={s.infoBox}>
              <Icon name="schedule" size={16} color="#1565C0" />
              <Text style={s.infoTxt}>Drivers are on other routes. Please try again after some time.</Text>
            </View>

            <TouchableOpacity
              style={s.retryBtn}
              onPress={async () => {
                if (tripIdRef.current) {
                  try { await (tripsAPI as any).cancelTrip?.(tripIdRef.current); } catch {}
                  socketManager.unsubscribeFromTrip(tripIdRef.current);
                }
                clearActiveTrip();
                router.replace('/(tabs)/home');
              }}
              activeOpacity={0.85}
            >
              <Icon name="home" size={18} color="#fff" />
              <Text style={s.retryBtnTxt}>Go to Home</Text>
            </TouchableOpacity>
          </>
        )}

      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  mapOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sonarWrap:  { width: 130, height: 130, justifyContent: 'center', alignItems: 'center' },
  sonarRing:  { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2 },
  truckCircle:{ width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  noDriverCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  noDriverBadge: { position: 'absolute', bottom: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center' },

  card: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 22, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 16 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 4 },
  cardSub:   { fontSize: 13, color: '#888', marginBottom: 14, lineHeight: 18 },

  routeRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderRadius: 12, padding: 12, marginBottom: 14 },
  routePoint: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotGreen:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2E7D32' },
  dotOrange:  { width: 10, height: 10, borderRadius: 3, backgroundColor: '#E65100' },
  routeAddr:  { flex: 1, fontSize: 12, color: '#555', fontWeight: '500' },

  // Wave dots
  waveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  waveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5E7EB' },
  waveDotActive: { backgroundColor: '#4CAF50' },
  waveDotActivePriority: { backgroundColor: '#D97706' },
  waveSep: { width: 8, height: 2, backgroundColor: '#E5E7EB', borderRadius: 1 },
  waveLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 12 },

  progressWrap:  { marginBottom: 14 },
  progressTrack: { height: 6, backgroundColor: '#ECECEC', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: 6, borderRadius: 3 },
  progressMeta:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 11, color: '#aaa' },
  progressTimer: { fontSize: 11, color: '#aaa', fontWeight: '600' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 4 },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },

  // Offer card
  offerCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 8 },
  offerDriverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  offerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  offerAvatarTxt: { fontSize: 18, fontWeight: '800', color: '#fff' },
  offerDriverName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  offerDriverSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  offerPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  offerPriceBlock: { alignItems: 'center' },
  offerPriceLbl: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  offerPriceOld: { fontSize: 20, fontWeight: '700', color: '#9CA3AF', textDecorationLine: 'line-through' },
  offerPriceNew: { fontSize: 28, fontWeight: '900', color: '#16A34A' },
  offerActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  offerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  offerBtnReject: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FECACA' },
  offerBtnAccept: { backgroundColor: '#16A34A' },
  offerBtnRejectTxt: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  offerBtnAcceptTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  offerNote: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },

  // Priority search
  priorityBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  priorityTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  prioritySub:   { fontSize: 12, color: '#B45309', lineHeight: 17 },
  priorityBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#D97706', borderRadius: 14, paddingVertical: 15, marginBottom: 10 },
  priorityBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // No drivers / exhausted
  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, marginBottom: 16 },
  infoTxt:  { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 17 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', borderRadius: 14, paddingVertical: 15, marginBottom: 10 },
  retryBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  homeBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  homeBtnTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
});
