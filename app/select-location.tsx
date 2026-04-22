import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Animated,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import React from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
MapboxGL.setAccessToken(Constants.expoConfig?.extra?.MAPBOX_TOKEN || '');
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { placesAPI, PlaceSuggestion } from '../services/placesAPI';

const PICKUP_COLOR = '#2E7D32';
const DROP_COLOR   = '#E65100';

export default function SelectLocation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const locationType = (params.type as string) || 'pickup';
  const isPickup = locationType === 'pickup';
  const accentColor = isPickup ? PICKUP_COLOR : DROP_COLOR;
  const accentLight = isPickup ? '#E8F5E9' : '#FFF3E0';

  const [searchQuery, setSearchQuery]       = useState('');
  const [suggestions, setSuggestions]       = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number; longitude: number; address: string;
  } | null>(null);
  const [loading, setLoading]             = useState(false);
  const [searching, setSearching]         = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number; longitude: number;
  } | null>(null);
  const [inputFocused, setInputFocused]   = useState(false);

  const mapRef    = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const searchTimeoutRef   = useRef<NodeJS.Timeout | null>(null);
  const inputRef           = useRef<TextInput>(null);
  const suggestionAnim     = useRef(new Animated.Value(0)).current;
  // When true, the next searchQuery change came from code (not user typing) — skip search
  const suppressSearchRef  = useRef(false);

  // ── animate suggestions in/out ──────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(suggestionAnim, {
      toValue: showSuggestions ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [showSuggestions]);

  useEffect(() => {
    requestLocationPermission();
    loadStoredLocation();
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, []);

  useEffect(() => {
    if (selectedLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [selectedLocation.longitude, selectedLocation.latitude],
        zoomLevel: 15,
        animationDuration: 500,
      });
    }
  }, [selectedLocation]);

  // ── debounced search ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Query was set programmatically (selection / map tap / GPS) — don't re-search
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const q = searchQuery.trim();
    if (q.length >= 2) {
      setSearching(true);
      setShowSuggestions(true);
      searchTimeoutRef.current = setTimeout(() => handleAutocompleteSearch(q), 300);
    } else if (q.length === 0) {
      setSuggestions([]); setShowSuggestions(false); setSearching(false);
    } else {
      setSuggestions([]); setShowSuggestions(false); setSearching(false);
    }
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  // Wraps reverseGeocodeAsync so Android "hbcc: UNAVAILABLE" and other
  // transient geocoding failures never crash the flow — returns null on error.
  const safeReverseGeocode = async (coords: { latitude: number; longitude: number }) => {
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      return results?.[0] ?? null;
    } catch (e) {
      console.warn('Reverse geocode unavailable, using coordinates as fallback:', e);
      return null;
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Denied', 'Location permission is required.'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCurrentLocation(coords);
      // Only center the map — do NOT auto-select current location as the pickup/drop point
      cameraRef.current?.setCamera({ centerCoordinate: [coords.longitude, coords.latitude], zoomLevel: 13, animationDuration: 1000 });
    } catch (e) { console.error('Location error:', e); }
  };

  const loadStoredLocation = async () => {
    try {
      const key = isPickup ? 'pickupLocation' : 'dropLocation';
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const loc = JSON.parse(stored);
        setSelectedLocation(loc);
        suppressSearchRef.current = true;
        setSearchQuery(loc.address);
      }
    } catch (e) { console.error('Load stored error:', e); }
  };

  const handleAutocompleteSearch = async (query: string) => {
    if (!query || query.trim().length < 2) { setSuggestions([]); setSearching(false); return; }
    try {
      const response = await placesAPI.getAutocomplete(query.trim(), currentLocation || undefined, 50000);
      if (response.ok && response.data && Array.isArray(response.data)) {
        setSuggestions(response.data); setShowSuggestions(true);
      } else {
        setSuggestions([]);
      }
    } catch {
      try {
        const results = await Location.geocodeAsync(query);
        if (results.length > 0) {
          const r = results[0];
          setSuggestions([{ placeId: `geocode_${r.latitude}_${r.longitude}`, description: query, mainText: query, secondaryText: '', isMaharashtra: false, types: [] }]);
          setShowSuggestions(true);
        } else { setSuggestions([]); }
      } catch { setSuggestions([]); }
    } finally { setSearching(false); }
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Suppress the searchQuery effect so setting the query doesn't re-open suggestions
    suppressSearchRef.current = true;
    setSearchQuery(suggestion.description);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearching(false);
    Keyboard.dismiss();
    setLoading(true);
    try {
      if (suggestion.placeId.startsWith('geocode_')) {
        const [lat, lng] = suggestion.placeId.replace('geocode_', '').split('_');
        const loc = { latitude: parseFloat(lat), longitude: parseFloat(lng), address: suggestion.description };
        setSelectedLocation(loc);
        cameraRef.current?.setCamera({ centerCoordinate: [loc.longitude, loc.latitude], zoomLevel: 15, animationDuration: 800 });
      } else {
        const response = await placesAPI.getPlaceDetails(suggestion.placeId);
        if (response.ok && response.data) {
          const loc = { latitude: response.data.latitude, longitude: response.data.longitude, address: response.data.address };
          setSelectedLocation(loc);
          cameraRef.current?.setCamera({ centerCoordinate: [loc.longitude, loc.latitude], zoomLevel: 15, animationDuration: 800 });
        }
      }
    } catch { Alert.alert('Error', 'Failed to get location details. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleMapPress = async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setSuggestions([]); setShowSuggestions(false); setSearching(false); Keyboard.dismiss();
    try {
      const addr = await safeReverseGeocode({ latitude, longitude });
      const addressString = addr
        ? `${addr.street || ''} ${addr.city || ''} ${addr.region || ''}`.trim() || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
        : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setSelectedLocation({ latitude, longitude, address: addressString });
      suppressSearchRef.current = true;
      setSearchQuery(addressString);
      cameraRef.current?.setCamera({ centerCoordinate: [longitude, latitude], zoomLevel: 15, animationDuration: 600 });
    } finally { setLoading(false); }
  };

  const handleUseCurrentLocation = async () => {
    if (!currentLocation) { await requestLocationPermission(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true); setSuggestions([]); setShowSuggestions(false); setSearching(false); Keyboard.dismiss();
    try {
      const addr = await safeReverseGeocode(currentLocation);
      const addressString = addr
        ? `${addr.street || ''} ${addr.city || ''} ${addr.region || ''}`.trim() || 'Current Location'
        : 'Current Location';
      setSelectedLocation({ ...currentLocation, address: addressString });
      suppressSearchRef.current = true;
      setSearchQuery(addressString);
      cameraRef.current?.setCamera({ centerCoordinate: [currentLocation.longitude, currentLocation.latitude], zoomLevel: 14, animationDuration: 800 });
    } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!selectedLocation) { Alert.alert('Required', 'Please select a location.'); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const key = isPickup ? 'pickupLocation' : 'dropLocation';
    await AsyncStorage.setItem(key, JSON.stringify(selectedLocation));
    if (!isPickup) {
      try {
        const pickupStored = await AsyncStorage.getItem('pickupLocation');
        if (pickupStored) {
          const pickup = JSON.parse(pickupStored);
          if (pickup.latitude && pickup.longitude && selectedLocation.latitude && selectedLocation.longitude) {
            router.push({
              pathname: '/book-ride',
              params: {
                step: '2',
                pickupLat: pickup.latitude.toString(), pickupLng: pickup.longitude.toString(), pickupAddress: pickup.address || 'Pickup Location',
                dropLat: selectedLocation.latitude.toString(), dropLng: selectedLocation.longitude.toString(), dropAddress: selectedLocation.address || 'Drop Location',
              },
            });
            return;
          }
        }
      } catch (e) { console.error('Confirm error:', e); }
    }
    router.back();
  };

  // ── render suggestion item ───────────────────────────────────────────────────
  const renderSuggestion = ({ item, index }: { item: PlaceSuggestion; index: number }) => (
    <TouchableOpacity
      style={styles.suggCard}
      onPress={() => handleSelectSuggestion(item)}
      activeOpacity={0.65}
    >
      <View style={[styles.suggIconBox, item.isMaharashtra ? { backgroundColor: accentLight } : styles.suggIconBoxDefault]}>
        <Icon
          name={item.types?.includes('establishment') ? 'store' : item.isMaharashtra ? 'location-city' : 'place'}
          size={18}
          color={item.isMaharashtra ? accentColor : '#888'}
        />
      </View>
      <View style={styles.suggBody}>
        <Text style={styles.suggMain} numberOfLines={1}>{item.mainText}</Text>
        {!!item.secondaryText && (
          <Text style={styles.suggSub} numberOfLines={1}>{item.secondaryText}</Text>
        )}
      </View>
      <View style={styles.suggRight}>
        {item.isMaharashtra && (
          <View style={[styles.mhBadge, { backgroundColor: accentLight }]}>
            <Text style={[styles.mhBadgeText, { color: accentColor }]}>MH</Text>
          </View>
        )}
        <Icon name="chevron-right" size={16} color="#ccc" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={accentColor} />

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: accentColor }]}>
        {/* decorative circle */}
        <View style={styles.headerCircle} />
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          >
            <Icon name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.typeDot, { backgroundColor: 'rgba(255,255,255,0.35)' }]}>
              <Icon name={isPickup ? 'trip-origin' : 'place'} size={14} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>
              {isPickup ? 'Pickup Location' : 'Drop Location'}
            </Text>
          </View>
        </View>

        {/* ── Search bar lives inside header card ───────── */}
        <View style={[styles.searchCard, inputFocused && styles.searchCardFocused]}>
          <Icon name="search" size={20} color={inputFocused ? accentColor : '#aaa'} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={`Search ${isPickup ? 'pickup' : 'drop'} address…`}
            placeholderTextColor="#bbb"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => {
              setInputFocused(true);
              if (suggestions.length > 0) setShowSuggestions(true);
              else if (searchQuery.length >= 2) { handleAutocompleteSearch(searchQuery); setShowSuggestions(true); }
            }}
            onBlur={() => setInputFocused(false)}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus(); }}>
              <View style={styles.clearBtn}>
                <Icon name="close" size={14} color="#666" />
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── Suggestions panel ──────────────────────────────── */}
      {showSuggestions && (
        <Animated.View
          style={[
            styles.suggestionsPanel,
            { opacity: suggestionAnim, transform: [{ translateY: suggestionAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] },
          ]}
        >
          {/* Use current location row */}
          <TouchableOpacity style={styles.currentLocRow} onPress={handleUseCurrentLocation} activeOpacity={0.7}>
            <View style={[styles.currentLocIcon, { backgroundColor: accentLight }]}>
              <Icon name="my-location" size={18} color={accentColor} />
            </View>
            <View style={styles.suggBody}>
              <Text style={[styles.suggMain, { color: accentColor }]}>Use my current location</Text>
              <Text style={styles.suggSub}>GPS · Auto-detect</Text>
            </View>
            <Icon name="chevron-right" size={16} color={accentColor} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {searching ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={styles.searchingText}>Searching places…</Text>
            </View>
          ) : suggestions.length > 0 ? (
            <>
              <View style={styles.sectionLabel}>
                <Icon name="place" size={12} color="#bbb" />
                <Text style={styles.sectionLabelText}>SUGGESTIONS</Text>
              </View>
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.placeId}
                renderItem={renderSuggestion}
                keyboardShouldPersistTaps="handled"
                style={styles.suggList}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={styles.itemSep} />}
              />
            </>
          ) : searchQuery.length >= 2 ? (
            <View style={styles.emptyRow}>
              <Icon name="search-off" size={28} color="#ddd" />
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptySub}>Try a different name or pin on the map</Text>
            </View>
          ) : null}
        </Animated.View>
      )}

      {/* ── Map ────────────────────────────────────────────── */}
      <View style={styles.mapWrap}>
        {currentLocation ? (
          <MapboxGL.MapView
            ref={mapRef}
            style={styles.map}
            styleURL={MapboxGL.StyleURL.Street}
            logoEnabled={false}
            attributionEnabled={false}
            onPress={(e: any) => {
              const [longitude, latitude] = e.geometry.coordinates;
              handleMapPress({ nativeEvent: { coordinate: { latitude, longitude } } } as any);
            }}
          >
            <MapboxGL.Camera
              ref={cameraRef}
              zoomLevel={13}
              centerCoordinate={[currentLocation.longitude, currentLocation.latitude]}
              animationMode="flyTo"
            />
            <MapboxGL.UserLocation visible={true} />
            {selectedLocation && (
              <MapboxGL.PointAnnotation
                id="selectedLocation"
                coordinate={[selectedLocation.longitude, selectedLocation.latitude]}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: isPickup ? '#2E7D32' : '#E65100', borderWidth: 2, borderColor: '#fff' }} />
              </MapboxGL.PointAnnotation>
            )}
          </MapboxGL.MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={styles.mapPlaceholderText}>Loading map…</Text>
          </View>
        )}

        {/* tap-map hint */}
        {!showSuggestions && !selectedLocation && (
          <View style={styles.mapHint}>
            <Icon name="touch-app" size={14} color="#fff" />
            <Text style={styles.mapHintText}>Tap map to pin a location</Text>
          </View>
        )}

        {/* location loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={[styles.loadingText, { color: accentColor }]}>Getting location…</Text>
            </View>
          </View>
        )}

        {/* current location FAB (shown when suggestions closed) */}
        {!showSuggestions && (
          <TouchableOpacity
            style={[styles.myLocFab, { backgroundColor: accentColor }]}
            onPress={handleUseCurrentLocation}
          >
            <Icon name="my-location" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Bottom sheet: selected location + confirm ──────── */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 8 }]}>
        {selectedLocation ? (
          <View style={[styles.selectedCard, { borderLeftColor: accentColor }]}>
            <View style={[styles.selectedIconBox, { backgroundColor: accentLight }]}>
              <Icon name={isPickup ? 'trip-origin' : 'place'} size={20} color={accentColor} />
            </View>
            <View style={styles.selectedBody}>
              <Text style={[styles.selectedLabel, { color: accentColor }]}>
                {isPickup ? 'PICKUP' : 'DROP'} POINT
              </Text>
              <Text style={styles.selectedAddr} numberOfLines={2}>{selectedLocation.address}</Text>
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); setTimeout(() => inputRef.current?.focus(), 100); }}
            >
              <Icon name="edit" size={16} color={accentColor} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noSelectionHint}>
            <Icon name="info-outline" size={15} color="#bbb" />
            <Text style={styles.noSelectionText}>Search above or tap the map to select a location</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: selectedLocation ? accentColor : '#ccc' }]}
          onPress={handleConfirm}
          disabled={!selectedLocation || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name={isPickup ? 'check-circle' : 'flag'} size={20} color="#fff" />
              <Text style={styles.confirmText}>
                {isPickup ? 'Confirm Pickup' : 'Confirm Drop Point'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F9' },

  // ── Header ──────────────────────────────────────────────────
  header: { paddingHorizontal: 16, paddingBottom: 14, overflow: 'hidden' },
  headerCircle: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -50 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 6 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },

  // ── Search card (inside header) ──────────────────────────────
  searchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 4, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 },
  searchCardFocused: { shadowOpacity: 0.18, elevation: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a', paddingVertical: 4 },
  clearBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },

  // ── Suggestions panel ────────────────────────────────────────
  suggestionsPanel: { backgroundColor: '#fff', marginHorizontal: 12, borderRadius: 18, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8, maxHeight: 340, overflow: 'hidden' },
  currentLocRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  currentLocIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 14 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  sectionLabelText: { fontSize: 10, fontWeight: '700', color: '#ccc', letterSpacing: 1 },
  suggList: { flexGrow: 0 },
  itemSep: { height: 1, backgroundColor: '#F7F7F7', marginLeft: 62 },

  // ── Suggestion card ──────────────────────────────────────────
  suggCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  suggIconBox: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  suggIconBoxDefault: { backgroundColor: '#F5F5F5' },
  suggBody: { flex: 1 },
  suggMain: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  suggSub: { fontSize: 12, color: '#999' },
  suggRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mhBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mhBadgeText: { fontSize: 10, fontWeight: '800' },

  // ── Searching / empty states ─────────────────────────────────
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  searchingText: { fontSize: 14, color: '#999' },
  emptyRow: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#bbb' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center' },

  // ── Map ──────────────────────────────────────────────────────
  mapWrap: { flex: 1, position: 'relative' },
  map: { width: '100%', height: '100%' },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', gap: 12 },
  mapPlaceholderText: { fontSize: 15, color: '#999' },

  mapHint: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  mapHintText: { fontSize: 12, color: '#fff', fontWeight: '500' },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 5 },
  loadingText: { fontSize: 14, fontWeight: '600' },

  myLocFab: { position: 'absolute', right: 14, bottom: 14, width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },

  // ── Bottom sheet ─────────────────────────────────────────────
  bottom: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 14, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 10 },
  selectedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAFAFA', borderRadius: 14, padding: 12, marginBottom: 12, borderLeftWidth: 4 },
  selectedIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  selectedBody: { flex: 1 },
  selectedLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
  selectedAddr: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', lineHeight: 19 },
  editBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },

  noSelectionHint: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', marginBottom: 12 },
  noSelectionText: { fontSize: 13, color: '#bbb', textAlign: 'center' },

  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 16, gap: 9 },
  confirmText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
