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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { tripsAPI } from '../services/tripsAPI';
import { offersAPI } from '../services/offersAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import { useLanguage } from '../contexts/LanguageContext';

interface Trip {
  _id: string;
  pickupLocation: { address?: string };
  dropLocation: { address?: string };
  parcelDetails: { category: string; weight: string };
  currentTripState: string;
  estimatedFare: number;
  tripDate: string;
  driver?: { name: string; vehicleDetails: { type: string; number: string } };
}

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  REQUESTED:             { label: 'Searching',      color: '#F57C00', bg: '#FFF3E0', icon: 'search' },
  NEGOTIATING:           { label: 'Negotiating',    color: '#F57C00', bg: '#FFF3E0', icon: 'swap-horiz' },
  ACCEPTED:              { label: 'Accepted',       color: '#2E7D32', bg: '#E8F5E9', icon: 'check-circle' },
  ENROUTE_TO_PICKUP:     { label: 'Driver Coming',  color: '#1565C0', bg: '#E3F2FD', icon: 'directions-car' },
  ARRIVED_AT_PICKUP:     { label: 'Driver Arrived', color: '#2E7D32', bg: '#E8F5E9', icon: 'place' },
  PICKED_UP:             { label: 'Picked Up',      color: '#2E7D32', bg: '#E8F5E9', icon: 'inventory' },
  ENROUTE_TO_DELIVERY:   { label: 'On the Way',     color: '#1565C0', bg: '#E3F2FD', icon: 'local-shipping' },
  ARRIVED_AT_DELIVERY:   { label: 'Arrived',        color: '#2E7D32', bg: '#E8F5E9', icon: 'location-on' },
  DELIVERING:            { label: 'Delivering',     color: '#1565C0', bg: '#E3F2FD', icon: 'delivery-dining' },
  COMPLETED:             { label: 'Completed',      color: '#2E7D32', bg: '#E8F5E9', icon: 'task-alt' },
  CANCELLED:             { label: 'Cancelled',      color: '#C62828', bg: '#FFEBEE', icon: 'cancel' },
  DRIVER_CANCELLED:      { label: 'Driver Cancelled',color: '#C62828',bg: '#FFEBEE', icon: 'cancel' },
  CUSTOMER_CANCELLED:    { label: 'Cancelled',      color: '#C62828', bg: '#FFEBEE', icon: 'cancel' },
};

const getStatus = (state: string) => STATUS_CONFIG[state] || { label: state, color: '#666', bg: '#f5f5f5', icon: 'help' };


const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export default function MyTrips() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const FILTERS = [
    { key: 'all' as FilterKey,       label: t.trips.all,       icon: 'apps' },
    { key: 'active' as FilterKey,    label: t.trips.active,    icon: 'radio-button-on' },
    { key: 'completed' as FilterKey, label: t.trips.done,      icon: 'task-alt' },
    { key: 'cancelled' as FilterKey, label: t.trips.cancelled, icon: 'cancel' },
  ];
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [tripsWithDriverOffers, setTripsWithDriverOffers] = useState<Set<string>>(new Set());
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    loadTrips();
    initializeSocket();
    return () => { if (socket) socket.disconnect(); };
  }, [filter]);

  useEffect(() => {
    const interval = setInterval(() => { if (trips.length > 0) checkDriverOffers(trips); }, 30000);
    return () => clearInterval(interval);
  }, [trips]);

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const newSocket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
      newSocket.on('new-offer', (data: any) => {
        if (data.userType === 'driver' && (data.status === 'PENDING' || !data.status)) {
          const id = data.tripId?.toString();
          if (id) { setTripsWithDriverOffers(prev => new Set([...prev, id])); setTimeout(() => loadTrips(), 300); }
        }
      });
      newSocket.on('driver-offer-received', (data: any) => {
        const id = data.tripId?.toString();
        if (id) { setTripsWithDriverOffers(prev => new Set([...prev, id])); setTimeout(() => loadTrips(), 300); }
      });
      newSocket.on('offer-updated', (data: any) => {
        if (data.userType === 'driver' && data.status === 'PENDING') {
          setTripsWithDriverOffers(prev => new Set([...prev, data.tripId]));
        } else if (data.status === 'REJECTED' || data.status === 'EXPIRED') {
          setTripsWithDriverOffers(prev => { const s = new Set(prev); s.delete(data.tripId); return s; });
        }
      });
      newSocket.on('new-notification', (data: any) => {
        if (data.type === 'offer' && data.data?.tripId) {
          setTripsWithDriverOffers(prev => new Set([...prev, data.data.tripId]));
          loadTrips();
        }
      });
      setSocket(newSocket);
    } catch {}
  };

  const loadTripsRef = useRef(false);
  const loadTrips = async () => {
    if (loadTripsRef.current) return;
    try {
      loadTripsRef.current = true;
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) { router.replace('/login'); return; }
      const statusMap: Record<string, string | undefined> = {
        all: undefined,
        completed: 'COMPLETED',
        cancelled: 'CANCELLED,CUSTOMER_CANCELLED,DRIVER_CANCELLED',
        active: 'REQUESTED,NEGOTIATING,ACCEPTED,ENROUTE_TO_PICKUP,ARRIVED_AT_PICKUP,PICKED_UP,ENROUTE_TO_DELIVERY,ARRIVED_AT_DELIVERY,DELIVERING',
      };
      const response = await tripsAPI.getMyTrips(statusMap[filter]);
      if (response.ok && response.data) {
        const userTrips = Array.isArray(response.data) ? response.data.filter((t: any) => t.customerId === userId) : [];
        setTrips(userTrips);
        setTimeout(() => checkDriverOffers(userTrips), 500);
      }
    } catch (error: any) {
      if (error.message?.includes('slow down') || error.status === 429) {
        setTimeout(() => { loadTripsRef.current = false; loadTrips(); }, 5000);
        return;
      }
    } finally { setLoading(false); setRefreshing(false); loadTripsRef.current = false; }
  };

  const checkDriverOffersRef = useRef(false);
  const checkDriverOffers = async (tripsList: Trip[]) => {
    if (checkDriverOffersRef.current) return;
    try {
      checkDriverOffersRef.current = true;
      const withOffers = new Set<string>();
      const toCheck = tripsList.filter(t => t.currentTripState === 'REQUESTED' || t.currentTripState === 'NEGOTIATING').slice(0, 5);
      for (const trip of toCheck) {
        try {
          await new Promise(r => setTimeout(r, 200));
          const res = await offersAPI.getTripOffers(trip._id);
          if (res.ok && res.data?.some((o: any) => o.userType === 'driver' && o.status === 'PENDING')) {
            withOffers.add(trip._id);
          }
        } catch (e: any) {
          if (e.message?.includes('slow down') || e.status === 429) break;
        }
      }
      setTripsWithDriverOffers(withOffers);
    } finally { checkDriverOffersRef.current = false; }
  };

  const handleTripPress = async (trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (trip.currentTripState === 'COMPLETED') {
      try {
        const skipped = await AsyncStorage.getItem(`rating_skipped_${trip._id}`);
        if (!skipped) {
          const ratingResponse = await tripsAPI.getTripRating(trip._id);
          if (ratingResponse.ok && !ratingResponse.data) {
            Alert.alert('Rate Your Trip', 'How was your experience?', [
              { text: 'Later', style: 'cancel', onPress: () => router.push(`/trip-tracking?id=${trip._id}`) },
              { text: 'Rate Now', onPress: () => router.push(`/rate-trip?tripId=${trip._id}`) },
            ]);
            return;
          }
        }
      } catch {}
    }
    router.push(`/trip-tracking?id=${trip._id}`);
  };

  const activeCount = trips.filter(tr => ['REQUESTED','NEGOTIATING','ACCEPTED','ENROUTE_TO_PICKUP','ARRIVED_AT_PICKUP','PICKED_UP','ENROUTE_TO_DELIVERY','ARRIVED_AT_DELIVERY','DELIVERING'].includes(tr.currentTripState)).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerDec1} />
        <View style={styles.headerDec2} />
        <View style={styles.headerRow}>
          {router.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
              <Icon name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t.trips.title}</Text>
            <Text style={styles.headerSub}>{trips.length} {t.trips.tripCount}{trips.length !== 1 ? 's' : ''}{activeCount > 0 ? ` · ${activeCount} ${t.trips.active.toLowerCase()}` : ''}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); loadTrips(); }}>
            <Icon name="refresh" size={20} color="#A5D6A7" />
          </TouchableOpacity>
        </View>

        {/* ── Filter Pills ── */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(f.key); }}
              activeOpacity={0.8}
            >
              <Icon name={f.icon as any} size={14} color={filter === f.key ? '#fff' : '#A5D6A7'} />
              <Text style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── List ── */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTrips(); }} tintColor="#4CAF50" />}
      >
        {trips.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconBox}>
              <Icon name="local-shipping" size={48} color="#A5D6A7" />
            </View>
            <Text style={styles.emptyTitle}>{t.trips.noTrips}</Text>
            <Text style={styles.emptySub}>
              {filter === 'all' ? t.trips.bookTrip :
               filter === 'active' ? t.trips.noActiveTrips :
               filter === 'completed' ? t.trips.noCompletedTrips :
               t.trips.noCancelledTrips}
            </Text>
            {filter === 'all' && (
              <TouchableOpacity style={styles.bookBtn} onPress={() => router.push('/(tabs)/home')}>
                <Text style={styles.bookBtnText}>{t.trips.bookTrip}</Text>
                <Icon name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          trips.map(trip => {
            const status = getStatus(trip.currentTripState);
            const hasOffer = tripsWithDriverOffers.has(trip._id);
            const isActive = !['COMPLETED','CANCELLED','DRIVER_CANCELLED','CUSTOMER_CANCELLED'].includes(trip.currentTripState);

            return (
              <TouchableOpacity key={trip._id} style={[styles.card, isActive && styles.cardActive]} onPress={() => handleTripPress(trip)} activeOpacity={0.75}>

                {/* Status bar top accent */}
                <View style={[styles.cardAccent, { backgroundColor: status.color }]} />

                {/* Header row */}
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Icon name={status.icon as any} size={13} color={status.color} />
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <View style={styles.dateBox}>
                    <Text style={styles.dateText}>{formatDate(trip.tripDate)}</Text>
                    <Text style={styles.timeText}>{formatTime(trip.tripDate)}</Text>
                  </View>
                </View>

                {/* Route visualization */}
                <View style={styles.routeBox}>
                  <View style={styles.routeIcons}>
                    <View style={styles.routeDotGreen} />
                    <View style={styles.routeLine} />
                    <View style={styles.routeDotOrange} />
                  </View>
                  <View style={styles.routeLabels}>
                    <View style={styles.routeLocationBox}>
                      <Text style={styles.routeLocationLabel}>{t.trips.from}</Text>
                      <Text style={styles.routeLocation} numberOfLines={1}>{trip.pickupLocation.address || t.home.pickupLocation}</Text>
                    </View>
                    <View style={styles.routeLocationBox}>
                      <Text style={styles.routeLocationLabel}>{t.trips.to}</Text>
                      <Text style={styles.routeLocation} numberOfLines={1}>{trip.dropLocation.address || t.home.dropLocation}</Text>
                    </View>
                  </View>
                </View>

                {/* Details row */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailChip}>
                    <Icon name="inventory-2" size={13} color="#666" />
                    <Text style={styles.detailChipText}>{trip.parcelDetails.category}</Text>
                  </View>
                  <View style={styles.detailChip}>
                    <Icon name="scale" size={13} color="#666" />
                    <Text style={styles.detailChipText}>{trip.parcelDetails.weight}</Text>
                  </View>
                  {trip.driver && (
                    <View style={[styles.detailChip, { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' }]}>
                      <Icon name="person" size={13} color="#2E7D32" />
                      <Text style={[styles.detailChipText, { color: '#2E7D32' }]}>{trip.driver.name}</Text>
                    </View>
                  )}
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.fareLabel}>{t.trips.estimatedFare}</Text>
                    <Text style={styles.fareAmount}>₹{trip.estimatedFare.toFixed(0)}</Text>
                  </View>
                  <View style={styles.cardFooterRight}>
                    {hasOffer && (
                      <TouchableOpacity
                        style={styles.negotiateBtn}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip-negotiation?tripId=${trip._id}`); }}
                        activeOpacity={0.8}
                      >
                        <Icon name="gavel" size={15} color="#fff" />
                        <Text style={styles.negotiateBtnText}>{t.trips.negotiate}</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.viewBtn}>
                      <Text style={styles.viewBtnText}>{t.trips.view}</Text>
                      <Icon name="chevron-right" size={18} color="#4CAF50" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F9' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: '#999' },

  // ── Header ──
  header: { backgroundColor: '#2E7D32', paddingBottom: 12, overflow: 'hidden' },
  headerDec1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.05)', top: -50, right: -30 },
  headerDec2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -30, left: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: '#A5D6A7', marginTop: 2 },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  filterPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  filterPillActive: { backgroundColor: '#fff' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#A5D6A7' },
  filterPillTextActive: { color: '#2E7D32' },

  // ── Empty ──
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyIconBox: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  emptySub: { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 22 },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4CAF50', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 8 },
  bookBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Card ──
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  cardActive: { shadowColor: '#2E7D32', shadowOpacity: 0.12 },
  cardAccent: { height: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  dateBox: { alignItems: 'flex-end' },
  dateText: { fontSize: 12, fontWeight: '600', color: '#444' },
  timeText: { fontSize: 11, color: '#aaa', marginTop: 1 },

  // ── Route ──
  routeBox: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  routeIcons: { alignItems: 'center', paddingTop: 4, gap: 0 },
  routeDotGreen: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#C8E6C9' },
  routeLine: { width: 2, flex: 1, backgroundColor: '#e0e0e0', marginVertical: 3, minHeight: 20 },
  routeDotOrange: { width: 11, height: 11, borderRadius: 3, backgroundColor: '#FF9800', borderWidth: 2, borderColor: '#FFE0B2' },
  routeLabels: { flex: 1, gap: 10 },
  routeLocationBox: {},
  routeLocationLabel: { fontSize: 9, fontWeight: '700', color: '#bbb', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  routeLocation: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },

  // ── Details ──
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  detailChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f7f7f7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#eee' },
  detailChipText: { fontSize: 12, color: '#555', fontWeight: '500' },

  // ── Footer ──
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  fareLabel: { fontSize: 11, color: '#aaa', fontWeight: '500', marginBottom: 2 },
  fareAmount: { fontSize: 22, fontWeight: '800', color: '#2E7D32' },
  cardFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  negotiateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FF9800', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  negotiateBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewBtnText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },
});
