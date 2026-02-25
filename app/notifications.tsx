import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import React from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '../lib/env';
import { notificationsAPI } from '../services/api';
import { useNotifications } from '../contexts/NotificationContext';

interface Notification {
  _id: string;
  id?: string;
  type: 'trip' | 'promotion' | 'system' | 'bulk';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
}

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    loadNotifications();
    initializeSocket();
    // Refresh unread count when screen loads
    refreshUnreadCount();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const newSocket = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: {
          token: token,
        },
      });

      newSocket.on('connect', () => {
        console.log('✅ Socket.IO connected for notifications');
      });

      newSocket.on('connect_error', async (error: any) => {
        console.error('❌ Socket.IO connection error:', error);
        
        // Check if it's a token expiration error
        if (error.message?.includes('expired') || error.message?.includes('Invalid or expired token')) {
          console.log('⚠️ Token expired, clearing stored token');
          await AsyncStorage.removeItem('userToken');
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Socket.IO disconnected:', reason);
      });

      // Listen for new notifications
      newSocket.on('new-notification', async (data: Notification) => {
        console.log('📬 New notification received:', data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Add to top of notifications list
        setNotifications(prev => [{
          _id: data.id || data._id,
          type: data.type,
          title: data.title,
          message: data.message,
          read: false,
          createdAt: data.createdAt || new Date().toISOString(),
        }, ...prev]);
        
        // Update global unread count
        await refreshUnreadCount();
      });

      // Listen for notification deletion (when admin deletes from dashboard)
      newSocket.on('notification-deleted', async (data: { notificationId: string }) => {
        console.log('🗑️ Notification deleted by admin:', data);
        setNotifications(prev => {
          return prev.filter(n => 
            (n._id !== data.notificationId && n.id !== data.notificationId)
          );
        });
        // Update global unread count
        await refreshUnreadCount();
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await notificationsAPI.getNotifications(1, 50, false);
      
      if (response.ok || response.success) {
        const notificationsData = response.data?.notifications || [];
        setNotifications(notificationsData);
        // Update global unread count
        await refreshUnreadCount();
      }
    } catch (error: any) {
      console.error('Error loading notifications:', error);
      // Only show empty state if it's a network error, not if it's just a timeout
      // Keep existing notifications if available
      if (error.isNetworkError || error.code === 'TIMEOUT_ERROR') {
        // If we have no notifications yet, show empty state
        if (notifications.length === 0) {
          setNotifications([]);
        }
        // Otherwise, keep existing notifications and just log the error
      } else {
        // For other errors, show empty state
        setNotifications([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (id: string) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(notifications.map(n => 
        (n._id === id || n.id === id) ? { ...n, read: true, readAt: new Date().toISOString() } : n
      ));
      // Update global unread count
      await refreshUnreadCount();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      setNotifications(notifications.map(n => ({ ...n, read: true })));
      // Update global unread count
      await refreshUnreadCount();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Note: Delete functionality removed - only admin can delete notifications

  const formatTime = (dateString: string) => {
    if (!dateString) return 'Just now';
    try {
      const date = new Date(dateString);
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
      });
    } catch {
      return 'Just now';
    }
  };

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
        {router.canGoBack() && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backButton}
          >
            <Icon name="arrow-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {router.canGoBack() ? <View style={styles.backButton} /> : (
          unreadCount > 0 && (
            <TouchableOpacity
              onPress={markAllAsRead}
              style={styles.markAllButton}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.container}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="notifications-none" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>You'll see updates and messages here</Text>
            </View>
          ) : (
            notifications.map((notification) => {
              const notificationId = notification._id || notification.id || '';
              const isUnread = !notification.read;
              
              return (
                <TouchableOpacity
                  key={notificationId}
                  style={[
                    styles.notificationItem,
                    isUnread && styles.unreadNotification,
                  ]}
                  onPress={() => {
                    // Navigate to notification detail
                    router.push({
                      pathname: '/notification-detail',
                      params: {
                        notification: JSON.stringify(notification),
                      },
                    });
                    // Mark as read when opened
                    if (isUnread) {
                      markAsRead(notificationId);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: getNotificationColor(notification.type) + '20' },
                    ]}
                  >
                    <Icon
                      name={getNotificationIcon(notification.type)}
                      size={24}
                      color={getNotificationColor(notification.type)}
                    />
                  </View>
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      {isUnread && (
                        <Icon name="close" size={16} color="#999" style={styles.closeIcon} />
                      )}
                    </View>
                    <Text style={styles.notificationMessage} numberOfLines={2}>
                      {notification.message}
                    </Text>
                    <Text style={styles.notificationTime}>
                      {formatTime(notification.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
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
    position: 'relative',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: 0,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  unreadBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    position: 'relative',
  },
  unreadNotification: {
    backgroundColor: '#F7FDF8',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  closeIcon: {
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
});
