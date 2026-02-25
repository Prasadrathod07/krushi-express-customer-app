// TripAcceptedModal - Popup shown when trip is accepted (Customer & Driver)
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useTrip } from '../contexts/TripContext';

interface TripAcceptedModalProps {
  visible: boolean;
  onClose: () => void;
  role: 'customer' | 'driver';
}

export default function TripAcceptedModal({ visible, onClose, role }: TripAcceptedModalProps) {
  const router = useRouter();
  const { activeTrip } = useTrip();

  if (!activeTrip) return null;

  const otp = activeTrip.otp || activeTrip.pickupCode || 'N/A';

  const handleTrackDriver = () => {
    onClose();
    router.push('/track-trip');
  };

  const handleStartPickup = () => {
    onClose();
    router.push({
      pathname: '/active-trip',
      params: { id: activeTrip._id },
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Icon name="check-circle" size={48} color="#4CAF50" />
            </View>
            <Text style={styles.title}>Trip Accepted</Text>
          </View>

          {role === 'customer' && (
            <View style={styles.content}>
              <View style={styles.otpContainer}>
                <Text style={styles.otpLabel}>Your OTP</Text>
                <Text style={styles.otpValue}>{otp}</Text>
                <Text style={styles.otpHint}>Share this code with your driver</Text>
              </View>

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={onClose}
                >
                  <Text style={styles.buttonSecondaryText}>OK</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={handleTrackDriver}
                >
                  <Text style={styles.buttonPrimaryText}>Track Driver</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {role === 'driver' && (
            <View style={styles.content}>
              <Text style={styles.message}>
                Trip accepted successfully! Navigate to pickup location.
              </Text>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, styles.buttonFull]}
                onPress={handleStartPickup}
              >
                <Text style={styles.buttonPrimaryText}>Start Pickup</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    marginTop: 100, // 100px margin from top
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  content: {
    width: '100%',
  },
  otpContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  otpLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  otpValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FF9800',
    letterSpacing: 8,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  otpHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: '#4CAF50',
  },
  buttonSecondary: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSecondaryText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});

