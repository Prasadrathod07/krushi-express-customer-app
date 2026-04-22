// TrackTripScreen - Live trip tracking for customer
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Linking,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
MapboxGL.setAccessToken(Constants.expoConfig?.extra?.MAPBOX_TOKEN || '');
import { useTrip } from '../contexts/TripContext';
import { tripsAPI } from '../services/tripsAPI';
import { socketManager } from '../services/socketManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRouteInfo } from '../services/directionsService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── trip state config ────────────────────────────────────────────────────────
const STATE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  ACCEPTED:            { label: 'Driver accepted your trip',   color: '#4CAF50', icon: 'check-circle'     },
  ENROUTE_TO_PICKUP:   { label: 'Driver is on the way',        color: '#2196F3', icon: 'directions-car'   },
  ARRIVED_AT_PICKUP:   { label: 'Driver arrived at pickup',    color: '#4CAF50', icon: 'location-on'      },
  PICKED_UP:           { label: 'Goods picked up',             color: '#4CAF50', icon: 'inventory'        },
  ENROUTE_TO_DELIVERY: { label: 'On the way to delivery',      color: '#FF9800', icon: 'local-shipping'   },
  ARRIVED_AT_DELIVERY: { label: 'Arrived at delivery location',color: '#4CAF50', icon: 'location-on'      },
  DELIVERING:          { label: 'Delivering your goods',       color: '#FF9800', icon: 'inventory'        },
  COMPLETED:           { label: 'Trip completed',              color: '#4CAF50', icon: 'check-circle'     },
  CANCELLED:           { label: 'Trip cancelled',              color: '#f44336', icon: 'cancel'           },
};

const isDeliveryPhase = (state: string) =>
  ['PICKED_UP', 'ENROUTE_TO_DELIVERY', 'ARRIVED_AT_DELIVERY', 'DELIVERING'].includes(state);

// ── component ─────────────────────────────────────────────────────────────────
export default function TrackTripScreen() {
  const router = useRouter();
  const { activeTrip, updateTripState } = useTrip();

  const [trip, setTrip] = useState<any>(activeTrip);
  const [loading, setLoading] = useState(true);

  // locations
  const [driverLoc, setDriverLoc] = useState<{ latitude: number; longitude: number } | null>(null);

  // route lines
  const [fullRoute, setFullRoute]     = useState<{ latitude: number; longitude: number }[]>([]); // pickup → drop
  const [driverRoute, setDriverRoute] = useState<{ latitude: number; longitude: number }[]>([]); // driver → target

  // ETA
  const [eta, setEta] = useState<number | null>(null);
  const [etaDist, setEtaDist] = useState<number | null>(null);

  const mapRef    = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const tripRef = useRef<any>(trip);
  useEffect(() => { tripRef.current = trip; }, [trip]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const getPickupLatLng = (t: any) => {
    const c = t?.pickupLocation?.coordinates;
    return c ? { latitude: c[1], longitude: c[0] } : null;
  };
  const getDropLatLng = (t: any) => {
    const loc = t?.dropLocation || t?.dropoffLocation;
    const c = loc?.coordinates;
    return c ? { latitude: c[1], longitude: c[0] } : null;
  };
  const getDriverLatLng = (t: any) => {
    const c = t?.driverCurrentLocation?.coordinates;
    return c ? { latitude: c[1], longitude: c[0] } : null;
  };

  // ── fit map ───────────────────────────────────────────────────────────────
  const fitMap = useCallback(
    (coords: { latitude: number; longitude: number }[]) => {
      if (!cameraRef.current || coords.length === 0) return;
      const lats = coords.map(c => c.latitude);
      const lngs = coords.map(c => c.longitude);
      cameraRef.current.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [120, 40, 320, 40],
        600
      );
    },
    []
  );

  // ── fetch full pickup→drop route ──────────────────────────────────────────
  const fetchFullRoute = useCallback(async (t: any) => {
    const pickup = getPickupLatLng(t);
    const drop   = getDropLatLng(t);
    if (!pickup || !drop) return;
    const info = await getRouteInfo(pickup, drop).catch(() => null);
    if (info && info.coordinates.length > 0) {
      setFullRoute(info.coordinates);
    } else {
      setFullRoute([pickup, drop]);
    }
  }, []);

  // ── fetch driver→target route ─────────────────────────────────────────────
  const fetchDriverRoute = useCallback(async (driver: { latitude: number; longitude: number }, t: any) => {
    const target = isDeliveryPhase(t?.currentTripState)
      ? getDropLatLng(t)
      : getPickupLatLng(t);
    if (!target) return;

    const info = await getRouteInfo(driver, target).catch(() => null);
    if (info && info.coordinates.length > 0) {
      setDriverRoute(info.coordinates);
      setEta(info.duration);
      setEtaDist(info.distance);
    } else {
      setDriverRoute([driver, target]);
    }
  }, []);

  // ── load trip from API ─────────────────────────────────────────────────────
  const loadTrip = useCallback(async () => {
    const id = activeTrip?._id;
    if (!id) { setLoading(false); return; }

    try {
      const res = await tripsAPI.getTrip(id);
      const data = res?.data || res;
      if (data?._id) {
        setTrip(data);
        tripRef.current = data;

        // seed driver location from trip
        const dLoc = getDriverLatLng(data);
        if (dLoc) setDriverLoc(dLoc);

        // fetch routes
        await fetchFullRoute(data);
        if (dLoc) await fetchDriverRoute(dLoc, data);

        // fit map once data is ready
        setTimeout(() => {
          const pts: { latitude: number; longitude: number }[] = [];
          const p = getPickupLatLng(data);
          const d = getDropLatLng(data);
          if (p) pts.push(p);
          if (d) pts.push(d);
          if (dLoc) pts.push(dLoc);
          fitMap(pts);
        }, 600);
      }
    } catch (err) {
      console.error('TrackTrip: loadTrip error', err);
    } finally {
      setLoading(false);
    }
  }, [activeTrip?._id, fetchFullRoute, fetchDriverRoute, fitMap]);

  // ── socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = activeTrip?._id;
    if (!id) return;

    const initSocket = async () => {
      if (!socketManager.isConnected()) {
        await socketManager.connect().catch(() => {});
      }
      const userId = await AsyncStorage.getItem('userId');
      socketManager.subscribeToTrip(id, userId || undefined);

      const onDriverLocation = (data: any) => {
        if (data.tripId !== id) return;
        const loc = data.driverLocation;
        if (!loc) return;
        const newLoc = { latitude: loc.latitude, longitude: loc.longitude };
        setDriverLoc(newLoc);
        if (data.eta != null) setEta(data.eta);
        if (data.distance != null) setEtaDist(data.distance);
        // update driver route
        fetchDriverRoute(newLoc, tripRef.current);
      };

      const onStateUpdated = (data: any) => {
        if (data.tripId !== id) return;
        updateTripState(id, data.state, data.trip);
        const updated = { ...tripRef.current, currentTripState: data.state, ...(data.trip || {}) };
        setTrip(updated);
        tripRef.current = updated;
        // re-fetch driver route if target changes (pickup→delivery phase)
        if (driverLoc) fetchDriverRoute(driverLoc, updated);
      };

      socketManager.on('driver-location-updated', onDriverLocation);
      socketManager.on('trip-state-updated', onStateUpdated);

      return () => {
        socketManager.off('driver-location-updated', onDriverLocation);
        socketManager.off('trip-state-updated', onStateUpdated);
        socketManager.unsubscribeFromTrip(id);
      };
    };

    const cleanup = initSocket();
    return () => { cleanup.then(fn => fn && fn()); };
  }, [activeTrip?._id]);

  // ── fit map when driver route is fetched ──────────────────────────────────
  useEffect(() => {
    if (driverRoute.length > 0) {
      fitMap(driverRoute);
    }
  }, [driverRoute]);

  // ── initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  // Redirect if truly no trip
  useEffect(() => {
    if (!loading && !activeTrip && !trip) {
      router.replace('/(tabs)/home');
    }
  }, [loading, activeTrip, trip]);

  // ── render helpers ─────────────────────────────────────────────────────────
  const pickupLatLng = getPickupLatLng(trip);
  const dropLatLng   = getDropLatLng(trip);
  const stateInfo    = STATE_CONFIG[trip?.currentTripState] ?? { label: trip?.currentTripState || 'Tracking', color: '#666', icon: 'info' };
  const driver       = trip?.driver || (typeof trip?.driverId === 'object' ? trip.driverId : null);
  const pickupCode   = trip?.pickupCode || trip?.otp;
  const showCode     = ['ACCEPTED', 'ENROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP'].includes(trip?.currentTripState);

  const handleCallDriver = () => {
    if (driver?.phone) Linking.openURL(`tel:${driver.phone}`);
  };

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!pickupLatLng) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.loadingContainer}>
          <Icon name="error-outline" size={48} color="#f44336" />
          <Text style={styles.loadingText}>Trip details not found</Text>
          <TouchableOpacity style={styles.goBackBtn} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.goBackBtnText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Full-screen Map */}
      <MapboxGL.MapView ref={mapRef} style={styles.map} styleURL={MapboxGL.StyleURL.Street} logoEnabled={false} attributionEnabled={false}>
        <MapboxGL.Camera ref={cameraRef} zoomLevel={13} centerCoordinate={[pickupLatLng.longitude, pickupLatLng.latitude]} animationMode="flyTo" />

        {fullRoute.length > 1 && (() => {
          const geo = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: fullRoute.map(c => [c.longitude, c.latitude]) }, properties: {} };
          return <MapboxGL.ShapeSource id="fullRoute" shape={geo}><MapboxGL.LineLayer id="fullRouteLine" style={{ lineColor: '#BDBDBD', lineWidth: 4 }} /></MapboxGL.ShapeSource>;
        })()}

        {driverRoute.length > 1 && (() => {
          const geo = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: driverRoute.map(c => [c.longitude, c.latitude]) }, properties: {} };
          return <MapboxGL.ShapeSource id="driverRoute" shape={geo}><MapboxGL.LineLayer id="driverRouteLine" style={{ lineColor: isDeliveryPhase(trip?.currentTripState) ? '#FF9800' : '#2196F3', lineWidth: 5, lineCap: 'round', lineJoin: 'round' }} /></MapboxGL.ShapeSource>;
        })()}

        {pickupLatLng && (
          <MapboxGL.PointAnnotation id="pickup" coordinate={[pickupLatLng.longitude, pickupLatLng.latitude]}>
            <View style={styles.markerWrapper}>
              <View style={[styles.markerPin, { backgroundColor: '#4CAF50' }]}><Icon name="location-on" size={18} color="#fff" /></View>
              <View style={[styles.markerTail, { borderTopColor: '#4CAF50' }]} />
            </View>
          </MapboxGL.PointAnnotation>
        )}

        {dropLatLng && (
          <MapboxGL.PointAnnotation id="drop" coordinate={[dropLatLng.longitude, dropLatLng.latitude]}>
            <View style={styles.markerWrapper}>
              <View style={[styles.markerPin, { backgroundColor: '#FF9800' }]}><Icon name="place" size={18} color="#fff" /></View>
              <View style={[styles.markerTail, { borderTopColor: '#FF9800' }]} />
            </View>
          </MapboxGL.PointAnnotation>
        )}

        {driverLoc && (
          <MapboxGL.PointAnnotation id="driver" coordinate={[driverLoc.longitude, driverLoc.latitude]}>
            <View style={styles.driverMarker}><Icon name="directions-car" size={24} color="#1565C0" /></View>
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {/* ── Floating back button ── */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.85}
      >
        <Icon name="arrow-back" size={22} color="#1a1a1a" />
      </TouchableOpacity>

      {/* ── Status pill ── */}
      <View style={[styles.statusPill, { backgroundColor: stateInfo.color }]}>
        <Icon name={stateInfo.icon} size={14} color="#fff" />
        <Text style={styles.statusPillText}>{stateInfo.label}</Text>
      </View>

      {/* ── Bottom card ── */}
      <View style={styles.bottomCard}>
        {/* ETA row */}
        {(eta !== null || etaDist !== null) && (
          <View style={styles.etaRow}>
            {eta !== null && (
              <View style={styles.etaBadge}>
                <Icon name="schedule" size={16} color="#FF9800" />
                <Text style={styles.etaText}>{eta < 60 ? `${eta} min` : `${Math.floor(eta / 60)}h ${eta % 60}m`}</Text>
              </View>
            )}
            {etaDist !== null && (
              <View style={styles.etaBadge}>
                <Icon name="near-me" size={16} color="#2196F3" />
                <Text style={styles.etaText}>{etaDist.toFixed(1)} km</Text>
              </View>
            )}
          </View>
        )}

        {/* Pickup code shown when driver is coming to pickup */}
        {showCode && pickupCode && (
          <View style={styles.codeBox}>
            <View style={styles.codeBoxLeft}>
              <Icon name="lock" size={20} color="#FF9800" />
              <View>
                <Text style={styles.codeBoxLabel}>Your Pickup Code</Text>
                <Text style={styles.codeBoxHint}>Show this only to your driver</Text>
              </View>
            </View>
            <Text style={styles.codeBoxValue}>{pickupCode}</Text>
          </View>
        )}

        {/* Addresses */}
        <View style={styles.addressBlock}>
          <View style={styles.addressRow}>
            <View style={[styles.addressDot, { backgroundColor: '#4CAF50' }]} />
            <View style={styles.addressTextWrap}>
              <Text style={styles.addressLabel}>Pickup</Text>
              <Text style={styles.addressValue} numberOfLines={1}>
                {trip?.pickupLocation?.address || 'Pickup location'}
              </Text>
            </View>
          </View>

          <View style={styles.addressDivider}>
            <View style={styles.dottedLine} />
          </View>

          <View style={styles.addressRow}>
            <View style={[styles.addressDot, { backgroundColor: '#FF9800' }]} />
            <View style={styles.addressTextWrap}>
              <Text style={styles.addressLabel}>Drop</Text>
              <Text style={styles.addressValue} numberOfLines={1}>
                {(trip?.dropLocation || trip?.dropoffLocation)?.address || 'Drop location'}
              </Text>
            </View>
          </View>
        </View>

        {/* Driver info + call */}
        {driver && (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>
                {(driver.name || 'D').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{driver.name || 'Your Driver'}</Text>
              <Text style={styles.driverSub}>
                {driver.vehicleDetails?.type || driver.vehicleType || 'Vehicle'}{' '}
                {driver.vehicleDetails?.number || driver.vehicleNumber ? `• ${driver.vehicleDetails?.number || driver.vehicleNumber}` : ''}
              </Text>
            </View>
            {driver.phone && (
              <TouchableOpacity style={styles.callBtn} onPress={handleCallDriver} activeOpacity={0.8}>
                <Icon name="phone" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#666',
  },
  goBackBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
  },
  goBackBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // map
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // back button
  backBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },

  // status pill (top-center)
  statusPill: {
    position: 'absolute',
    top: 58,
    alignSelf: 'center',
    left: 70,
    right: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  statusPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // markers
  markerWrapper: {
    alignItems: 'center',
  },
  markerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  driverMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#1565C0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },

  // bottom card
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
    gap: 14,
  },

  // ETA
  etaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  etaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // pickup code
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#FFE082',
  },
  codeBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeBoxLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  codeBoxHint: {
    fontSize: 11,
    color: '#888',
    marginTop: 1,
  },
  codeBoxValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FF9800',
    letterSpacing: 6,
    fontFamily: 'monospace',
  },

  // addresses
  addressBlock: {
    backgroundColor: '#fafafa',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  addressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  addressTextWrap: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addressValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    lineHeight: 20,
  },
  addressDivider: {
    marginLeft: 5,
    paddingVertical: 4,
  },
  dottedLine: {
    height: 16,
    width: 2,
    borderStyle: 'dashed',
    borderLeftWidth: 2,
    borderLeftColor: '#ccc',
    marginLeft: 5,
  },

  // driver row
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  driverAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  driverSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
