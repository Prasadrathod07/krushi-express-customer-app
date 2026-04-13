import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

export default function NotificationDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshUnreadCount } = useNotifications();
  const params = useLocalSearchParams();
  
  // Parse notification data from params with error handling
  let notification = null;
  try {
    if (params.notification && typeof params.notification === 'string') {
      notification = JSON.parse(params.notification);
    }
  } catch (error) {
    console.error('Error parsing notification data:', error);
    notification = null;
  }
  
  if (!notification) {
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
          <Text style={styles.headerTitle}>Notification</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.errorContainer}>
          <Icon name="error-outline" size={64} color="#ccc" />
          <Text style={styles.errorText}>Notification not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatTime = (dateString?: string) => {
    if (!dateString) return 'Just now';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Just now';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Just now';
    }
  };

  const formatFullDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Mark as read when opened
  useEffect(() => {
    const markAsRead = async () => {
      if (notification && !notification.read) {
        try {
          const notificationId = notification._id || notification.id;
          if (notificationId) {
            await notificationsAPI.markAsRead(notificationId);
            await refreshUnreadCount();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        } catch (error) {
          console.error('Error marking notification as read:', error);
        }
      }
    };
    
    if (notification) {
      markAsRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?._id, notification?.id]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'trip':        return 'directions-car';
      case 'promotion':   return 'local-offer';
      case 'bulk':        return 'campaign';
      case 'khali_gadi':  return 'airport-shuttle';
      default:            return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'trip':        return '#4CAF50';
      case 'promotion':   return '#FF9800';
      case 'bulk':        return '#667eea';
      case 'khali_gadi':  return '#E65100';
      default:            return '#2196F3';
    }
  };

  const renderKhaliGadiCard = () => {
    const m = notification?.metadata;
    if (!m) return null;
    return (
      <View style={styles.driverCard}>
        <Text style={styles.driverCardHeading}>Driver &amp; Vehicle Details</Text>

        {/* Route */}
        <View style={styles.driverRow}>
          <Icon name="route" size={20} color="#E65100" />
          <Text style={styles.driverLabel}>Route</Text>
          <Text style={styles.driverValue}>{m.fromCity} → {m.toCity}</Text>
        </View>

        {/* Departure */}
        {m.depStr && (
          <View style={styles.driverRow}>
            <Icon name="schedule" size={20} color="#E65100" />
            <Text style={styles.driverLabel}>Departure</Text>
            <Text style={styles.driverValue}>{m.depStr}</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Driver name */}
        {m.driverName && (
          <View style={styles.driverRow}>
            <Icon name="person" size={20} color="#555" />
            <Text style={styles.driverLabel}>Driver</Text>
            <Text style={styles.driverValue}>{m.driverName}</Text>
          </View>
        )}

        {/* Phone */}
        {m.driverPhone && (
          <View style={styles.driverRow}>
            <Icon name="phone" size={20} color="#555" />
            <Text style={styles.driverLabel}>Phone</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL(`tel:${m.driverPhone}`);
              }}
            >
              <Text style={[styles.driverValue, styles.phoneLink]}>{m.driverPhone}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.divider} />

        {/* Vehicle type */}
        {m.vehicleType && (
          <View style={styles.driverRow}>
            <Icon name="airport-shuttle" size={20} color="#555" />
            <Text style={styles.driverLabel}>Vehicle Type</Text>
            <Text style={styles.driverValue}>{m.vehicleType}</Text>
          </View>
        )}

        {/* Vehicle number */}
        {m.vehicleNumber && (
          <View style={styles.driverRow}>
            <Icon name="confirmation-number" size={20} color="#555" />
            <Text style={styles.driverLabel}>Vehicle No.</Text>
            <Text style={[styles.driverValue, styles.vehicleNumber]}>{m.vehicleNumber}</Text>
          </View>
        )}

        {/* Capacity */}
        {m.vehicleCapacity && (
          <View style={styles.driverRow}>
            <Icon name="inventory" size={20} color="#555" />
            <Text style={styles.driverLabel}>Capacity</Text>
            <Text style={styles.driverValue}>{m.vehicleCapacity}</Text>
          </View>
        )}

        {/* Model */}
        {m.vehicleModel && (
          <View style={styles.driverRow}>
            <Icon name="directions-car" size={20} color="#555" />
            <Text style={styles.driverLabel}>Model</Text>
            <Text style={styles.driverValue}>{m.vehicleModel}</Text>
          </View>
        )}

        {/* Color */}
        {m.vehicleColor && (
          <View style={styles.driverRow}>
            <Icon name="palette" size={20} color="#555" />
            <Text style={styles.driverLabel}>Color</Text>
            <Text style={styles.driverValue}>{m.vehicleColor}</Text>
          </View>
        )}

        {/* Note */}
        {m.note && (
          <>
            <View style={styles.divider} />
            <View style={styles.driverRow}>
              <Icon name="notes" size={20} color="#555" />
              <Text style={styles.driverLabel}>Note</Text>
              <Text style={styles.driverValue}>{m.note}</Text>
            </View>
          </>
        )}

        {/* Call button */}
        {m.driverPhone && (
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Linking.openURL(`tel:${m.driverPhone}`);
            }}
          >
            <Icon name="call" size={20} color="#fff" />
            <Text style={styles.callBtnText}>Call Driver</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

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
        <Text style={styles.headerTitle}>Notification</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* Sender Info */}
        <View style={styles.senderContainer}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: getNotificationColor(notification?.type || 'system') + '20' },
            ]}
          >
            <Icon
              name={getNotificationIcon(notification?.type || 'system')}
              size={32}
              color={getNotificationColor(notification?.type || 'system')}
            />
          </View>
          <View style={styles.senderInfo}>
            <Text style={styles.senderName}>Krushi Express</Text>
            <Text style={styles.notificationTime}>{formatTime(notification?.createdAt)}</Text>
          </View>
        </View>

        {/* Notification Content */}
        <View style={styles.contentContainer}>
          <Text style={styles.notificationTitle}>{notification?.title || 'Notification'}</Text>
          <Text style={styles.notificationMessage}>{notification?.message || ''}</Text>

          {/* Full Date */}
          {notification?.createdAt && (
            <View style={styles.dateContainer}>
              <Icon name="access-time" size={16} color="#999" />
              <Text style={styles.fullDate}>{formatFullDate(notification.createdAt)}</Text>
            </View>
          )}
        </View>

        {/* Khali Gadi — driver & vehicle details card */}
        {notification?.type === 'khali_gadi' && renderKhaliGadiCard()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7FDF8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  senderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  senderInfo: {
    flex: 1,
  },
  senderName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 14,
    color: '#666',
  },
  contentContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 1,
  },
  notificationTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
    lineHeight: 32,
  },
  notificationMessage: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 24,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  fullDate: {
    fontSize: 14,
    color: '#999',
  },

  // ── Khali Gadi driver card ──
  driverCard: {
    backgroundColor: '#fff',
    marginTop: 12,
    marginHorizontal: 0,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  driverCardHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  driverLabel: {
    fontSize: 13,
    color: '#888',
    width: 100,
    flexShrink: 0,
  },
  driverValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    flex: 1,
  },
  phoneLink: {
    color: '#1565C0',
    textDecorationLine: 'underline',
  },
  vehicleNumber: {
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 6,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E65100',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  callBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
