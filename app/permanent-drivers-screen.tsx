import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Linking, Image,
  RefreshControl, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { permanentDriversAPI, PermanentDriver } from '../services/permanentDriversAPI';
import { useLanguage } from '../contexts/LanguageContext';

const VEHICLE_FILTERS = ['All', 'Pickup', 'Tata Ace', 'Bolero Pickup', 'Tempo', 'Truck'];
const ACCENT = '#16a34a';
const ACCENT_LIGHT = '#dcfce7';

// ── Pricing badge ──────────────────────────────────────────────────────────────
function PricingBadge({ type }: { type: string }) {
  const { t } = useLanguage();
  const map: Record<string, { label: string; bg: string; color: string }> = {
    per_km:  { label: t.drivers.perKm,   bg: '#dbeafe', color: '#1d4ed8' },
    package: { label: t.drivers.package, bg: '#f3e8ff', color: '#7c3aed' },
    both:    { label: t.drivers.both,    bg: ACCENT_LIGHT, color: '#15803d' },
  };
  const s = map[type] ?? { label: type, bg: '#f3f4f6', color: '#374151' };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

// ── Driver card ────────────────────────────────────────────────────────────────
function DriverCard({ driver, onPress }: { driver: PermanentDriver; onPress: () => void }) {
  const { t } = useLanguage();
  const initials = driver.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const call     = () => Linking.openURL(`tel:${driver.mobileNumber}`);
  const whatsapp = () => Linking.openURL(`https://wa.me/91${driver.mobileNumber}`);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Featured ribbon */}
      {driver.isFeatured && (
        <View style={styles.featuredBanner}>
          <Icon name="star" size={10} color="#fff" />
          <Text style={styles.featuredText}>{t.drivers.featured}</Text>
        </View>
      )}

      {/* Top: photo + info */}
      <View style={styles.cardTop}>
        <View style={styles.photoWrap}>
          {driver.profilePhoto ? (
            <Image source={{ uri: driver.profilePhoto }} style={styles.photo} />
          ) : (
            <View style={styles.initials}>
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.driverName} numberOfLines={1}>{driver.name}</Text>

          <View style={styles.infoRow}>
            <Icon name="local-shipping" size={12} color="#9ca3af" />
            <Text style={styles.infoText}>{driver.vehicleType}</Text>
            {driver.vehicleNumber ? (
              <View style={styles.plate}>
                <Text style={styles.plateText}>{driver.vehicleNumber}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.infoRow}>
            <Icon name="location-on" size={12} color="#9ca3af" />
            <Text style={styles.infoText}>{driver.city}</Text>
            {driver.experience > 0 && (
              <Text style={styles.expText}>{driver.experience} yr exp</Text>
            )}
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: ACCENT_LIGHT }]}>
              <Text style={[styles.badgeText, { color: ACCENT }]}>✓ Verified</Text>
            </View>
            <PricingBadge type={driver.pricingType} />
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Price & packages */}
      <View style={styles.pricingBlock}>
        {(driver.pricingType === 'per_km' || driver.pricingType === 'both') && driver.perKmRate ? (
          <View style={styles.priceRow}>
            <Icon name="route" size={14} color={ACCENT} />
            <Text style={styles.priceText}>₹{driver.perKmRate}<Text style={styles.priceUnit}> / km</Text></Text>
          </View>
        ) : null}

        {driver.packages?.length > 0 && (
          <View style={styles.packagesRow}>
            {driver.packages.slice(0, 2).map((pkg, i) => (
              <View key={i} style={styles.pkgChip}>
                <Text style={styles.pkgText}>{pkg.title} — ₹{pkg.amount}</Text>
              </View>
            ))}
            {driver.packages.length > 2 && (
              <Text style={styles.morePkgs}>+{driver.packages.length - 2} more</Text>
            )}
          </View>
        )}

        {driver.availabilityText ? (
          <View style={styles.availRow}>
            <View style={styles.availDot} />
            <Text style={styles.availText}>{driver.availabilityText}</Text>
          </View>
        ) : null}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.callBtn} onPress={call} activeOpacity={0.8}>
          <Icon name="phone" size={15} color="#fff" />
          <Text style={styles.callBtnText}>{t.drivers.call}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.waBtn} onPress={whatsapp} activeOpacity={0.8}>
          <Icon name="chat" size={15} color="#fff" />
          <Text style={styles.waBtnText}>{t.drivers.whatsapp}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function PermanentDriversScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { t }   = useLanguage();
  const [drivers, setDrivers]     = useState<PermanentDriver[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('All');

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await permanentDriversAPI.getAll({
        vehicleType: vehicleFilter !== 'All' ? vehicleFilter : undefined,
        search: search.trim() || undefined,
      });
      if (res.ok) setDrivers(res.data.drivers);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vehicleFilter, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── Sticky header zone ── */}
      <View style={styles.headerZone}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.headerTitle}>{t.drivers.title}</Text>
            <Text style={styles.headerSub}>
              {loading ? t.common.loading : `${drivers.length} driver${drivers.length !== 1 ? 's' : ''} available`}
            </Text>
          </View>
          <View style={styles.countBubble}>
            <Text style={styles.countText}>{drivers.length}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t.drivers.searchPlaceholder}
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <FlatList
          data={VEHICLE_FILTERS}
          horizontal
          keyExtractor={i => i}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, vehicleFilter === item && styles.filterChipActive]}
              onPress={() => setVehicleFilter(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, vehicleFilter === item && styles.filterChipTextActive]}>
                {item === 'All' ? t.drivers.all : item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="person-search" size={56} color="#d1d5db" />
          <Text style={styles.emptyTitle}>{t.drivers.noDrivers}</Text>
          <Text style={styles.emptySubtext}>{t.drivers.noDriversSub}</Text>
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={d => d._id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              colors={[ACCENT]}
              tintColor={ACCENT}
            />
          }
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              onPress={() => router.push({ pathname: '/permanent-driver-detail', params: { id: item._id } })}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },

  // Header zone
  headerZone: {
    backgroundColor: '#fff',
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub:   { fontSize: 12, color: '#6b7280', marginTop: 1 },
  countBubble: {
    backgroundColor: ACCENT_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countText: { fontSize: 14, fontWeight: '800', color: ACCENT },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#f9fafb', borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 12, height: 40,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },

  // Filter chips
  filterList: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive:     { backgroundColor: ACCENT, borderColor: ACCENT },
  filterChipText:       { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  // States
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 },
  loadingText:  { color: '#9ca3af', fontSize: 13, marginTop: 6 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 10 },
  emptySubtext: { fontSize: 13, color: '#9ca3af' },

  // List
  list: { paddingTop: 12, paddingHorizontal: 16 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: ACCENT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  featuredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f59e0b',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomRightRadius: 8,
  },
  featuredText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  cardTop:  { flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 10 },
  photoWrap: {},
  photo: { width: 62, height: 62, borderRadius: 31 },
  initials: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: ACCENT_LIGHT,
    justifyContent: 'center', alignItems: 'center',
  },
  initialsText: { fontSize: 20, fontWeight: '800', color: ACCENT },

  cardInfo: { flex: 1, gap: 3 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, color: '#6b7280' },
  plate: {
    backgroundColor: '#f3f4f6', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  plateText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  expText:   { fontSize: 12, color: '#9ca3af' },

  badgeRow: { flexDirection: 'row', gap: 5, marginTop: 2, flexWrap: 'wrap' },
  badge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:{ fontSize: 10, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 14 },

  pricingBlock: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, gap: 6 },
  priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  priceText: { fontSize: 15, fontWeight: '800', color: ACCENT },
  priceUnit: { fontSize: 12, fontWeight: '500', color: '#6b7280' },

  packagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pkgChip:  {
    backgroundColor: '#f5f3ff', borderRadius: 6,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  pkgText:  { fontSize: 11, color: '#6d28d9', fontWeight: '600' },
  morePkgs: { fontSize: 11, color: '#9ca3af', alignSelf: 'center' },

  availRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  availText: { fontSize: 11, color: '#6b7280' },

  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8,
  },
  callBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 9, gap: 5,
  },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  waBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#25D366', borderRadius: 10, paddingVertical: 9, gap: 5,
  },
  waBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
