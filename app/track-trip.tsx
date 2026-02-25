// TrackTripScreen - Full-screen map for live driver tracking (Customer)
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Dimensions } from 'react-native';
import { useTrip } from '../contexts/TripContext';
import { socketManager } from '../services/socketManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TrackTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { activeTrip } = useTrip();
  const tripId = (params.id || activeTrip?._id) as string;

  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [pickupLocation, setPickupLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{
    latitude: number;
    longitude: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<MapView>(null);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Redirect if no active trip
  useEffect(() => {
    if (!activeTrip && !tripId) {
      router.replace('/(tabs)/home');
    }
  }, [activeTrip, tripId]);

  // Initialize pickup location from activeTrip
  useEffect(() => {
    if (activeTrip?.pickupLocation) {
      const coords = activeTrip.pickupLocation.coordinates;
      const loc = { latitude: coords[1], longitude: coords[0] };
      setPickupLocation(loc);
      setLoading(false);
    }
  }, [activeTrip]);

  // Initialize socket and subscribe to driver location updates
  useEffect(() => {
    if (!tripId) return;

    const initSocket = async () => {
      try {
        if (!socketManager.isConnected()) {
          await socketManager.connect();
        }

        const userId = await AsyncStorage.getItem('userId');
        socketManager.subscribeToTrip(tripId, userId || undefined);

        // Handle driver location updates
        const handleDriverLocation = (data: any) => {
          if (data.tripId === tripId && data.driverLocation) {
            const newLocation = {
              latitude: data.driverLocation.latitude,
              longitude: data.driverLocation.longitude,
            };
            setDriverLocation(newLocation);

            // Update route coordinates
            if (pickupLocation) {
              setRouteCoordinates([pickupLocation, newLocation]);
            }
          }
        };

        socketManager.on('driver-location-updated', handleDriverLocation);

        return () => {
          socketManager.off('driver-location-updated', handleDriverLocation);
        };
      } catch (error) {
        console.error('Error initializing socket:', error);
        setLoading(false);
      }
    };

    initSocket();
  }, [tripId, pickupLocation]);

  // Smooth marker animation
  useEffect(() => {
    if (driverLocation && mapRef.current) {
      // Only animate if location changed significantly (>10m)
      if (lastLocationRef.current) {
        const distance = calculateDistance(
          lastLocationRef.current.latitude,
          lastLocationRef.current.longitude,
          driverLocation.latitude,
          driverLocation.longitude
        );
        if (distance < 0.01) return; // Skip if <10m
      }

      lastLocationRef.current = driverLocation;
      mapRef.current.animateToRegion({
        ...driverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [driverLocation]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  if (loading || !pickupLocation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Driver</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Full-screen Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
          showsMyLocationButton={false}
          mapType="standard"
        >
          {/* Pickup Marker */}
          <Marker
            coordinate={pickupLocation}
            title="Pickup Location"
            description={activeTrip?.pickupLocation?.address}
          >
            <View style={styles.pickupMarker}>
              <Icon name="location-on" size={32} color="#4CAF50" />
            </View>
          </Marker>

          {/* Driver Location Marker */}
          {driverLocation && (
            <Marker
              coordinate={driverLocation}
              title="Driver Location"
              description="Driver is here"
            >
              <View style={styles.driverMarker}>
                <Icon name="directions-car" size={32} color="#2196F3" />
              </View>
            </Marker>
          )}

          {/* Route Line */}
          {driverLocation && routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#2196F3"
              strokeWidth={4}
              lineDashPattern={[5, 5]}
            />
          )}
        </MapView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1a1a1a',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  pickupMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  driverMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});

