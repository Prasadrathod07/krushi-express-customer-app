// StickyTripBanner - Persistent OTP banner visible until OTP verified
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useTrip } from '../contexts/TripContext';

interface StickyTripBannerProps {
  role: 'customer' | 'driver';
}

export default function StickyTripBanner({ role }: StickyTripBannerProps) {
  const router = useRouter();
  const { activeTrip, clearActiveTrip } = useTrip();

  // Terminal states where banner should NOT show
  const terminalStates = [
    'COMPLETED',
    'CANCELLED',
    'CUSTOMER_CANCELLED',
    'DRIVER_CANCELLED',
    'REJECTED',
    'DELIVERED',
  ];

  // Clear active trip if it's in a terminal state or invalid
  useEffect(() => {
    if (activeTrip && activeTrip._id) {
      const currentState = activeTrip.currentTripState 
        ? String(activeTrip.currentTripState).trim().toUpperCase() 
        : null;
      
      if (currentState && terminalStates.includes(currentState)) {
        console.log('🧹 StickyTripBanner: Clearing active trip in terminal state:', currentState);
        clearActiveTrip();
      }
    }
  }, [activeTrip, clearActiveTrip]);

  // States where banner should NOT show (more restrictive)
  // Only ACCEPTED state should show the banner
  const nonBannerStates = [
    ...terminalStates,
    'REQUESTED',
    'NEGOTIATING',
    'ENROUTE_TO_PICKUP',
    'ARRIVED_AT_PICKUP',
    'PICKED_UP',
    'ENROUTE_TO_DELIVERY',
    'ARRIVED_AT_DELIVERY',
    'DELIVERING',
  ];

  // Normalize state for comparison (trim whitespace and uppercase)
  const currentState = activeTrip?.currentTripState 
    ? String(activeTrip.currentTripState).trim().toUpperCase() 
    : null;

  // Show banner ONLY when ALL conditions are met:
  // 1. activeTrip exists and has valid _id
  // 2. Trip is EXACTLY in ACCEPTED state (strict check, trimmed and uppercase)
  // 3. OTP exists (otp or pickupCode)
  // 4. OTP is not verified
  // 5. Trip is NOT in any non-banner state
  
  const hasValidId = activeTrip && activeTrip._id && typeof activeTrip._id === 'string';
  const isAcceptedState = currentState === 'ACCEPTED';
  const hasOtp = !!(activeTrip?.otp || activeTrip?.pickupCode);
  const otpNotVerified = activeTrip?.otpVerified !== true && activeTrip?.otpVerified !== 'true';
  const notInNonBannerState = currentState ? !nonBannerStates.includes(currentState) : true;
  
  const shouldShow =
    hasValidId &&
    isAcceptedState &&
    hasOtp &&
    otpNotVerified &&
    notInNonBannerState;

  // Debug log to help troubleshoot
  if (activeTrip && activeTrip._id) {
    if (!shouldShow) {
      console.log('🚫 StickyTripBanner: Not showing because:', {
        hasValidId,
        isAcceptedState,
        currentState,
        hasOtp,
        otpNotVerified,
        otpVerified: activeTrip.otpVerified,
        notInNonBannerState,
        isInNonBannerState: currentState ? nonBannerStates.includes(currentState) : false,
      });
    } else {
      console.log('✅ StickyTripBanner: Showing banner');
    }
  }

  if (!shouldShow) return null;

  const otp = activeTrip.otp || activeTrip.pickupCode || 'N/A';

  const handleTrackDriver = () => {
    router.push('/track-trip');
  };

  const handleGoToPickup = () => {
    router.push({
      pathname: '/active-trip',
      params: { id: activeTrip._id },
    });
  };

  return (
    <View style={styles.banner}>
      {role === 'customer' && (
        <>
          <View style={styles.bannerContent}>
            <Icon name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.bannerText}>
              Trip Accepted • OTP: <Text style={styles.otpText}>{otp}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.bannerButton}
            onPress={handleTrackDriver}
          >
            <Text style={styles.bannerButtonText}>Track Driver</Text>
          </TouchableOpacity>
        </>
      )}

      {role === 'driver' && (
        <>
          <View style={styles.bannerContent}>
            <Icon name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.bannerText}>Trip Accepted • Go to Pickup</Text>
          </View>
          <TouchableOpacity
            style={styles.bannerButton}
            onPress={handleGoToPickup}
          >
            <Text style={styles.bannerButtonText}>Go</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 2,
    borderBottomColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginLeft: 8,
  },
  otpText: {
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#FF9800',
    letterSpacing: 2,
  },
  bannerButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

