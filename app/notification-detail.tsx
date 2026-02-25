import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
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
      case 'trip':
        return 'directions-car';
      case 'promotion':
        return 'local-offer';
      case 'bulk':
        return 'campaign';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'trip':
        return '#4CAF50';
      case 'promotion':
        return '#FF9800';
      case 'bulk':
        return '#667eea';
      default:
        return '#2196F3';
    }
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
});
