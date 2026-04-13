import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import React from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vehiclesAPI } from '../services/vehiclesAPI';
import { tripsAPI } from '../services/tripsAPI';
import { useTrip } from '../contexts/TripContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';

const { width, height } = Dimensions.get('window');
const TOTAL_WAIT = 300; // 5 minutes

interface Driver {
  driverId: string;
  driverName: string;
  driverPhone: string;
  profilePhoto?: string;
  vehicleType: string;
  vehicleNumber: string;
  rating: number;
  totalTrips: number;
  distance: number;
  estimatedArrivalTime: number;
  costPerKm: number;
  fixedPrice?: number;
  currentLocation: { latitude: number; longitude: number; address: string } | null;
}

const VEHICLE_ICONS: Record<string, string> = {
  'Pickup': '🛻', 'Tata Ace': '🚐', 'Bolero Pickup': '🚙',
  'Eicher Mini': '🚛', 'Tempo': '🚚', 'Mini Truck': '🚛', 'Truck': '🚛',
};
const getVehicleIcon = (t: string) => VEHICLE_ICONS[t] || '🚚';

// ── Sonar ring ────────────────────────────────────────────────────────────────
function SonarRing({ delay, color }: { delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 3.2] });
  const opacity = anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.5, 0] });
  return (
    <Animated.View pointerEvents="none"
      style={[sr.ring, { borderColor: color, opacity, transform: [{ scale }] }]} />
  );
}

// ── Circular progress timer ───────────────────────────────────────────────────
function CircleTimer({ remaining, total }: { remaining: number; total: number }) {
  const R = 48, STROKE = 6;
  const pct = remaining / total;
  // Simulate arc with a rotating half-disc trick using two views
  const deg = (1 - pct) * 360;
  const color = remaining > 60 ? '#2E7D32' : remaining > 20 ? '#FF8F00' : '#C62828';
  return (
    <View style={ct.wrap}>
      {/* Track circle */}
      <View style={[ct.track, { borderColor: '#E0E0E0', borderWidth: STROKE, borderRadius: R, width: R * 2, height: R * 2 }]} />
      {/* Progress arc — simulated with clip */}
      <View style={[ct.prog, { borderColor: color, borderWidth: STROKE, borderRadius: R, width: R * 2, height: R * 2,
        transform: [{ rotate: `${-90 + deg}deg` }], opacity: 0.15 + pct * 0.85 }]} />
      <View style={ct.center}>
        <Text style={[ct.time, { color }]}>{Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, '0')}</Text>
        <Text style={ct.label}>left</Text>
      </View>
    </View>
  );
}

// ── Driver card (list) ────────────────────────────────────────────────────────
function DriverCard({ driver, index, selected, onPress, userBudget }: {
  driver: Driver; index: number; selected: boolean; onPress: () => void; userBudget: number | null;
}) {
  const slide = useRef(new Animated.Value(50)).current;
  const fade  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 320, delay: index * 70, useNativeDriver: true }),
      Animated.timing(fade,  { toValue: 1, duration: 320, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  const price = userBudget && userBudget > 0
    ? userBudget
    : Math.round(100 + (driver.distance < 9999 ? driver.distance : 0) * (driver.costPerKm || 10));
  const dist = driver.distance >= 9999 ? null : driver.distance;
  const isBest    = index === 0;
  const isNearest = !isBest && dist !== null && dist < 5;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}
        style={[dc.card, selected && dc.cardSel]}>

        {/* Badges */}
        {(isBest || isNearest || selected) && (
          <View style={dc.badgeRow}>
            {isBest    && <View style={[dc.badge, { backgroundColor: '#E65100' }]}><Text style={dc.badgeTxt}>⭐ Best Match</Text></View>}
            {isNearest && <View style={[dc.badge, { backgroundColor: '#1565C0' }]}><Text style={dc.badgeTxt}>📍 Nearest</Text></View>}
            {selected  && <View style={[dc.badge, { backgroundColor: '#2E7D32' }]}><Icon name="check-circle" size={12} color="#fff" /><Text style={dc.badgeTxt}> Selected</Text></View>}
          </View>
        )}

        <View style={dc.body}>
          {/* Avatar */}
          <View style={[dc.avatar, selected && dc.avatarSel]}>
            {driver.profilePhoto
              ? <Image source={{ uri: driver.profilePhoto }} style={dc.avatarImg} />
              : <Text style={dc.avatarTxt}>{driver.driverName.charAt(0).toUpperCase()}</Text>}
          </View>

          {/* Info */}
          <View style={dc.info}>
            <Text style={dc.name} numberOfLines={1}>{driver.driverName}</Text>
            <View style={dc.stars}>
              {[1,2,3,4,5].map(i =>
                <Icon key={i} name={i <= Math.round(driver.rating) ? 'star' : 'star-border'} size={13} color="#FFB300" />)}
              <Text style={dc.ratingNum}>{driver.rating.toFixed(1)}</Text>
              <Text style={dc.trips}>• {driver.totalTrips} trips</Text>
            </View>
            <View style={dc.vehRow}>
              <Text style={dc.vehIcon}>{getVehicleIcon(driver.vehicleType)}</Text>
              <Text style={dc.vehType}>{driver.vehicleType}</Text>
              <View style={dc.numPill}><Text style={dc.numTxt}>{driver.vehicleNumber}</Text></View>
            </View>
          </View>

          {/* Price */}
          <View style={dc.priceCol}>
            <Text style={dc.priceLabel}>Budget</Text>
            <Text style={dc.price}>₹{price}</Text>
            <Text style={dc.perKm}>₹{driver.costPerKm}/km</Text>
          </View>
        </View>

        <View style={dc.divider} />

        {/* Chips */}
        <View style={dc.chips}>
          <View style={dc.chip}>
            <Icon name="location-on" size={13} color="#2E7D32" />
            <Text style={[dc.chipTxt, { color: '#2E7D32' }]}>
              {dist !== null ? `${dist.toFixed(1)} km` : 'Locating…'}
            </Text>
          </View>
          {driver.estimatedArrivalTime !== null && (
            <View style={[dc.chip, { backgroundColor: '#FFF3E0' }]}>
              <Icon name="schedule" size={13} color="#E65100" />
              <Text style={[dc.chipTxt, { color: '#E65100' }]}>{driver.estimatedArrivalTime} min ETA</Text>
            </View>
          )}
          <View style={[dc.chip, { backgroundColor: '#E3F2FD' }]}>
            <Icon name="verified-user" size={13} color="#1565C0" />
            <Text style={[dc.chipTxt, { color: '#1565C0' }]}>Verified</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Full-screen waiting experience ────────────────────────────────────────────
function WaitingScreen({
  visible, driver, pickupLocation, dropLocation,
  timeRemaining, tripAccepted, tripCancelled, cancelledByDriver, successTripId,
  onClose, onCancel, onNegotiate, onTrack, onMyTrips, onFindAnotherDriver,
}: {
  visible: boolean; driver: Driver | null;
  pickupLocation: any; dropLocation: any;
  timeRemaining: number; tripAccepted: boolean; tripCancelled: boolean; cancelledByDriver: boolean; successTripId: string | null;
  onClose: () => void; onCancel: () => void; onNegotiate: () => void; onTrack: () => void; onMyTrips: () => void; onFindAnotherDriver: () => void;
}) {
  const insets = useSafeAreaInsets();

  // slide-up card
  const cardY   = useRef(new Animated.Value(300)).current;
  const cardOp  = useRef(new Animated.Value(0)).current;
  // checkmark scale
  const checkSc = useRef(new Animated.Value(0)).current;
  // truck bounce
  const truckY  = useRef(new Animated.Value(0)).current;
  // background pulse for rings
  const bgPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { cardY.setValue(300); cardOp.setValue(0); checkSc.setValue(0); return; }
    // slide card up
    Animated.parallel([
      Animated.spring(cardY,  { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      Animated.timing(cardOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  // truck bounce loop while waiting
  useEffect(() => {
    if (!visible || tripAccepted || tripCancelled) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(truckY, { toValue: -12, duration: 500, useNativeDriver: true }),
      Animated.timing(truckY, { toValue: 0,   duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, tripAccepted, tripCancelled]);

  // success pop
  useEffect(() => {
    if (tripAccepted || tripCancelled) {
      Animated.spring(checkSc, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();
    }
  }, [tripAccepted, tripCancelled]);

  if (!visible) return null;

  const status = tripAccepted ? 'accepted' : tripCancelled ? 'cancelled' : 'waiting';

  return (
    <Modal visible={visible} transparent={false} animationType="slide" statusBarTranslucent>
      <View style={ws.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0D3B0D" />

        {/* ── Dark green top section ── */}
        <View style={[ws.top, { paddingTop: insets.top + 12 }]}>

          {/* Close button */}
          <TouchableOpacity onPress={onClose} style={ws.closeBtn}>
            <Icon name="close" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {/* Status heading */}
          <Text style={ws.statusLabel}>
            {status === 'waiting'   ? 'Request Sent' :
             status === 'accepted'  ? 'Driver Accepted! 🎉' : 'No Response'}
          </Text>
          <Text style={ws.statusSub}>
            {status === 'waiting'   ? 'Waiting for driver to confirm…' :
             status === 'accepted'  ? 'Your driver is on the way!' :
             'The driver did not respond in time.'}
          </Text>

          {/* Sonar / celebration centre */}
          <View style={ws.sonarWrap}>
            {status === 'waiting' && (
              <>
                <SonarRing delay={0}    color="rgba(255,255,255,0.6)" />
                <SonarRing delay={700}  color="rgba(255,255,255,0.4)" />
                <SonarRing delay={1400} color="rgba(255,255,255,0.25)" />
              </>
            )}

            {/* Centre icon */}
            {status === 'waiting' && (
              <Animated.View style={{ transform: [{ translateY: truckY }] }}>
                <View style={ws.truckCircle}>
                  <Text style={{ fontSize: 40 }}>{getVehicleIcon(driver?.vehicleType || 'Tempo')}</Text>
                </View>
              </Animated.View>
            )}
            {status === 'accepted' && (
              <Animated.View style={{ transform: [{ scale: checkSc }] }}>
                <View style={[ws.truckCircle, { backgroundColor: '#1B5E20' }]}>
                  <Icon name="check" size={52} color="#fff" />
                </View>
              </Animated.View>
            )}
            {status === 'cancelled' && (
              <Animated.View style={{ transform: [{ scale: checkSc }] }}>
                <View style={[ws.truckCircle, { backgroundColor: '#B71C1C' }]}>
                  <Icon name={cancelledByDriver ? 'person-off' : 'close'} size={52} color="#fff" />
                </View>
              </Animated.View>
            )}
          </View>

          {/* Timer (waiting only) */}
          {status === 'waiting' && (
            <View style={ws.timerWrap}>
              <CircleTimer remaining={timeRemaining} total={TOTAL_WAIT} />
            </View>
          )}
        </View>

        {/* ── Slide-up white card ── */}
        <Animated.View style={[ws.card, { opacity: cardOp, transform: [{ translateY: cardY }], paddingBottom: insets.bottom + 20 }]}>

          {/* Driver info */}
          {driver && (
            <View style={ws.driverRow}>
              <View style={ws.driverAvatar}>
                {driver.profilePhoto
                  ? <Image source={{ uri: driver.profilePhoto }} style={ws.driverAvatarImg} />
                  : <Text style={ws.driverAvatarTxt}>{driver.driverName.charAt(0).toUpperCase()}</Text>}
                {/* Online dot */}
                <View style={ws.onlineDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ws.driverName}>{driver.driverName}</Text>
                <Text style={ws.driverVeh}>{getVehicleIcon(driver.vehicleType)} {driver.vehicleType} • {driver.vehicleNumber}</Text>
                <View style={ws.starsRow}>
                  {[1,2,3,4,5].map(i =>
                    <Icon key={i} name={i <= Math.round(driver.rating) ? 'star' : 'star-border'} size={13} color="#FFB300" />)}
                  <Text style={ws.ratingNum}>{driver.rating.toFixed(1)}</Text>
                </View>
              </View>
              <View style={ws.budgetPill}>
                <Text style={ws.budgetAmt}>₹{driver.fixedPrice}</Text>
                <Text style={ws.budgetLbl}>budget</Text>
              </View>
            </View>
          )}

          {/* Route */}
          {pickupLocation && dropLocation && (
            <View style={ws.routeBox}>
              <View style={ws.routeRow}>
                <View style={[ws.routeDot, { backgroundColor: '#2E7D32' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={ws.routeTag}>PICKUP</Text>
                  <Text style={ws.routeAddr} numberOfLines={2}>{pickupLocation.address || 'Pickup location'}</Text>
                </View>
              </View>
              <View style={ws.routeLine} />
              <View style={ws.routeRow}>
                <View style={[ws.routeDot, { backgroundColor: '#E65100' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={ws.routeTag}>DROP</Text>
                  <Text style={ws.routeAddr} numberOfLines={2}>{dropLocation.address || 'Drop location'}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Status message bar */}
          <View style={[ws.statusBar,
            status === 'accepted'  ? { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' } :
            status === 'cancelled' ? { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' } :
                                     { backgroundColor: '#FFF8E1', borderColor: '#FFE082' }]}>
            <Icon
              name={status === 'accepted' ? 'check-circle' : status === 'cancelled' ? 'cancel' : 'access-time'}
              size={18}
              color={status === 'accepted' ? '#2E7D32' : status === 'cancelled' ? '#C62828' : '#FF8F00'}
            />
            <Text style={[ws.statusBarTxt,
              { color: status === 'accepted' ? '#1B5E20' : status === 'cancelled' ? '#B71C1C' : '#E65100' }]}>
              {status === 'accepted'  ? 'Driver is on the way to your pickup!' :
               status === 'cancelled' ? (cancelledByDriver ? 'Driver cancelled the trip.' : 'No driver responded. Please try another.') :
               `Driver has ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s to respond`}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={ws.btnGroup}>
            {status === 'waiting' && successTripId && (
              <TouchableOpacity style={[ws.btn, ws.btnCancel]} onPress={onCancel}>
                <Icon name="cancel" size={18} color="#C62828" />
                <Text style={[ws.btnTxt, { color: '#C62828' }]}>Cancel Trip</Text>
              </TouchableOpacity>
            )}
            {status === 'accepted' && successTripId && (
              <TouchableOpacity style={[ws.btn, ws.btnGreen, { flex: 1 }]} onPress={onTrack}>
                <Icon name="my-location" size={20} color="#fff" />
                <Text style={ws.btnTxt}>Track Your Trip</Text>
              </TouchableOpacity>
            )}
            {status === 'cancelled' && (
              <>
                <TouchableOpacity
                  style={[ws.btn, ws.btnGreen, { flex: 1 }]}
                  onPress={cancelledByDriver ? onFindAnotherDriver : onClose}
                >
                  <Icon name="person-search" size={18} color="#fff" />
                  <Text style={ws.btnTxt}>{cancelledByDriver ? 'Find Another Driver' : 'Try Another Driver'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ws.btn, ws.btnGhost]} onPress={onMyTrips}>
                  <Icon name="home" size={18} color="#555" />
                  <Text style={[ws.btnTxt, { color: '#555' }]}>Go Home</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SelectDriver() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { setActiveTrip, clearActiveTrip } = useTrip();

  const [drivers, setDrivers]                   = useState<Driver[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedDriver, setSelectedDriver]     = useState<Driver | null>(null);
  const [requesting, setRequesting]             = useState(false);
  const [userEnteredAmount, setUserEnteredAmount] = useState<number | null>(null);
  const [showWaiting, setShowWaiting]           = useState(false);
  const [successTripId, setSuccessTripId]       = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining]       = useState(TOTAL_WAIT);
  const [tripAccepted, setTripAccepted]         = useState(false);
  const [tripCancelled, setTripCancelled]       = useState(false);
  const [cancelledByDriver, setCancelledByDriver] = useState(false);

  const timerRef         = useRef<NodeJS.Timeout | null>(null);
  const socketRef        = useRef<Socket | null>(null);
  const successTripIdRef = useRef<string | null>(null);

  // Keep ref in sync so timer callback can read latest value
  useEffect(() => { successTripIdRef.current = successTripId; }, [successTripId]);

  const pickupLocation = params.pickupLocation ? JSON.parse(params.pickupLocation as string) : null;
  const dropLocation   = params.dropLocation   ? JSON.parse(params.dropLocation   as string) : null;
  const tripDetails    = params.tripDetails    ? JSON.parse(params.tripDetails    as string) : null;

  const getUserAmount = () => {
    if (!tripDetails) return null;
    const v = tripDetails.estimatedFare ?? tripDetails.budget;
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) || n <= 0 ? null : n;
  };

  useEffect(() => {
    setUserEnteredAmount(getUserAmount());
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    if (!pickupLocation) return;
    setLoading(true);
    try {
      let res = await vehiclesAPI.getNearbyVehicles(pickupLocation.latitude, pickupLocation.longitude, 20) as any;
      if (!res?.ok || !res?.data?.length) {
        res = await vehiclesAPI.getNearbyVehicles(pickupLocation.latitude, pickupLocation.longitude, 500) as any;
      }
      if (res?.ok && res?.data) {
        const amount = getUserAmount();
        setDrivers(res.data.map((d: Driver) => ({
          ...d,
          fixedPrice: Math.round(
            amount && amount > 0 ? amount : 100 + (d.distance < 9999 ? d.distance : 0) * (d.costPerKm || 10)
          ),
        })));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSelectDriver = (driver: Driver) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedDriver(driver);
  };

  const handleRequestTrip = async () => {
    if (!selectedDriver || !pickupLocation || !dropLocation) { Alert.alert('Error', 'Select a driver first'); return; }
    const budget = tripDetails?.budget ? parseFloat(tripDetails.budget.toString()) : undefined;
    if (!budget || budget <= 0) { Alert.alert('Budget Required', 'Go back and enter your budget.'); return; }

    setRequesting(true);
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) { router.replace('/login'); return; }

      const response = await tripsAPI.createTrip({
        pickupLocation: { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, address: pickupLocation.address },
        dropLocation:   { latitude: dropLocation.latitude,   longitude: dropLocation.longitude,   address: dropLocation.address },
        parcelDetails: tripDetails ? { ...tripDetails, budget } : { category: 'Other Items', weight: '0', quantity: 1 },
        estimatedFare: budget,
        requestedVehicleType: selectedDriver.vehicleType,
        driverId: selectedDriver.driverId,
      });

      if (!response.ok || !response.data) {
        Alert.alert('Error', response.message || 'Failed to create trip'); setRequesting(false); return;
      }

      const tid = response.data._id;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTripId(tid);
      setTimeRemaining(TOTAL_WAIT);
      setTripAccepted(false);
      setTripCancelled(false);
      setShowWaiting(true);
      // Store in context so home screen banner shows it and back-navigation is guarded
      setActiveTrip({ _id: tid, currentTripState: 'PENDING', driverId: selectedDriver.driverId });

      // join socket room
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        const { io: ioC } = await import('socket.io-client');
        const { SOCKET_URL: SU } = await import('../lib/env');
        const s = ioC(SU, { transports: ['websocket', 'polling'], auth: { token } });
        s.on('connect', async () => {
          s.emit('join-trip', { tripId: tid });
          const uid = await AsyncStorage.getItem('userId');
          if (uid) s.emit('join-user', { userId: uid });
        });
      }

      initSocket(tid);
      startTimer();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to send request. Try again.');
    } finally { setRequesting(false); }
  };

  const initSocket = async (tripId: string) => {
    const token  = await AsyncStorage.getItem('userToken');
    const userId = await AsyncStorage.getItem('userId');
    if (!token || !userId) return;

    const sock = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    sock.on('connect', () => { sock.emit('join-room', `customer-${userId}`); sock.emit('join-trip', { tripId }); });

    const goTracking = (tid: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTripAccepted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => { setShowWaiting(false); router.replace({ pathname: '/trip-tracking', params: { id: tid } }); }, 2000);
    };

    sock.on('trip-accepted', (d: any) => {
      if (d.tripId?.toString() === tripId) goTracking(tripId);
    });
    const handleDriverCancel = () => {
      setTripCancelled(true);
      setCancelledByDriver(true);
      clearActiveTrip();
      if (timerRef.current) clearInterval(timerRef.current);
      Alert.alert(
        'Driver Not Available',
        'The driver is not ready for this trip. Please book another driver or try after some time.',
        [
          {
            text: 'Find Another Driver',
            onPress: () => {
              cleanupWaiting(true, false);
              router.replace({ pathname: '/searching-drivers', params: { pickupLocation: params.pickupLocation, dropLocation: params.dropLocation, tripDetails: params.tripDetails } });
            },
          },
          {
            text: 'Go Home',
            style: 'cancel',
            onPress: () => { cleanupWaiting(true, true); },
          },
        ],
        { cancelable: false },
      );
    };

    // Guard to prevent multiple offer popups
    let offerPopupShown = false;
    const showOfferPopup = (amount: number) => {
      if (offerPopupShown) return;
      offerPopupShown = true;
      Alert.alert(
        'Driver Sent an Offer 💰',
        `The driver proposed ₹${amount}.\nTap "Negotiate" to accept, reject, or counter.`,
        [
          {
            text: 'Negotiate',
            onPress: () => {
              cleanupWaiting(false, false);
              router.replace({ pathname: '/trip-negotiation', params: { tripId } });
            },
          },
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => { offerPopupShown = false; }, // allow re-show on next offer
          },
        ],
      );
    };

    // Driver sent a price offer → show popup and navigate to negotiation
    sock.on('new-offer', (d: any) => {
      const offerTripId = d.tripId?.toString() || d.offer?.tripId?.toString();
      if (offerTripId !== tripId) return;
      const offer = d.offer || d;
      if (offer.userType !== 'driver') return;
      showOfferPopup(offer.amount ?? d.amount);
    });

    // Backup: driver-offer-received is also emitted to customer room
    sock.on('driver-offer-received', (d: any) => {
      if (d.tripId?.toString() !== tripId) return;
      showOfferPopup(d.amount);
    });

    sock.on('trip-cancelled', (d: any) => {
      if (d.tripId?.toString() === tripId) {
        if (d.cancelledBy === 'driver') {
          handleDriverCancel();
        } else if (d.cancelledBy !== 'customer') {
          // System/other cancel
          setTripCancelled(true);
          clearActiveTrip();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }
    });

    const handleTripStateChange = (d: any) => {
      const matchTripId = d.tripId?.toString() === tripId || d._id?.toString() === tripId;
      if (!matchTripId) return;
      const state = d.currentTripState || d.status || d.state || '';
      if (state === 'ACCEPTED') goTracking(tripId);
      else if (state === 'NEGOTIATING') {
        // Driver sent a price offer — check for it and show popup
        if (d.offer && d.offer.userType === 'driver') {
          showOfferPopup(d.offer.amount);
        } else {
          import('../services/offersAPI').then(({ offersAPI: oAPI }) => {
            oAPI.getTripOffers(tripId).then((res: any) => {
              if (res?.ok && Array.isArray(res?.data)) {
                const driverOffer = (res.data as any[]).find((o: any) => o.userType === 'driver' && o.status === 'PENDING');
                if (driverOffer) showOfferPopup(driverOffer.amount);
              }
            }).catch(() => {});
          });
        }
      } else if (state === 'DRIVER_CANCELLED') {
        handleDriverCancel();
      } else if (['CANCELLED', 'CUSTOMER_CANCELLED', 'REJECTED'].includes(state)) {
        setTripCancelled(true);
        clearActiveTrip();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    sock.on('trip-updated', handleTripStateChange);
    sock.on('trip-state-updated', handleTripStateChange);
    socketRef.current = sock;

    // Polling fallback: check trip status every 5 seconds while waiting
    const pollInterval = setInterval(async () => {
      try {
        const { tripsAPI: tAPI } = await import('../services/tripsAPI');
        const res = await tAPI.getTrip(tripId) as any;
        if (res?.ok && res?.data) {
          const st = res.data.currentTripState;
          if (st === 'ACCEPTED') { clearInterval(pollInterval); goTracking(tripId); }
          else if (st === 'NEGOTIATING') {
            // Driver sent an offer — fetch offers and show popup
            const { offersAPI: oAPI } = await import('../services/offersAPI');
            const oRes = await oAPI.getTripOffers(tripId) as any;
            if (oRes?.ok && Array.isArray(oRes?.data)) {
              const driverOffer = (oRes.data as any[]).find((o: any) => o.userType === 'driver' && o.status === 'PENDING');
              if (driverOffer) showOfferPopup(driverOffer.amount);
            }
          } else if (st === 'DRIVER_CANCELLED') {
            clearInterval(pollInterval);
            handleDriverCancel();
          } else if (['CANCELLED','CUSTOMER_CANCELLED','REJECTED'].includes(st)) {
            clearInterval(pollInterval);
            setTripCancelled(true);
            clearActiveTrip();
            if (timerRef.current) clearInterval(timerRef.current);
          }
        }
      } catch {}
    }, 5000);
    // Attach cleanup of poll to socket disconnect
    sock.on('disconnect', () => clearInterval(pollInterval));
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeRemaining(p => {
        if (p <= 1) {
          // Use ref to avoid stale closure on successTripId
          if (successTripIdRef.current) {
            tripsAPI.updateTripState(successTripIdRef.current, 'CUSTOMER_CANCELLED').catch((e) => console.error('Timer cancel failed:', e));
          }
          setTripCancelled(true);
          clearActiveTrip();
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  };

  // clearTrip=true removes from context; goHome=true navigates to home after cleanup
  const cleanupWaiting = (clearTrip = true, goHome = false) => {
    setShowWaiting(false);
    setSuccessTripId(null);
    setTripAccepted(false);
    setTripCancelled(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    if (clearTrip) clearActiveTrip();
    if (goHome) router.replace('/(tabs)/home');
  };

  const closeWaiting = () => {
    // Trip accepted — just close the modal, tracking screen already opened
    if (tripAccepted) {
      setShowWaiting(false);
      return;
    }
    // Trip cancelled — if driver cancelled offer to find another, else go home
    if (tripCancelled) {
      if (cancelledByDriver) {
        Alert.alert(
          'Driver Cancelled',
          'Would you like to find another driver?',
          [
            { text: 'Find Another Driver', onPress: () => {
                cleanupWaiting(true, false);
                router.replace({ pathname: '/searching-drivers', params: { pickupLocation: params.pickupLocation, dropLocation: params.dropLocation, tripDetails: params.tripDetails } });
              },
            },
            { text: 'Go Home', style: 'cancel', onPress: () => cleanupWaiting(true, true) },
          ],
          { cancelable: false },
        );
      } else {
        cleanupWaiting(true, true);
      }
      return;
    }
    // Trip still pending — ask before cancelling
    if (successTripId) {
      Alert.alert(
        'Cancel Trip Request?',
        'Do you want to cancel this trip request?',
        [
          { text: 'No, Keep Waiting', style: 'cancel' },
          {
            text: 'Yes, Cancel',
            style: 'destructive',
            onPress: async () => {
              await tripsAPI.updateTripState(successTripId, 'CUSTOMER_CANCELLED').catch((e) => console.error('Cancel failed:', e));
              cleanupWaiting(true, true); // go home after cancel
            },
          },
        ]
      );
    } else {
      cleanupWaiting(false, false);
    }
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (socketRef.current) socketRef.current.disconnect();
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[sc.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <View style={sc.header}>
        <TouchableOpacity onPress={() => router.back()} style={sc.headerBtn}>
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={sc.headerTitle}>Choose Driver</Text>
          <Text style={sc.headerSub}>{drivers.length} available near you</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (successTripId && !tripAccepted && !tripCancelled) {
              Alert.alert(
                'Cancel Trip Request?',
                'Do you want to cancel the current trip request?',
                [
                  { text: 'No', style: 'cancel' },
                  {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                      await tripsAPI.updateTripState(successTripId, 'CUSTOMER_CANCELLED').catch((e) => console.error('Cancel failed:', e));
                      cleanupWaiting(true, true); // go home after cancel
                    },
                  },
                ]
              );
            } else {
              loadDrivers();
            }
          }}
          style={sc.headerBtn}
        >
          <Icon name={successTripId && !tripAccepted && !tripCancelled ? 'cancel' : 'refresh'} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Route bar */}
      {pickupLocation && dropLocation && (
        <View style={sc.routeBar}>
          <View style={[sc.routeDot, { backgroundColor: '#2E7D32' }]} />
          <Text style={sc.routeAddr} numberOfLines={1}>{pickupLocation.address || 'Pickup'}</Text>
          <Icon name="arrow-forward" size={14} color="#aaa" style={{ marginHorizontal: 4 }} />
          <View style={[sc.routeDot, { backgroundColor: '#E65100' }]} />
          <Text style={sc.routeAddr} numberOfLines={1}>{dropLocation.address || 'Drop'}</Text>
        </View>
      )}

      {/* Budget bar */}
      {userEnteredAmount && (
        <View style={sc.budgetBar}>
          <Icon name="currency-rupee" size={14} color="#2E7D32" />
          <Text style={sc.budgetTxt}>Your budget: ₹{userEnteredAmount}</Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={sc.center}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={sc.loadTxt}>Finding drivers near pickup…</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={sc.center}>
          <Text style={{ fontSize: 56 }}>🚚</Text>
          <Text style={sc.emptyTitle}>No Drivers Found</Text>
          <Text style={sc.emptySub}>No online drivers in your area right now</Text>
          <TouchableOpacity onPress={loadDrivers} style={sc.retryBtn}>
            <Icon name="refresh" size={18} color="#fff" />
            <Text style={sc.retryTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140 }}
        >
          {drivers.map((d, i) => (
            <DriverCard key={d.driverId} driver={d} index={i}
              selected={selectedDriver?.driverId === d.driverId}
              onPress={() => handleSelectDriver(d)}
              userBudget={userEnteredAmount} />
          ))}
        </ScrollView>
      )}

      {/* Footer */}
      {selectedDriver && (
        <View style={[sc.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={sc.footerRow}>
            <View style={sc.footerAvatar}>
              {selectedDriver.profilePhoto
                ? <Image source={{ uri: selectedDriver.profilePhoto }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                : <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{selectedDriver.driverName.charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sc.footerName} numberOfLines={1}>{selectedDriver.driverName}</Text>
              <Text style={sc.footerVeh}>{getVehicleIcon(selectedDriver.vehicleType)} {selectedDriver.vehicleType} • {selectedDriver.vehicleNumber}</Text>
            </View>
            <View>
              <Text style={sc.footerPrice}>₹{selectedDriver.fixedPrice}</Text>
              <Text style={sc.footerPriceLbl}>budget</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[sc.sendBtn, requesting && { opacity: 0.7 }]}
            onPress={handleRequestTrip} disabled={requesting} activeOpacity={0.85}
          >
            {requesting
              ? <ActivityIndicator color="#fff" />
              : <><Icon name="send" size={20} color="#fff" /><Text style={sc.sendTxt}>Send Request to Driver</Text></>}
          </TouchableOpacity>
        </View>
      )}

      {/* Full-screen waiting overlay */}
      <WaitingScreen
        visible={showWaiting}
        driver={selectedDriver}
        pickupLocation={pickupLocation}
        dropLocation={dropLocation}
        timeRemaining={timeRemaining}
        tripAccepted={tripAccepted}
        tripCancelled={tripCancelled}
        cancelledByDriver={cancelledByDriver}
        successTripId={successTripId}
        onClose={closeWaiting}
        onCancel={closeWaiting}
        onNegotiate={() => { if (successTripId) { cleanupWaiting(false); router.push({ pathname: '/trip-negotiation', params: { tripId: successTripId } }); } }}
        onTrack={() => { if (successTripId) { cleanupWaiting(false); router.push({ pathname: '/trip-tracking', params: { id: successTripId } }); } }}
        onMyTrips={() => { cleanupWaiting(true, true); }}
        onFindAnotherDriver={() => {
          cleanupWaiting(true, false);
          router.replace({ pathname: '/searching-drivers', params: { pickupLocation: params.pickupLocation, dropLocation: params.dropLocation, tripDetails: params.tripDetails } });
        }}
      />
    </View>
  );
}

// ── StyleSheets ───────────────────────────────────────────────────────────────

// sonar ring
const sr = StyleSheet.create({
  ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
});

// circle timer
const ct = StyleSheet.create({
  wrap:  { width: 96, height: 96, justifyContent: 'center', alignItems: 'center' },
  track: { position: 'absolute' },
  prog:  { position: 'absolute', borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  center:{ position: 'absolute', alignItems: 'center' },
  time:  { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 10, color: '#aaa', marginTop: -2 },
});

// driver card
const dc = StyleSheet.create({
  card:    { backgroundColor: '#fff', borderRadius: 20, marginBottom: 14, borderWidth: 2, borderColor: '#E8E8E8', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4, overflow: 'hidden' },
  cardSel: { borderColor: '#2E7D32', shadowColor: '#2E7D32', shadowOpacity: 0.2, shadowRadius: 14, elevation: 8 },
  badgeRow:{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 10 },
  badge:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTxt:{ color: '#fff', fontSize: 11, fontWeight: '700' },
  body:    { flexDirection: 'row', alignItems: 'flex-start', padding: 14, paddingTop: 10 },
  avatar:  { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 2, borderColor: '#C8E6C9', overflow: 'hidden' },
  avatarSel:{ borderColor: '#2E7D32', borderWidth: 3 },
  avatarImg:{ width: 58, height: 58, borderRadius: 29 },
  avatarTxt:{ fontSize: 24, fontWeight: '800', color: '#fff' },
  info:    { flex: 1, paddingRight: 8 },
  name:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  stars:   { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 5 },
  ratingNum:{ fontSize: 12, color: '#FF8F00', fontWeight: '700', marginLeft: 3 },
  trips:   { fontSize: 12, color: '#999', marginLeft: 2 },
  vehRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  vehIcon: { fontSize: 15 },
  vehType: { fontSize: 13, color: '#444', fontWeight: '600' },
  numPill: { backgroundColor: '#F0F4F0', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, borderWidth: 1, borderColor: '#DDD' },
  numTxt:  { fontSize: 11, color: '#555', fontWeight: '700', letterSpacing: 0.5 },
  priceCol:{ alignItems: 'flex-end', minWidth: 66 },
  priceLabel:{ fontSize: 10, color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  price:   { fontSize: 22, fontWeight: '800', color: '#1B5E20', marginTop: 1 },
  perKm:   { fontSize: 11, color: '#aaa', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#F2F2F2', marginHorizontal: 14 },
  chips:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, flexWrap: 'wrap' },
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  chipTxt: { fontSize: 12, fontWeight: '600' },
});

// waiting screen
const ws = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0D3B0D' },
  top:           { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24, minHeight: height * 0.42 },
  closeBtn:      { alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statusLabel:   { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: 0.3 },
  statusSub:     { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  sonarWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  truckCircle:   { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  timerWrap:     { marginTop: 8 },

  card:          { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },

  driverRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18, backgroundColor: '#F8F8F8', padding: 14, borderRadius: 18 },
  driverAvatar:  { width: 60, height: 60, borderRadius: 30, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 3, borderColor: '#C8E6C9' },
  driverAvatarImg:{ width: 60, height: 60, borderRadius: 30 },
  driverAvatarTxt:{ fontSize: 24, fontWeight: '800', color: '#fff' },
  onlineDot:     { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#fff' },
  driverName:    { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  driverVeh:     { fontSize: 13, color: '#777', marginTop: 2 },
  starsRow:      { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  ratingNum:     { fontSize: 12, color: '#FF8F00', fontWeight: '700', marginLeft: 3 },
  budgetPill:    { alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  budgetAmt:     { fontSize: 20, fontWeight: '800', color: '#1B5E20' },
  budgetLbl:     { fontSize: 10, color: '#888' },

  routeBox:      { backgroundColor: '#FAFAFA', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#EEEEEE' },
  routeRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot:      { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  routeLine:     { width: 2, height: 14, backgroundColor: '#DDD', marginLeft: 5, marginVertical: 3 },
  routeTag:      { fontSize: 10, color: '#999', fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  routeAddr:     { fontSize: 14, color: '#333', fontWeight: '600', lineHeight: 19, marginTop: 1 },

  statusBar:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 16 },
  statusBarTxt:  { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  btnGroup:      { gap: 10 },
  btn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnGreen:      { backgroundColor: '#2E7D32', shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  btnOrange:     { backgroundColor: '#E65100', shadowColor: '#E65100', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  btnGhost:      { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0' },
  btnCancel:     { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#EF9A9A' },
  btnTxt:        { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// main screen
const sc = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F0F4F0' },
  header:    { backgroundColor: '#1B5E20', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  routeBar:  { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  routeDot:  { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  routeAddr: { flex: 1, fontSize: 12, color: '#444', fontWeight: '500' },
  budgetBar: { backgroundColor: '#E8F5E9', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, gap: 4 },
  budgetTxt: { fontSize: 13, color: '#2E7D32', fontWeight: '600' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  loadTxt:   { marginTop: 16, fontSize: 15, color: '#555' },
  emptyTitle:{ fontSize: 22, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySub:  { fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  retryBtn:  { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2E7D32', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  retryTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  footer:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EEE', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 16 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  footerAvatar:{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  footerName:{ fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  footerVeh: { fontSize: 12, color: '#777', marginTop: 2 },
  footerPrice:{ fontSize: 22, fontWeight: '800', color: '#1B5E20', textAlign: 'right' },
  footerPriceLbl:{ fontSize: 11, color: '#999', textAlign: 'right' },
  sendBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#2E7D32', paddingVertical: 16, borderRadius: 16, shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  sendTxt:   { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
});
