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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { placesAPI, PlaceSuggestion } from '../services/placesAPI';

export default function SelectLocation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const locationType = (params.type as string) || 'pickup';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  
  const mapRef = useRef<MapView>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    requestLocationPermission();
    loadStoredLocation();
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...selectedLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  }, [selectedLocation]);

  // Debounced search for autocomplete
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery.length >= 2) {
      // User is typing - clear selected location to allow new search
      if (selectedLocation && selectedLocation.address !== trimmedQuery) {
        // Don't clear if it's the same as current selection
        // This allows user to edit the address
      }
      
      setSearching(true);
      setShowSuggestions(true);
      
      searchTimeoutRef.current = setTimeout(() => {
        handleAutocompleteSearch(trimmedQuery);
      }, 300); // 300ms debounce
    } else if (trimmedQuery.length === 0) {
      // Search cleared - hide suggestions but keep selected location
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
    } else {
      // 1 character - show suggestions container but wait for more input
      setSuggestions([]);
      setShowSuggestions(false);
      setSearching(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setCurrentLocation(coords);

      // Only auto-set location if no stored location exists AND search query is empty
      if (!selectedLocation && !searchQuery) {
        const [address] = await Location.reverseGeocodeAsync(coords);
        if (address) {
          const addressString = `${address.street || ''} ${address.city || ''} ${address.region || ''}`.trim();
          setSelectedLocation({
            ...coords,
            address: addressString || 'Current Location',
          });
          // Don't set searchQuery here - let user type to search
        }
      }

      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...coords,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const loadStoredLocation = async () => {
    try {
      const key = locationType === 'pickup' ? 'pickupLocation' : 'dropLocation';
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const location = JSON.parse(stored);
        setSelectedLocation(location);
        // Set search query but don't prevent user from searching
        setSearchQuery(location.address);
      }
    } catch (error) {
      console.error('Error loading stored location:', error);
    }
  };

  const handleAutocompleteSearch = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    try {
      console.log('🔍 Searching for:', query);
      const response = await placesAPI.getAutocomplete(
        query.trim(),
        currentLocation || undefined,
        50000 // 50km radius
      );

      console.log('📥 Autocomplete response:', response);
      
      if (response.ok && response.data && Array.isArray(response.data)) {
        console.log(`✅ Found ${response.data.length} suggestions`);
        setSuggestions(response.data);
        setShowSuggestions(true);
      } else {
        console.log('⚠️  No suggestions in response');
        setSuggestions([]);
      }
    } catch (error) {
      console.error('❌ Error fetching autocomplete:', error);
      // Fallback to expo-location geocoding
      try {
        const results = await Location.geocodeAsync(query);
        if (results.length > 0) {
          const result = results[0];
          setSuggestions([{
            placeId: `geocode_${result.latitude}_${result.longitude}`,
            description: query,
            mainText: query,
            secondaryText: '',
            isMaharashtra: false,
            types: [],
          }]);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
        }
      } catch (geocodeError) {
        console.error('❌ Geocoding fallback error:', geocodeError);
        setSuggestions([]);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchQuery(suggestion.description);
    setShowSuggestions(false);
    Keyboard.dismiss();
    setLoading(true);

    try {
      // Get place details
      if (suggestion.placeId.startsWith('geocode_')) {
        // Handle geocoded result
        const [lat, lng] = suggestion.placeId.replace('geocode_', '').split('_');
        const location = {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          address: suggestion.description,
        };
        setSelectedLocation(location);
      } else {
        const response = await placesAPI.getPlaceDetails(suggestion.placeId);
        if (response.ok && response.data) {
          const location = {
            latitude: response.data.latitude,
            longitude: response.data.longitude,
            address: response.data.address,
          };
          setSelectedLocation(location);

          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }, 1000);
          }
        }
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      Alert.alert('Error', 'Failed to get location details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    setLoading(true);
    setShowSuggestions(false);
    Keyboard.dismiss();
    
    try {
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const addressString = address
        ? `${address.street || ''} ${address.city || ''} ${address.region || ''}`.trim()
        : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      
      setSelectedLocation({
        latitude,
        longitude,
        address: addressString,
      });
      setSearchQuery(addressString);
    } catch (error) {
      console.error('Error getting address:', error);
      setSelectedLocation({
        latitude,
        longitude,
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!currentLocation) {
      await requestLocationPermission();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setShowSuggestions(false);
    Keyboard.dismiss();

    try {
      const [address] = await Location.reverseGeocodeAsync(currentLocation);
      const addressString = address
        ? `${address.street || ''} ${address.city || ''} ${address.region || ''}`.trim()
        : 'Current Location';
      
      setSelectedLocation({
        ...currentLocation,
        address: addressString,
      });
      setSearchQuery(addressString);

      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...currentLocation,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      }
    } catch (error) {
      console.error('Error getting current location address:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedLocation) {
      Alert.alert('Required', 'Please select a location on the map.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    const key = locationType === 'pickup' ? 'pickupLocation' : 'dropLocation';
    await AsyncStorage.setItem(key, JSON.stringify(selectedLocation));

    // If drop location is confirmed, check if both locations are set
    if (locationType === 'drop') {
      console.log('🔍 Drop location confirmed, checking for pickup location...');
      try {
        const pickupStored = await AsyncStorage.getItem('pickupLocation');
        console.log('📦 Pickup stored:', pickupStored ? 'Found' : 'Not found');
        
        if (pickupStored) {
          const pickupLocation = JSON.parse(pickupStored);
          console.log('📍 Pickup location:', pickupLocation);
          console.log('📍 Drop location:', selectedLocation);
          
          // Validate both locations have coordinates
          const hasPickupCoords = pickupLocation.latitude && pickupLocation.longitude;
          const hasDropCoords = selectedLocation.latitude && selectedLocation.longitude;
          
          console.log('✅ Pickup coords valid:', hasPickupCoords);
          console.log('✅ Drop coords valid:', hasDropCoords);
          
          if (hasPickupCoords && hasDropCoords) {
            // Both locations are set and valid - navigate directly to step 2
            console.log('✅✅ Both locations confirmed, navigating to step 2');
            
            // Navigate immediately (no setTimeout needed)
            router.push({
              pathname: '/book-ride',
              params: {
                step: '2',
                pickupLat: pickupLocation.latitude.toString(),
                pickupLng: pickupLocation.longitude.toString(),
                pickupAddress: pickupLocation.address || 'Pickup Location',
                dropLat: selectedLocation.latitude.toString(),
                dropLng: selectedLocation.longitude.toString(),
                dropAddress: selectedLocation.address || 'Drop Location',
              },
            });
            return;
          } else {
            console.log('⚠️ Locations missing coordinates - Pickup:', hasPickupCoords, 'Drop:', hasDropCoords);
          }
        } else {
          console.log('⚠️ Pickup location not found in storage');
        }
      } catch (error) {
        console.error('❌ Error checking locations:', error);
      }
    } else {
      console.log('📍 Pickup location confirmed, returning to home');
    }

    // Default: go back to home (for pickup location or if drop location check fails)
    router.back();
  };

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
          <Icon name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Select {locationType === 'pickup' ? 'Pickup' : 'Drop'} Location
        </Text>
        <View style={styles.backButton} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={24} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search city, village, or place..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onFocus={() => {
              // Always show suggestions when focused if there are any
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              } else if (searchQuery.length >= 2) {
                // If user has typed 2+ chars, trigger search
                handleAutocompleteSearch(searchQuery);
                setShowSuggestions(true);
              }
            }}
            onBlur={() => {
              // Don't hide suggestions immediately on blur - let user select
              // Suggestions will hide when user selects one
            }}
          />
          {searching && (
            <ActivityIndicator size="small" color="#4CAF50" style={styles.searchLoader} />
          )}
          {searchQuery.length > 0 && !searching && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSuggestions([]);
                setShowSuggestions(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Icon name="close" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.currentLocationButton}
          onPress={handleUseCurrentLocation}
        >
          <Icon name="my-location" size={20} color="#4CAF50" />
        </TouchableOpacity>
      </View>

      {/* Autocomplete Suggestions */}
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          {searching ? (
            <View style={styles.suggestionItem}>
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text style={[styles.suggestionMainText, { marginLeft: 12 }]}>Searching...</Text>
            </View>
          ) : suggestions.length > 0 ? (
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.placeId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.suggestionIcon}>
                    <Icon
                      name={item.isMaharashtra ? 'location-city' : 'place'}
                      size={20}
                      color={item.isMaharashtra ? '#4CAF50' : '#666'}
                    />
                  </View>
                  <View style={styles.suggestionText}>
                    <Text style={styles.suggestionMainText}>{item.mainText}</Text>
                    {item.secondaryText && (
                      <Text style={styles.suggestionSecondaryText} numberOfLines={1}>
                        {item.secondaryText}
                      </Text>
                    )}
                  </View>
                  {item.isMaharashtra && (
                    <View style={styles.maharashtraBadge}>
                      <Text style={styles.maharashtraBadgeText}>MH</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
              style={styles.suggestionsList}
            />
          ) : searchQuery.length >= 2 ? (
            <View style={styles.suggestionItem}>
              <Text style={styles.suggestionMainText}>No results found</Text>
              <Text style={styles.suggestionSecondaryText}>Try a different search term</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Map */}
      <View style={styles.mapContainer}>
        {currentLocation ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            onPress={handleMapPress}
            showsUserLocation={true}
            showsMyLocationButton={false}
            mapType="standard"
          >
            {selectedLocation && (
              <Marker
                coordinate={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                }}
                title={selectedLocation.address}
                pinColor={locationType === 'pickup' ? '#4CAF50' : '#FF9800'}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.mapPlaceholderText}>Loading map...</Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#4CAF50" />
          </View>
        )}
      </View>

      {/* Selected Location Card */}
      {selectedLocation && (
        <View style={styles.locationCard}>
          <View style={styles.locationIcon}>
            <Icon
              name={locationType === 'pickup' ? 'location-on' : 'place'}
              size={24}
              color={locationType === 'pickup' ? '#4CAF50' : '#FF9800'}
            />
          </View>
          <View style={styles.locationInfo}>
            <Text style={styles.locationLabel}>
              {locationType === 'pickup' ? 'Pickup' : 'Drop'} Location
            </Text>
            <Text style={styles.locationAddress} numberOfLines={2}>
              {selectedLocation.address}
            </Text>
          </View>
        </View>
      )}

      {/* Confirm Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, !selectedLocation && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!selectedLocation || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.confirmButtonText}>Confirm Location</Text>
              <Icon name="check" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  searchLoader: {
    marginLeft: 8,
  },
  currentLocationButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsContainer: {
    maxHeight: 300,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  suggestionsList: {
    flexGrow: 0,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMainText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  suggestionSecondaryText: {
    fontSize: 14,
    color: '#666',
  },
  maharashtraBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  maharashtraBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    margin: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  locationAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});
