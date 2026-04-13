// StickyTripBanner - Persistent banner visible on all screens during active trip
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

const TERMINAL_STATES = [
  'COMPLETED',
  'CANCELLED',
  'CUSTOMER_CANCELLED',
  'DRIVER_CANCELLED',
  'REJECTED',
  'DELIVERED',
];

// All active states where the banner should be visible
const ACTIVE_STATES = [
  'REQUESTED',
  'NEGOTIATING',
  'ACCEPTED',
  'ENROUTE_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKED_UP',
  'ENROUTE_TO_DELIVERY',
  'ARRIVED_AT_DELIVERY',
  'DELIVERING',
];

// Returns banner config for each trip state (customer role)
function getCustomerBannerConfig(state: string, otp?: string): {
  icon: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  message: string;
  subMessage?: string;
  buttonLabel: string;
  showOtp: boolean;
} {
  switch (state) {
    case 'REQUESTED':
    case 'NEGOTIATING':
      return {
        icon: 'access-time',
        iconColor: '#FF9800',
        bgColor: '#FFF8E1',
        borderColor: '#FF9800',
        message: 'Looking for a driver...',
        buttonLabel: 'View',
        showOtp: false,
      };
    case 'ACCEPTED':
      return {
        icon: 'check-circle',
        iconColor: '#4CAF50',
        bgColor: '#F1F8E9',
        borderColor: '#4CAF50',
        message: 'Driver is on the way',
        subMessage: otp ? `Your OTP: ${otp}` : undefined,
        buttonLabel: 'Track',
        showOtp: !!otp,
      };
    case 'ENROUTE_TO_PICKUP':
      return {
        icon: 'local-shipping',
        iconColor: '#2196F3',
        bgColor: '#E3F2FD',
        borderColor: '#2196F3',
        message: 'Driver heading to pickup',
        subMessage: otp ? `OTP: ${otp}` : undefined,
        buttonLabel: 'Track',
        showOtp: !!otp,
      };
    case 'ARRIVED_AT_PICKUP':
      return {
        icon: 'place',
        iconColor: '#FF5722',
        bgColor: '#FBE9E7',
        borderColor: '#FF5722',
        message: 'Driver arrived at pickup!',
        subMessage: otp ? `Share OTP: ${otp}` : undefined,
        buttonLabel: 'View OTP',
        showOtp: !!otp,
      };
    case 'PICKED_UP':
      return {
        icon: 'inventory',
        iconColor: '#9C27B0',
        bgColor: '#F3E5F5',
        borderColor: '#9C27B0',
        message: 'Parcel picked up',
        subMessage: 'In transit to destination',
        buttonLabel: 'Track',
        showOtp: false,
      };
    case 'ENROUTE_TO_DELIVERY':
      return {
        icon: 'local-shipping',
        iconColor: '#9C27B0',
        bgColor: '#F3E5F5',
        borderColor: '#9C27B0',
        message: 'Parcel on the way',
        subMessage: 'Delivering to destination',
        buttonLabel: 'Track',
        showOtp: false,
      };
    case 'ARRIVED_AT_DELIVERY':
      return {
        icon: 'place',
        iconColor: '#FF9800',
        bgColor: '#FFF3E0',
        borderColor: '#FF9800',
        message: 'Driver at destination',
        buttonLabel: 'View',
        showOtp: false,
      };
    case 'DELIVERING':
      return {
        icon: 'handshake',
        iconColor: '#4CAF50',
        bgColor: '#F1F8E9',
        borderColor: '#4CAF50',
        message: 'Delivering parcel...',
        buttonLabel: 'View',
        showOtp: false,
      };
    default:
      return {
        icon: 'local-shipping',
        iconColor: '#FF9800',
        bgColor: '#FFF3E0',
        borderColor: '#FF9800',
        message: 'Trip in progress',
        buttonLabel: 'View',
        showOtp: false,
      };
  }
}

export default function StickyTripBanner({ role }: StickyTripBannerProps) {
  const router = useRouter();
  const { activeTrip, clearActiveTrip } = useTrip();

  // Clear active trip if it's in a terminal state
  useEffect(() => {
    if (activeTrip && activeTrip._id) {
      const currentState = activeTrip.currentTripState
        ? String(activeTrip.currentTripState).trim().toUpperCase()
        : null;

      if (currentState && TERMINAL_STATES.includes(currentState)) {
        clearActiveTrip();
      }
    }
  }, [activeTrip, clearActiveTrip]);

  if (!activeTrip || !activeTrip._id) return null;

  const currentState = String(activeTrip.currentTripState || '').trim().toUpperCase();

  // Don't show for terminal states
  if (TERMINAL_STATES.includes(currentState)) return null;

  // Don't show if not an active state we recognise
  if (!ACTIVE_STATES.includes(currentState)) return null;

  const otp = activeTrip.otp || activeTrip.pickupCode;

  // ── Navigate to the active-trip screen (map + OTP) ──
  const handleViewTrip = () => {
    router.push({
      pathname: '/active-trip',
      params: { id: activeTrip._id },
    });
  };

  // ── Driver: go to navigation screen ──
  const handleDriverResume = () => {
    router.push({
      pathname: '/active-trip',
      params: { id: activeTrip._id },
    });
  };

  if (role === 'driver') {
    // Driver banner: show only for accepted+ states
    const driverLabel =
      currentState === 'ACCEPTED' ? 'Go to Pickup' : 'Resume Trip';
    return (
      <View style={[styles.banner, { backgroundColor: '#F1F8E9', borderBottomColor: '#4CAF50' }]}>
        <View style={styles.bannerContent}>
          <Icon name="check-circle" size={20} color="#4CAF50" />
          <Text style={styles.bannerText}>
            {currentState === 'ACCEPTED' ? 'Trip Accepted • Go to Pickup' : 'Trip in Progress'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.bannerButton, { backgroundColor: '#4CAF50' }]} onPress={handleDriverResume}>
          <Text style={styles.bannerButtonText}>{driverLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Customer banner
  const config = getCustomerBannerConfig(currentState, otp);

  return (
    <View style={[styles.banner, { backgroundColor: config.bgColor, borderBottomColor: config.borderColor }]}>
      <View style={styles.bannerContent}>
        <Icon name={config.icon} size={20} color={config.iconColor} />
        <View style={styles.textBlock}>
          <Text style={styles.bannerText}>{config.message}</Text>
          {config.subMessage && (
            <Text style={[styles.subText, config.showOtp && styles.otpText]}>
              {config.subMessage}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.bannerButton, { backgroundColor: config.iconColor }]}
        onPress={handleViewTrip}
      >
        <Text style={styles.bannerButtonText}>{config.buttonLabel}</Text>
      </TouchableOpacity>
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
    borderBottomWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  textBlock: {
    marginLeft: 8,
    flex: 1,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  subText: {
    fontSize: 12,
    color: '#555',
    marginTop: 1,
  },
  otpText: {
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#FF5722',
    letterSpacing: 2,
    fontSize: 13,
  },
  bannerButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
