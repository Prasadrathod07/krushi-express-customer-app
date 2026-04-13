import {
  View,
  Text,
  StyleSheet,
  SectionList,
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
import { useLanguage } from '../contexts/LanguageContext';

interface Notification {
  _id: string;
  id?: string;
  type: 'trip' | 'promotion' | 'system' | 'bulk' | 'khali_gadi';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
  metadata?: { action?: string; tripId?: string; [key: string]: any };
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  trip:       { icon: 'local-shipping', color: '#2E7D32', bg: '#E8F5E9', label: 'Trip' },
  promotion:  { icon: 'local-offer',    color: '#E65100', bg: '#FFF3E0', label: 'Offer' },
  bulk:       { icon: 'campaign',       color: '#6A1B9A', bg: '#F3E5F5', label: 'Update' },
  system:     { icon: 'info',           color: '#1565C0', bg: '#E3F2FD', label: 'System' },
  khali_gadi: { icon: 'airport-shuttle', color: '#E65100', bg: '#FFF3E0', label: 'Khali Gadi' },
};

const getTypeConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.system;

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
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch { return 'Just now'; }
};

const groupByDate = (notifications: Notification[], todayLabel: string, yesterdayLabel: string, earlierLabel: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const sections: { title: string; data: Notification[] }[] = [];
  const groups: { key: string; label: string; data: Notification[] }[] = [
    { key: 'today',     label: todayLabel,     data: [] },
    { key: 'yesterday', label: yesterdayLabel, data: [] },
    { key: 'earlier',   label: earlierLabel,   data: [] },
  ];

  notifications.forEach(n => {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) groups[0].data.push(n);
    else if (d.getTime() === yesterday.getTime()) groups[1].data.push(n);
    else groups[2].data.push(n);
  });

  groups.forEach(({ label, data }) => {
    if (data.length > 0) sections.push({ title: label, data });
  });
  return sections;
};

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    loadNotifications();
    initializeSocket();
    refreshUnreadCount();
    return () => { if (socket) socket.disconnect(); };
  }, []);

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const newSocket = io(SOCKET_URL, { transports: ['websocket'], auth: { token } });
      newSocket.on('connect_error', async (error: any) => {
        if (error.message?.includes('expired') || error.message?.includes('Invalid or expired token')) {
          await AsyncStorage.removeItem('userToken');
        }
      });
      newSocket.on('new-notification', async (data: Notification) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setNotifications(prev => [{ _id: data.id || data._id, type: data.type, title: data.title, message: data.message, read: false, createdAt: data.createdAt || new Date().toISOString() }, ...prev]);
        await refreshUnreadCount();
      });
      newSocket.on('notification-deleted', async (data: { notificationId: string }) => {
        setNotifications(prev => prev.filter(n => n._id !== data.notificationId && n.id !== data.notificationId));
        await refreshUnreadCount();
      });
      setSocket(newSocket);
    } catch (error) { console.error('Socket connection error:', error); }
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await notificationsAPI.getNotifications(1, 50, false);
      if (response.ok || response.success) {
        setNotifications(response.data?.notifications || []);
        await refreshUnreadCount();
      }
    } catch (error: any) {
      if (!error.isNetworkError && error.code !== 'TIMEOUT_ERROR') setNotifications([]);
    } finally { setLoading(false); setRefreshing(false); }
  };

  const markAsRead = async (id: string) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => (n._id === id || n.id === id) ? { ...n, read: true } : n));
      await refreshUnreadCount();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      await refreshUnreadCount();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  };

  const sections = groupByDate(notifications, t.notifications.today, t.notifications.yesterday, t.notifications.earlier);

  const renderItem = ({ item: notification }: { item: Notification }) => {
    const id = notification._id || notification.id || '';
    const isUnread = !notification.read;
    const cfg = getTypeConfig(notification.type);

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.cardUnread]}
        onPress={() => {
          if (isUnread) markAsRead(id);
          // Rating notifications → go straight to rating screen
          if (notification.metadata?.action === 'RATE_DRIVER' && notification.metadata?.tripId) {
            router.push({ pathname: '/rate-trip', params: { tripId: notification.metadata.tripId } });
            return;
          }
          router.push({ pathname: '/notification-detail', params: { notification: JSON.stringify(notification) } });
        }}
        activeOpacity={0.75}
      >
        {isUnread && <View style={[styles.unreadBar, { backgroundColor: cfg.color }]} />}
        <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
          <Icon name={cfg.icon as any} size={22} color={cfg.color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={[styles.typePill, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.typePillText, { color: cfg.color }]}>
              {notification.type === 'trip' ? t.notifications.trip :
               notification.type === 'promotion' ? t.notifications.offer :
               notification.type === 'bulk' ? t.notifications.update :
               notification.type === 'khali_gadi' ? 'Khali Gadi' :
               t.notifications.system}
            </Text>
            </View>
            <Text style={styles.timeText}>{formatTime(notification.createdAt)}</Text>
          </View>
          <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.cardMessage} numberOfLines={2}>{notification.message}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerDecCircle} />
        <View style={styles.headerRow}>
          {router.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
              <Icon name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t.notifications.title}</Text>
            {unreadCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllAsRead}>
              <Icon name="done-all" size={16} color="#A5D6A7" />
              <Text style={styles.markAllText}>{t.notifications.markAllRead}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconBox}>
            <Icon name="notifications-none" size={48} color="#A5D6A7" />
          </View>
          <Text style={styles.emptyTitle}>{t.notifications.noNotifications}</Text>
          <Text style={styles.emptySub}>{t.notifications.noNotificationsSub}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id || item.id || Math.random().toString()}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(); }} tintColor="#4CAF50" />}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F9' },

  // ── Header ──
  header: { backgroundColor: '#2E7D32', paddingBottom: 20, paddingHorizontal: 16, overflow: 'hidden', position: 'relative' },
  headerDecCircle: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerBadge: { backgroundColor: '#FF5252', borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 7, justifyContent: 'center', alignItems: 'center' },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  markAllText: { fontSize: 12, color: '#A5D6A7', fontWeight: '600' },

  // ── Section header ──
  sectionHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 1, textTransform: 'uppercase' },

  // ── Card ──
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 14, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, overflow: 'hidden' },
  cardUnread: { backgroundColor: '#FAFFFE' },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  iconBox: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  typePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  timeText: { fontSize: 11, color: '#bbb', fontWeight: '500' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 3 },
  cardTitleUnread: { color: '#1a1a1a', fontWeight: '700' },
  cardMessage: { fontSize: 13, color: '#888', lineHeight: 18 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#4CAF50', marginTop: 4, flexShrink: 0 },

  // ── Loading / Empty ──
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: '#999' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  emptyIconBox: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  emptySub: { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 22 },
});
