import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import { notificationsAPI, customerAPI } from '../services/api';
import * as Haptics from 'expo-haptics';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

interface NotificationContextType {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  lastNotification: any | null;
  socket: Socket | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const refreshUnreadCountRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);

  const refreshUnreadCount = async () => {
    // Don't fetch if user is not logged in
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return;

    // Throttle: Don't refresh if called within last 5 seconds
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 5000) {
      return;
    }
    
    // Prevent concurrent calls
    if (refreshUnreadCountRef.current) {
      return;
    }
    
    try {
      refreshUnreadCountRef.current = true;
      lastRefreshTimeRef.current = now;
      
      const response = await notificationsAPI.getNotifications(1, 1, true); // Just get unread count
      if (response.ok || response.success) {
        setUnreadCount(response.data?.unreadCount || 0);
      }
    } catch (error: any) {
      // Handle rate limit errors gracefully
      if (error.message?.includes('slow down') || error.status === 429) {
        console.log('⚠️ Rate limited on notification fetch, will retry later');
        // Don't update state on rate limit
      } else {
        console.error('Error fetching unread count:', error);
      }
    } finally {
      refreshUnreadCountRef.current = false;
    }
  };

  useEffect(() => {
    // Request notification permissions on mount
    const requestNotificationPermissions = async () => {
      try {
        const { notificationService } = await import('../services/notificationService');
        await notificationService.requestPermissions();
      } catch (error) {
        console.error('Error requesting notification permissions:', error);
      }
    };
    
    requestNotificationPermissions();

    // Register Expo push token with the backend so Khali Gadi can notify this customer
    const registerPushToken = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          console.log('[PushToken] Permission not granted:', status);
          return;
        }
        // SDK 50+ requires projectId — get from EAS config or app.json extra
        const projectId =
          Constants.easConfig?.projectId ||
          Constants.expoConfig?.extra?.eas?.projectId ||
          Constants.expoConfig?.extra?.projectId;
        console.log('[PushToken] projectId:', projectId);
        const pushToken = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        console.log('[PushToken] Expo push token:', pushToken?.data);
        if (pushToken?.data) {
          await customerAPI.savePushToken(
            pushToken.data,
            Platform.OS,
            pushToken.data, // use token as deviceId
          );
          console.log('[PushToken] Token saved to backend');
        }
      } catch (err: any) {
        console.error('[PushToken] Failed to register push token:', err?.message || err);
      }
    };

    // Save customer GPS location so Khali Gadi proximity query works
    const saveLocation = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('[Location] Permission not granted:', status);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        console.log('[Location] Got GPS:', loc.coords.latitude, loc.coords.longitude);
        await customerAPI.updateLocation(loc.coords.latitude, loc.coords.longitude);
        console.log('[Location] Saved to backend');
      } catch (err: any) {
        console.error('[Location] Failed to save location:', err?.message || err);
      }
    };

    registerPushToken();
    saveLocation();

    // Initial load
    refreshUnreadCount();

    // Initialize Socket.IO for real-time updates
    const initializeSocket = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const newSocket = io(SOCKET_URL, {
          transports: ['websocket'],
          auth: { token },
        });

        newSocket.on('connect', () => {
          console.log('✅ Notification context: Socket.IO connected');
          // Ensure socket stays connected globally
          socketRef.current = newSocket;
        });

        newSocket.on('disconnect', () => {
          console.log('⚠️ Notification context: Socket.IO disconnected, will reconnect');
        });

        newSocket.on('reconnect', () => {
          console.log('✅ Notification context: Socket.IO reconnected');
          socketRef.current = newSocket;
        });

        // Listen for new notifications
        newSocket.on('new-notification', (data: any) => {
          console.log('📬 New notification in context:', data);
          
          // Update unread count
          setUnreadCount(prev => prev + 1);
          
          // Store last notification for display
          setLastNotification({
            id: data.id || data._id,
            title: data.title,
            message: data.message,
            type: data.type,
            timestamp: Date.now(),
          });
          
          // Haptic feedback - stronger vibration
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          
          // Auto-clear last notification after 5 seconds
          setTimeout(() => {
            setLastNotification(null);
          }, 5000);
        });

        // Listen for trip-accepted events to send OTP notification (GLOBAL - works from any screen)
        newSocket.on('trip-accepted', async (data: any) => {
          console.log('🎉 Trip accepted event in notification context:', data);
          
          try {
            const { notificationService } = await import('../services/notificationService');
            
            // Send mobile notification with OTP
            if (data.otp) {
              await notificationService.sendNotification(
                '🚗 Driver Accepted Your Ride!',
                `Your driver has accepted! Your OTP is: ${data.otp}\n\nShare this OTP with your driver when they arrive.`,
                { 
                  type: 'trip-accepted', 
                  tripId: data.tripId, 
                  otp: data.otp 
                }
              );
              console.log('✅ OTP notification sent globally:', data.otp);
            } else {
              await notificationService.sendNotification(
                '🚗 Driver Accepted Your Ride!',
                data.message || 'Your driver has accepted! Track them in real-time.',
                { 
                  type: 'trip-accepted', 
                  tripId: data.tripId 
                }
              );
            }
            
            // Show in-app notification banner (temporary - auto-dismisses after 8 seconds)
            if (data.otp) {
              setLastNotification({
                id: `trip-accepted-${data.tripId}`,
                title: '🚗 Trip Accepted • OTP: ' + data.otp,
                message: 'Share this OTP with your driver when they arrive. Tap to track driver.',
                type: 'trip-accepted',
                tripId: data.tripId,
                otp: data.otp,
                timestamp: Date.now(),
              });
              
              // Auto-dismiss after 8 seconds (longer for OTP visibility)
              setTimeout(() => {
                setLastNotification(null);
              }, 8000);
            } else {
              setLastNotification({
                id: `trip-accepted-${data.tripId}`,
                title: '🚗 Trip Accepted',
                message: data.message || 'Your driver has accepted! Track them in real-time.',
                type: 'trip-accepted',
                tripId: data.tripId,
                timestamp: Date.now(),
              });
              
              // Auto-dismiss after 5 seconds
              setTimeout(() => {
                setLastNotification(null);
              }, 5000);
            }
            
            // Haptic feedback
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.error('Error sending trip-accepted notification:', error);
          }
        });

        // Listen for notification deletion
        newSocket.on('notification-deleted', (data: { notificationId: string }) => {
          refreshUnreadCount();
        });

        // Listen for Khali Gadi announcements — filter by customer's own GPS
        newSocket.on('khali-gadi', async (data: any) => {
          console.log('🚛 Khali Gadi event received:', data);
          try {
            // Get customer's current GPS position
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') {
              console.log('[KhaliGadi] Location permission not granted — showing anyway');
            } else {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              const customerLat = loc.coords.latitude;
              const customerLng = loc.coords.longitude;

              // Haversine distance in km
              const R = 6371;
              const dLat = (data.fromLat - customerLat) * Math.PI / 180;
              const dLng = (data.fromLng - customerLng) * Math.PI / 180;
              const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(customerLat * Math.PI / 180) * Math.cos(data.fromLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
              const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              console.log(`[KhaliGadi] Distance to driver: ${distKm.toFixed(2)} km`);

              if (distKm > 10) {
                console.log('[KhaliGadi] Customer too far, ignoring');
                return;
              }
            }

            // Show local push notification
            const { notificationService } = await import('../services/notificationService');
            await notificationService.sendNotification(
              `🚛 Khali Gadi: ${data.fromCity} → ${data.toCity}`,
              `${data.driverName} (${data.vehicleType}) is heading ${data.fromCity}→${data.toCity} at ${data.depStr}. Tap to contact.`,
              { type: 'KHALI_GADI', offerId: data.offerId, driverId: data.driverId }
            );

            // Show in-app banner
            setLastNotification({
              id: `khali-gadi-${data.offerId}`,
              title: `🚛 Khali Gadi: ${data.fromCity} → ${data.toCity}`,
              message: `${data.driverName} (${data.vehicleType}) departing at ${data.depStr}`,
              type: 'KHALI_GADI',
              offerId: data.offerId,
              driverId: data.driverId,
              timestamp: Date.now(),
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            setTimeout(() => setLastNotification(null), 8000);
          } catch (err: any) {
            console.error('[KhaliGadi] Error handling socket event:', err?.message);
          }
        });

        setSocket(newSocket);
        socketRef.current = newSocket;
      } catch (error) {
        console.error('Error initializing notification socket:', error);
      }
    };

    initializeSocket();

    return () => {
      // Don't disconnect - keep socket alive globally
      // if (socket) {
      //   socket.disconnect();
      // }
    };
  }, []);

  // Refresh unread count when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refreshUnreadCount();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnreadCount, lastNotification, socket: socketRef.current }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
