import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, ActivityIndicator, Linking,
  StatusBar, SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { permanentDriversAPI, PermanentDriver } from '../services/permanentDriversAPI';

const ACCENT       = '#16a34a';
const ACCENT_LIGHT = '#dcfce7';

export default function PermanentDriverDetail() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { id }  = useLocalSearchParams<{ id: string }>();

  const [driver, setDriver]   = useState<PermanentDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!id) return;
    permanentDriversAPI.getOne(id as string)
      .then(res => {
        if (res.ok && res.data) setDriver(res.data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const call      = () => driver && Linking.openURL(`tel:${driver.mobileNumber}`);
  const whatsapp  = () => driver && Linking.openURL(`https://wa.me/91${driver.mobileNumber}`);

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.centered}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !driver) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.centered}>
          <Icon name="error-outline" size={48} color="#d1d5db" />
          <Text style={st.errorText}>Could not load driver details.</Text>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Text style={st.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const initials = driver.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={ACCENT} />

      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backIcon} activeOpacity={0.7}>
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{driver.name}</Text>
        {driver.isFeatured && (
          <View style={st.featuredChip}>
            <Icon name="star" size={11} color="#f59e0b" />
            <Text style={st.featuredText}>Featured</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Profile card ── */}
        <View style={st.profileCard}>
          {driver.profilePhoto ? (
            <Image source={{ uri: driver.profilePhoto }} style={st.avatar} />
          ) : (
            <View style={[st.avatar, st.avatarFallback]}>
              <Text style={st.avatarText}>{initials}</Text>
            </View>
          )}
          <Text style={st.driverName}>{driver.name}</Text>
          <Text style={st.driverSub}>{driver.vehicleType} · {driver.city}</Text>

          <View style={st.verifiedRow}>
            <Icon name="verified" size={15} color={ACCENT} />
            <Text style={st.verifiedText}>Verified Driver</Text>
          </View>
        </View>

        {/* ── Info grid ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Driver Info</Text>
          <View style={st.infoGrid}>
            <InfoTile icon="local-shipping" label="Vehicle" value={driver.vehicleType} />
            {driver.vehicleNumber && (
              <InfoTile icon="confirmation-number" label="Vehicle No." value={driver.vehicleNumber} />
            )}
            <InfoTile icon="location-on" label="City" value={driver.city} />
            {driver.experience > 0 && (
              <InfoTile icon="work" label="Experience" value={`${driver.experience} years`} />
            )}
            {driver.languages?.length > 0 && (
              <InfoTile icon="translate" label="Languages" value={driver.languages.join(', ')} />
            )}
            {driver.availabilityText && (
              <InfoTile icon="schedule" label="Availability" value={driver.availabilityText} accent />
            )}
          </View>
        </View>

        {/* ── Service area ── */}
        {driver.serviceArea && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>Service Area</Text>
            <View style={st.textCard}>
              <Icon name="map" size={18} color={ACCENT} />
              <Text style={st.textCardValue}>{driver.serviceArea}</Text>
            </View>
          </View>
        )}

        {/* ── Contact ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Contact</Text>
          <View style={st.contactCard}>
            <Icon name="phone" size={18} color={ACCENT} />
            <View style={{ flex: 1 }}>
              <Text style={st.contactLabel}>Mobile</Text>
              <Text style={st.contactValue}>{driver.mobileNumber}</Text>
            </View>
          </View>
          {driver.alternateMobile && (
            <View style={[st.contactCard, { marginTop: 8 }]}>
              <Icon name="phone" size={18} color="#6b7280" />
              <View style={{ flex: 1 }}>
                <Text style={st.contactLabel}>Alternate</Text>
                <Text style={st.contactValue}>{driver.alternateMobile}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Pricing ── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Pricing</Text>

          {(driver.pricingType === 'per_km' || driver.pricingType === 'both') && driver.perKmRate && (
            <View style={st.priceRow}>
              <Icon name="route" size={20} color={ACCENT} />
              <Text style={st.priceAmount}>₹{driver.perKmRate}</Text>
              <Text style={st.priceUnit}>per km</Text>
            </View>
          )}

          {driver.packages?.length > 0 && (
            <View style={st.packagesWrap}>
              <Text style={st.packagesLabel}>Packages</Text>
              {driver.packages.map((pkg) => (
                <View key={pkg._id} style={st.pkgRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.pkgTitle}>{pkg.title}</Text>
                    {pkg.description && (
                      <Text style={st.pkgDesc}>{pkg.description}</Text>
                    )}
                  </View>
                  <Text style={st.pkgAmount}>₹{pkg.amount}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Bio ── */}
        {driver.bio && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>About</Text>
            <View style={st.bioCard}>
              <Text style={st.bioText}>{driver.bio}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Sticky CTA ── */}
      <View style={[st.cta, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={st.callBtn} onPress={call} activeOpacity={0.85}>
          <Icon name="phone" size={18} color="#fff" />
          <Text style={st.callBtnText}>Call Driver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.waBtn} onPress={whatsapp} activeOpacity={0.85}>
          <Icon name="chat" size={18} color="#fff" />
          <Text style={st.waBtnText}>WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoTile({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: boolean }) {
  return (
    <View style={st.infoTile}>
      <Icon name={icon} size={20} color={accent ? ACCENT : '#6b7280'} />
      <Text style={st.infoTileLabel}>{label}</Text>
      <Text style={[st.infoTileValue, accent && { color: ACCENT, fontWeight: '700' }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#f3f4f6' },
  safe:  { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  errorText:   { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  backBtn:     { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: ACCENT, borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: '700' },

  // Header
  header: {
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  backIcon:    { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  featuredChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12,
  },
  featuredText: { fontSize: 11, fontWeight: '700', color: '#fde68a' },

  scroll: { paddingTop: 0 },

  // Profile card
  profileCard: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: ACCENT_LIGHT,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:   { fontSize: 32, fontWeight: '800', color: ACCENT },
  driverName:   { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 },
  driverSub:    { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  verifiedRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 13, fontWeight: '600', color: ACCENT },

  // Section
  section: {
    backgroundColor: '#fff',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoTile: {
    width: '47%',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  infoTileLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' },
  infoTileValue: { fontSize: 13, color: '#111827', fontWeight: '600' },

  // Text card (service area)
  textCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#f3f4f6',
  },
  textCardValue: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },

  // Contact
  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: ACCENT_LIGHT, borderRadius: 10, padding: 12,
  },
  contactLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' },
  contactValue: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 1 },

  // Pricing
  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    marginBottom: 10,
  },
  priceAmount: { fontSize: 24, fontWeight: '800', color: ACCENT },
  priceUnit:   { fontSize: 13, color: '#6b7280' },

  packagesWrap: { gap: 8 },
  packagesLabel:{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 },
  pkgRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f5f3ff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  pkgTitle:  { fontSize: 13, fontWeight: '700', color: '#374151' },
  pkgDesc:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  pkgAmount: { fontSize: 16, fontWeight: '800', color: '#6d28d9' },

  // Bio
  bioCard: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6',
  },
  bioText: { fontSize: 14, color: '#374151', lineHeight: 22 },

  // Sticky CTA
  cta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 8,
  },
  callBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 13, gap: 6,
  },
  callBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  waBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 13, gap: 6,
  },
  waBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
