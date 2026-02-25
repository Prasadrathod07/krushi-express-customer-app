import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vehiclesAPI } from '../services/vehiclesAPI';

interface Driver {
  _id: string;
  name: string;
  profilePhoto?: string;
  phone?: string;
  email?: string;
  vehicleDetails?: {
    type: string;
    number: string;
    capacity?: string;
    imageUrl?: string;
  };
  rating?: number;
  totalTrips?: number;
  status?: string;
  isVerified?: boolean;
  agriculturalExperience?: {
    years?: number;
  };
  specializations?: Array<{
    cropType: string;
    experience?: number;
  }>;
}

export default function DriverDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const driverId = params.driverId as string;
  
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (driverId) {
      loadDriverDetails();
    }
  }, [driverId]);

  const loadDriverDetails = async () => {
    try {
      setLoading(true);
      const response = await vehiclesAPI.getDriverDetails(driverId);
      
      if (response.ok && response.data) {
        setDriver(response.data);
      } else {
        throw new Error('Failed to load driver details');
      }
    } catch (error: any) {
      console.error('Error loading driver details:', error);
      // Show error message
    } finally {
      setLoading(false);
    }
  };

  const getVehicleIcon = (vehicleType?: string) => {
    if (!vehicleType) return 'directions-car';
    const type = vehicleType.toLowerCase();
    if (type.includes('tempo')) return 'local-shipping';
    if (type.includes('pickup')) return 'airport-shuttle';
    if (type.includes('truck')) return 'local-shipping';
    return 'directions-car';
  };

  const getVehicleColor = (vehicleType?: string) => {
    if (!vehicleType) return '#4CAF50';
    const type = vehicleType.toLowerCase();
    if (type.includes('tempo')) return '#FF9800';
    if (type.includes('pickup')) return '#2196F3';
    if (type.includes('truck')) return '#9C27B0';
    return '#4CAF50';
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
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
          <Text style={styles.headerTitle}>Driver Details</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading driver details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!driver) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
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
          <Text style={styles.headerTitle}>Driver Details</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.errorContainer}>
          <Icon name="error-outline" size={64} color="#ccc" />
          <Text style={styles.errorText}>Driver not found</Text>
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
        <Text style={styles.headerTitle}>Driver Details</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver Profile Section */}
        <View style={styles.profileSection}>
          {driver.profilePhoto ? (
            <Image
              source={{ uri: driver.profilePhoto }}
              style={styles.profileImage}
            />
          ) : (
            <View style={styles.profileImagePlaceholder}>
              <Icon name="person" size={40} color="#4CAF50" />
            </View>
          )}
          <Text style={styles.driverName}>{driver.name}</Text>
          {driver.isVerified && (
            <View style={styles.verifiedBadge}>
              <Icon name="verified" size={16} color="#4CAF50" />
              <Text style={styles.verifiedText}>Verified Driver</Text>
            </View>
          )}
          {driver.rating !== undefined && driver.rating > 0 && (
            <View style={styles.ratingContainer}>
              <Icon name="star" size={20} color="#FFD600" />
              <Text style={styles.ratingText}>{driver.rating.toFixed(1)}</Text>
              {driver.totalTrips !== undefined && driver.totalTrips > 0 && (
                <Text style={styles.tripsText}>({driver.totalTrips} trips)</Text>
              )}
            </View>
          )}
        </View>

        {/* Vehicle Information */}
        {driver.vehicleDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Information</Text>
            
            {/* Vehicle Image */}
            {driver.vehicleDetails.imageUrl ? (
              <Image
                source={{ uri: driver.vehicleDetails.imageUrl }}
                style={styles.vehicleImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.vehicleImagePlaceholder, { backgroundColor: `${getVehicleColor(driver.vehicleDetails.type)}20` }]}>
                <Icon
                  name={getVehicleIcon(driver.vehicleDetails.type)}
                  size={60}
                  color={getVehicleColor(driver.vehicleDetails.type)}
                />
              </View>
            )}

            {/* Vehicle Details */}
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <Icon name="directions-car" size={24} color="#4CAF50" />
                <Text style={styles.infoLabel}>Vehicle Type</Text>
                <Text style={styles.infoValue}>{driver.vehicleDetails.type || 'N/A'}</Text>
              </View>
              
              <View style={styles.infoCard}>
                <Icon name="confirmation-number" size={24} color="#4CAF50" />
                <Text style={styles.infoLabel}>Vehicle Number</Text>
                <Text style={styles.infoValue}>{driver.vehicleDetails.number || 'N/A'}</Text>
              </View>
              
              {driver.vehicleDetails.capacity && (
                <View style={styles.infoCard}>
                  <Icon name="straighten" size={24} color="#4CAF50" />
                  <Text style={styles.infoLabel}>Capacity</Text>
                  <Text style={styles.infoValue}>{driver.vehicleDetails.capacity}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Driver Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Driver Information</Text>
          
          <View style={styles.infoGrid}>
            {driver.phone && (
              <View style={styles.infoCard}>
                <Icon name="phone" size={24} color="#4CAF50" />
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{driver.phone}</Text>
              </View>
            )}
            
            {driver.agriculturalExperience?.years !== undefined && (
              <View style={styles.infoCard}>
                <Icon name="work" size={24} color="#4CAF50" />
                <Text style={styles.infoLabel}>Experience</Text>
                <Text style={styles.infoValue}>{driver.agriculturalExperience.years} years</Text>
              </View>
            )}
            
            {driver.status && (
              <View style={styles.infoCard}>
                <Icon 
                  name={driver.status === 'ONLINE' ? 'check-circle' : 'cancel'} 
                  size={24} 
                  color={driver.status === 'ONLINE' ? '#4CAF50' : '#999'} 
                />
                <Text style={styles.infoLabel}>Status</Text>
                <Text style={[styles.infoValue, { color: driver.status === 'ONLINE' ? '#4CAF50' : '#999' }]}>
                  {driver.status}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Specializations */}
        {driver.specializations && driver.specializations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specializations</Text>
            <View style={styles.specializationsContainer}>
              {driver.specializations.map((spec, index) => (
                <View key={index} style={styles.specializationTag}>
                  <Icon name="eco" size={16} color="#4CAF50" />
                  <Text style={styles.specializationText}>{spec.cropType}</Text>
                </View>
              ))}
            </View>
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
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
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#f8f9fa',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#fff',
    marginBottom: 16,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#fff',
  },
  driverName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  tripsText: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  vehicleImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  vehicleImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  specializationsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specializationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  specializationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
});
