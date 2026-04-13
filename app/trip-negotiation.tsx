// Trip Negotiation — WhatsApp-style real-time chat + price offers (Customer App)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { offersAPI } from '../services/offersAPI';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../lib/env';
import { socketManager } from '../services/socketManager';
import { useTrip } from '../contexts/TripContext';

const { width: SW } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offer {
  _id: string;
  tripId: string;
  userId: string;
  userType: 'customer' | 'driver';
  amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  message?: string;
  createdAt: string;
  expiresAt: string;
}

interface ChatMsg {
  _id: string;
  tripId: string;
  senderType: 'customer' | 'driver';
  senderId: string;
  senderName: string;
  message: string;
  createdAt: string;
}

interface Trip {
  _id: string;
  currentTripState: string;
  estimatedFare: number;
  parcelDetails: { budget: number };
  driverId?: string;
  driver?: { name: string; phone: string };
}

type ChatItem =
  | { kind: 'offer'; data: Offer; key: string }
  | { kind: 'msg'; data: ChatMsg; key: string };

// ─── Animated typing dots ─────────────────────────────────────────────────────

function TypingDots() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(450),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);
  return (
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.typingDot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
          />
        ))}
      </View>
      <Text style={styles.typingLabel}>Driver is typing…</Text>
    </View>
  );
}

// ─── Offer bubble ─────────────────────────────────────────────────────────────

interface OfferBubbleProps {
  offer: Offer;
  isMine: boolean;
  submitting: boolean;
  onAccept: (o: Offer) => void;
  onReject: (o: Offer) => void;
}

function OfferBubble({ offer, isMine, submitting, onAccept, onReject }: OfferBubbleProps) {
  const statusColor = offer.status === 'ACCEPTED' ? '#22c55e' : offer.status === 'REJECTED' ? '#ef4444' : offer.status === 'EXPIRED' ? '#9ca3af' : '#f59e0b';
  const statusLabel = offer.status === 'ACCEPTED' ? 'Accepted' : offer.status === 'REJECTED' ? 'Rejected' : offer.status === 'EXPIRED' ? 'Expired' : 'Pending';
  const showActions = !isMine && offer.status === 'PENDING';

  return (
    <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.offerBubble, isMine ? styles.offerBubbleMine : styles.offerBubbleTheirs]}>
        <View style={styles.offerHeader}>
          <Icon name="local-offer" size={14} color={isMine ? '#fff' : '#6366f1'} />
          <Text style={[styles.offerLabel, { color: isMine ? '#fff' : '#6366f1' }]}>
            {isMine ? 'Your Offer' : 'Driver Offer'}
          </Text>
        </View>
        <Text style={[styles.offerAmount, { color: isMine ? '#fff' : '#1f2937' }]}>₹{offer.amount}</Text>
        <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={[styles.bubbleTime, { color: isMine ? '#ffffff88' : '#9ca3af' }]}>
          {new Date(offer.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {showActions && (
          <View style={styles.offerActions}>
            <TouchableOpacity
              style={styles.btnReject}
              onPress={() => onReject(offer)}
              disabled={submitting}
            >
              <Text style={styles.btnRejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnAccept}
              onPress={() => onAccept(offer)}
              disabled={submitting}
            >
              <Text style={styles.btnAcceptText}>Accept ✓</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Text bubble ─────────────────────────────────────────────────────────────

function TextBubble({ msg, isMine }: { msg: ChatMsg; isMine: boolean }) {
  return (
    <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.textBubble, isMine ? styles.textBubbleMine : styles.textBubbleTheirs]}>
        <Text style={[styles.textBubbleMsg, { color: isMine ? '#fff' : '#1f2937' }]}>{msg.message}</Text>
        <Text style={[styles.bubbleTime, { color: isMine ? '#ffffff88' : '#9ca3af' }]}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TripNegotiation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tripId = params.tripId as string;
  const { setActiveTrip, updateTripState, clearActiveTrip } = useTrip();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState<'offer' | 'text'>('offer');
  const [otherTyping, setOtherTyping] = useState(false);
  const [tripRejectedState, setTripRejectedState] = useState<string | null>(null);
  const [negotiationRejected, setNegotiationRejected] = useState<{ rejectorIsDriver: boolean; amount: number } | null>(null);

  const [timeRemaining, setTimeRemaining] = useState(300);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const userIdRef = useRef<string>('');
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<{ amount: number; ts: number } | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
    initSocket();
    return () => {
      stopTimer();
      socketManager.unsubscribeFromTrip(tripId);
      socketManager.off('new-offer',          handleNewOffer);
      socketManager.off('offer-updated',       handleOfferUpdated);
      socketManager.off('chat-message',        handleChatMessage);
      socketManager.off('typing-start',        handleTypingStart);
      socketManager.off('typing-stop',         handleTypingStop);
      socketManager.off('trip-accepted',       handleTripAcceptedNeg);
      socketManager.off('trip-state-updated',  handleTripStateUpdatedNeg);
    };
  }, [tripId]);

  useFocusEffect(useCallback(() => { if (tripId) loadAll(); }, [tripId]));

  useEffect(() => {
    if (offers.length + chatMsgs.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [offers.length, chatMsgs.length, otherTyping]);

  // ── Merged chat items ─────────────────────────────────────────────────────
  const chatItems: ChatItem[] = [
    ...offers.map((o) => ({ kind: 'offer' as const, data: o, key: `offer-${o._id}` })),
    ...chatMsgs.map((m) => ({ kind: 'msg' as const, data: m, key: `msg-${m._id}` })),
  ].sort((a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime());

  const isTripEnded = tripRejectedState != null || (trip?.currentTripState != null && [
    'REJECTED', 'DRIVER_CANCELLED', 'CUSTOMER_CANCELLED', 'CANCELLED', 'COMPLETED',
  ].includes(trip!.currentTripState));

  // ── Timer helpers ─────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    setTimerActive(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    setTimerActive(true);
    setTimeRemaining(300);
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          handleTimerExpiry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetTimer = () => {
    stopTimer();
    setTimeout(startTimer, 50);
  };

  const handleTimerExpiry = async () => {
    stopTimer();
    Alert.alert('Negotiation Expired', 'Time ran out. Trip will be cancelled.', [
      { text: 'OK', onPress: async () => {
        try { await tripsAPI.updateTripState(tripId, 'CUSTOMER_CANCELLED'); } catch {}
        clearActiveTrip();
        router.replace('/(tabs)/rides');
      }},
    ]);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAll = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem('userId');
      if (stored) userIdRef.current = stored;

      const [tripRes, offersRes, msgsRes] = await Promise.all([
        tripsAPI.getTrip(tripId),
        offersAPI.getTripOffers(tripId),
        fetchChatMessages(),
      ]);

      if (tripRes.ok && tripRes.data) {
        const t = tripRes.data as Trip;
        setTrip(t);
        if (['REJECTED', 'DRIVER_CANCELLED', 'CUSTOMER_CANCELLED', 'CANCELLED'].includes(t.currentTripState)) {
          setTripRejectedState(t.currentTripState);
          stopTimer();
        } else {
          // Keep TripContext in sync so the floating banner shows on tabs screens
          setActiveTrip(t);
          setTripRejectedState(null);
          if (inputText === '' && t.parcelDetails?.budget) setInputText(t.parcelDetails.budget.toString());
        }
      }

      if (offersRes.ok && offersRes.data) {
        const sorted = [...offersRes.data].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setOffers(sorted);
        if (!timerActive && sorted.some((o) => o.status === 'PENDING')) startTimer();
      }

      if (msgsRes) setChatMsgs(msgsRes);
    } catch (e) { console.error('loadAll error', e); }
    finally { setLoading(false); }
  };

  const fetchChatMessages = async (): Promise<ChatMsg[]> => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/chat/trip/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json.ok ? json.data : [];
    } catch { return []; }
  };

  // ── Named handlers for socket events (so they can be removed on cleanup) ───

  const handleNewOffer = useCallback((data: any) => {
    const incoming: Offer = data.offer || data;
    if (incoming.tripId?.toString() !== tripId) return;
    setOffers((prev) => {
      if (prev.some((o) => o._id === incoming._id)) return prev;
      const dup = prev.some((o) =>
        o.userId === incoming.userId && Math.abs(o.amount - incoming.amount) < 0.01 &&
        Math.abs(new Date(o.createdAt).getTime() - new Date(incoming.createdAt).getTime()) < 4000
      );
      if (dup) return prev;
      if (lastSentRef.current && incoming.userType === 'customer' &&
          Math.abs(incoming.amount - lastSentRef.current.amount) < 0.01 &&
          Date.now() - lastSentRef.current.ts < 6000) return prev;
      const updated = [...prev, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      if (incoming.status === 'PENDING') resetTimer();
      return updated;
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [tripId]);

  const handleOfferUpdated = useCallback((data: any) => {
    const updated: Offer = data.offer || data;
    if (updated.tripId?.toString() !== tripId) return;
    setOffers((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    if (updated.status === 'ACCEPTED' || updated.status === 'REJECTED') {
      stopTimer();
      if (updated.status === 'REJECTED') {
        // offer.userType = who MADE the offer; rejector is the other party
        // In customer app: offer by 'customer' → driver rejected it
        const rejectorIsDriver = updated.userType === 'customer';
        setNegotiationRejected({ rejectorIsDriver, amount: updated.amount });
        // Immediately clear NEGOTIATING state so the floating banner disappears
        updateTripState(tripId, 'REQUESTED');
      }
    }
  }, [tripId]);

  const handleChatMessage = useCallback((msg: ChatMsg) => {
    if (msg.tripId?.toString() !== tripId) return;
    setChatMsgs((prev) => {
      if (prev.some((m) => m._id === msg._id)) return prev;
      return [...prev, msg];
    });
    if (msg.senderType !== 'customer') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [tripId]);

  const handleTypingStart = useCallback((d: { senderType: string }) => {
    if (d.senderType === 'driver') setOtherTyping(true);
  }, []);

  const handleTypingStop = useCallback((d: { senderType: string }) => {
    if (d.senderType === 'driver') setOtherTyping(false);
  }, []);

  const handleTripAcceptedNeg = useCallback((data: { tripId: string; trip: any; otp?: string }) => {
    if (data.tripId !== tripId) return;
    stopTimer();
    if (data.trip) {
      const td = { ...data.trip, otp: data.otp || data.trip.otp };
      setActiveTrip(td);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Trip Confirmed! 🎉', 'The fare has been agreed. Your driver is on the way.', [
      { text: 'Track Trip', onPress: () => router.replace({ pathname: '/trip-tracking', params: { id: tripId } }) },
    ]);
  }, [tripId]);

  const handleTripStateUpdatedNeg = useCallback((data: { tripId: string; state: string; trip?: any }) => {
    if (data.tripId !== tripId) return;
    updateTripState(tripId, data.state, data.trip);
    if (['REJECTED', 'DRIVER_CANCELLED', 'CUSTOMER_CANCELLED', 'CANCELLED'].includes(data.state)) {
      setTripRejectedState(data.state);
      stopTimer();
      clearActiveTrip();
      setTrip((prev) => prev ? { ...prev, currentTripState: data.state } : prev);
    }
  }, [tripId]);

  // ── Socket ────────────────────────────────────────────────────────────────
  const initSocket = () => {
    // Subscribe to trip room via singleton (no new io() connection)
    AsyncStorage.getItem('userId').then((userId) => {
      socketManager.subscribeToTrip(tripId, userId ?? undefined);
    });
    socketManager.on('new-offer',          handleNewOffer);
    socketManager.on('offer-updated',      handleOfferUpdated);
    socketManager.on('chat-message',       handleChatMessage);
    socketManager.on('typing-start',       handleTypingStart);
    socketManager.on('typing-stop',        handleTypingStop);
    socketManager.on('trip-accepted',      handleTripAcceptedNeg);
    socketManager.on('trip-state-updated', handleTripStateUpdatedNeg);
  };

  // ── Typing emit helpers ───────────────────────────────────────────────────
  const emitTyping = () => {
    socketManager.sendEvent('typing-start', { tripId });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketManager.sendEvent('typing-stop', { tripId });
    }, 2000);
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (text.length > 0) emitTyping();
    else socketManager.sendEvent('typing-stop', { tripId });
  };

  // ── Send offer ────────────────────────────────────────────────────────────
  const handleSendOffer = async () => {
    if (isTripEnded) { Alert.alert('Closed', 'Negotiation is no longer active.'); return; }
    const amount = parseFloat(inputText);
    if (isNaN(amount) || amount <= 0) { Alert.alert('Invalid', 'Enter a valid amount'); return; }
    if (!userIdRef.current) { Alert.alert('Error', 'User not found, please re-login.'); return; }

    setSubmitting(true);
    socketManager.sendEvent('typing-stop', { tripId });

    const optimistic: Offer = {
      _id: `temp-${Date.now()}`,
      tripId,
      userId: userIdRef.current,
      userType: 'customer',
      amount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    setOffers((prev) => [...prev, optimistic].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    setInputText('');
    lastSentRef.current = { amount, ts: Date.now() };
    resetTimer();

    try {
      const res = await offersAPI.createOffer(tripId, amount, userIdRef.current);
      if (res.ok && res.data) {
        setOffers((prev) => {
          const filtered = prev.filter((o) => o._id !== optimistic._id);
          return [...filtered, res.data!].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => { lastSentRef.current = null; }, 6000);
      } else {
        setOffers((prev) => prev.filter((o) => o._id !== optimistic._id));
        lastSentRef.current = null;
        Alert.alert('Error', res.message || 'Failed to send offer');
      }
    } catch (e: any) {
      setOffers((prev) => prev.filter((o) => o._id !== optimistic._id));
      lastSentRef.current = null;
      Alert.alert('Error', e.message || 'Failed to send offer');
    } finally { setSubmitting(false); }
  };

  // ── Send text message ─────────────────────────────────────────────────────
  const handleSendMessage = () => {
    const text = inputText.trim();
    if (!text || isTripEnded) return;
    socketManager.sendEvent('typing-stop', { tripId });
    socketManager.sendEvent('send-chat-message', { tripId, message: text });
    setInputText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Accept / Reject offer ─────────────────────────────────────────────────
  const handleAccept = (offer: Offer) => {
    Alert.alert('Accept Offer', `Accept driver's offer of ₹${offer.amount}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: async () => {
        try {
          setSubmitting(true);
          stopTimer();
          const res = await offersAPI.acceptOffer(offer._id, userIdRef.current);
          if (!res.ok) throw new Error(res.message || 'Failed');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
          Alert.alert('Error', e.message);
        } finally { setSubmitting(false); }
      }},
    ]);
  };

  const handleReject = async (offer: Offer) => {
    try {
      setSubmitting(true);
      await offersAPI.rejectOffer(offer._id, userIdRef.current);
      // Cancel negotiation with this driver — trip gets requeued for another driver
      try { await tripsAPI.cancelNegotiation(tripId); } catch {}
      // Immediately clear NEGOTIATING state so the floating banner disappears
      updateTripState(tripId, 'REQUESTED');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmitting(false); }
  };

  // ── Cancel trip ───────────────────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert('Cancel Trip', 'Are you sure you want to cancel this trip?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
        try {
          await tripsAPI.updateTripState(tripId, 'CUSTOMER_CANCELLED');
          clearActiveTrip();
          router.replace('/(tabs)/rides');
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading negotiation…</Text>
      </View>
    );
  }

  const timerColor = timeRemaining > 120 ? '#22c55e' : timeRemaining > 60 ? '#f59e0b' : '#ef4444';

  // ── Rejection screen ──────────────────────────────────────────────────────
  if (negotiationRejected) {
    const rejectorName = negotiationRejected.rejectorIsDriver
      ? (trip?.driver?.name || 'Driver')
      : 'You';
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/rides')} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Negotiate Fare</Text>
          </View>
          <View style={{ width: 30 }} />
        </View>
        <View style={styles.rejectionScreen}>
          <View style={styles.rejectionIconWrap}>
            <Icon name="cancel" size={60} color="#ef4444" />
          </View>
          <Text style={styles.rejectionTitle}>Negotiation Ended</Text>
          <Text style={styles.rejectionAmount}>₹{negotiationRejected.amount} offer was rejected</Text>
          <Text style={styles.rejectionBy}>
            by <Text style={{ fontWeight: '800' }}>{rejectorName}</Text>
          </Text>
          <TouchableOpacity
            style={styles.rejectionCloseBtn}
            onPress={() => router.replace({ pathname: '/searching-drivers', params: { tripId } })}
          >
            <Text style={styles.rejectionCloseBtnText}>Search Another Driver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Negotiate Fare</Text>
          {trip && (
            <Text style={styles.headerSub}>Budget: ₹{trip.parcelDetails?.budget ?? trip.estimatedFare}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {timerActive && (
            <Text style={[styles.timerText, { color: timerColor }]}>{fmt(timeRemaining)}</Text>
          )}
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} disabled={isTripEnded}>
            <Icon name="close" size={20} color={isTripEnded ? '#6b7280' : '#ef4444'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Status banner */}
      {isTripEnded && (
        <View style={styles.endedBanner}>
          <Icon name="info-outline" size={16} color="#fff" />
          <Text style={styles.endedText}>
            {tripRejectedState === 'DRIVER_CANCELLED' ? 'Driver cancelled this trip' :
             tripRejectedState === 'CUSTOMER_CANCELLED' ? 'You cancelled this trip' :
             tripRejectedState === 'REJECTED' ? 'Negotiation closed — no agreement reached' :
             'This negotiation has ended'}
          </Text>
          <TouchableOpacity style={styles.endedGoBackBtn} onPress={() => router.replace('/(tabs)/rides')}>
            <Text style={styles.endedGoBackTxt}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat scroll */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {chatItems.length === 0 && (
          <View style={styles.emptyChat}>
            <Icon name="chat-bubble-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyChatText}>Send a price offer or message to start negotiating</Text>
          </View>
        )}
        {chatItems.map((item) => {
          if (item.kind === 'offer') {
            const isMine = item.data.userType === 'customer';
            return (
              <OfferBubble
                key={item.key}
                offer={item.data}
                isMine={isMine}
                submitting={submitting}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            );
          }
          const isMine = item.data.senderType === 'customer';
          return <TextBubble key={item.key} msg={item.data} isMine={isMine} />;
        })}
        {otherTyping && <TypingDots />}
      </ScrollView>

      {/* Input section */}
      {!isTripEnded && (
        <View style={styles.inputSection}>
          {/* Mode tabs */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, inputMode === 'offer' && styles.modeTabActive]}
              onPress={() => { setInputMode('offer'); setInputText(''); }}
            >
              <Text style={[styles.modeTabText, inputMode === 'offer' && styles.modeTabTextActive]}>💰 Price Offer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, inputMode === 'text' && styles.modeTabActive]}
              onPress={() => { setInputMode('text'); setInputText(''); }}
            >
              <Text style={[styles.modeTabText, inputMode === 'text' && styles.modeTabTextActive]}>💬 Message</Text>
            </TouchableOpacity>
          </View>
          {/* Input row */}
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {inputMode === 'offer' && (
              <View style={styles.currencyPrefix}>
                <Text style={styles.currencyPrefixText}>₹</Text>
              </View>
            )}
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={handleInputChange}
              placeholder={inputMode === 'offer' ? 'Enter amount…' : 'Type a message…'}
              placeholderTextColor="#9ca3af"
              keyboardType={inputMode === 'offer' ? 'numeric' : 'default'}
              returnKeyType="send"
              onSubmitEditing={inputMode === 'offer' ? handleSendOffer : handleSendMessage}
              editable={!isTripEnded && !submitting}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || submitting) && styles.sendBtnDisabled]}
              onPress={inputMode === 'offer' ? handleSendOffer : handleSendMessage}
              disabled={!inputText.trim() || submitting || isTripEnded}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name="send" size={20} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f4f6' },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 15 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#9ca3af', fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timerText: { fontSize: 15, fontWeight: '700', minWidth: 40, textAlign: 'right' },
  cancelBtn: { padding: 4 },

  // Ended banner
  endedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  endedText: { color: '#d1d5db', fontSize: 13, flex: 1 },
  endedGoBackBtn: { backgroundColor: '#4b5563', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  endedGoBackTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Chat
  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingVertical: 16, gap: 4 },
  emptyChat: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyChatText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', maxWidth: 240 },

  // Row alignment
  row: { marginVertical: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowLeft: { alignItems: 'flex-start' },

  // Offer bubble
  offerBubble: {
    maxWidth: SW * 0.72,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  offerBubbleMine: { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  offerBubbleTheirs: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  offerHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  offerLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  offerAmount: { fontSize: 28, fontWeight: '800', marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnReject: { flex: 1, borderRadius: 8, paddingVertical: 8, borderWidth: 1.5, borderColor: '#ef4444', alignItems: 'center' },
  btnRejectText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  btnAccept: { flex: 1, borderRadius: 8, paddingVertical: 8, backgroundColor: '#22c55e', alignItems: 'center' },
  btnAcceptText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Text bubble
  textBubble: {
    maxWidth: SW * 0.72,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textBubbleMine: { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  textBubbleTheirs: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  textBubbleMsg: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },

  // Typing indicator
  typingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4, marginTop: 4 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, elevation: 2 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6366f1' },
  typingLabel: { color: '#9ca3af', fontSize: 12 },

  // Input section
  inputSection: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  modeTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  modeTabActive: { borderBottomWidth: 2, borderBottomColor: '#6366f1' },
  modeTabText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  modeTabTextActive: { color: '#6366f1' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  currencyPrefix: {
    width: 36,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 12,
  },
  currencyPrefixText: { fontSize: 18, fontWeight: '800', color: '#6366f1' },
  textInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#c4b5fd' },

  // Rejection screen
  rejectionScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  rejectionIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  rejectionTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937', marginTop: 4 },
  rejectionAmount: { fontSize: 15, color: '#6b7280', marginTop: 4 },
  rejectionBy: { fontSize: 18, color: '#1f2937', marginTop: 4 },
  rejectionCloseBtn: { marginTop: 28, backgroundColor: '#ef4444', borderRadius: 14, paddingHorizontal: 48, paddingVertical: 14 },
  rejectionCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
