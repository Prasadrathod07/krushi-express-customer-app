import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, TextInput,
  ActivityIndicator, Alert, ScrollView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../lib/env';
import { useTrip } from '../contexts/TripContext';

const QUICK_TAGS = [
  { id: 'ontime',   label: 'On Time',        icon: 'schedule'       },
  { id: 'polite',   label: 'Polite',          icon: 'sentiment-satisfied' },
  { id: 'safe',     label: 'Safe Driving',    icon: 'security'       },
  { id: 'clean',    label: 'Clean Vehicle',   icon: 'cleaning-services' },
  { id: 'helpful',  label: 'Helpful',         icon: 'volunteer-activism' },
  { id: 'careful',  label: 'Handled Carefully', icon: 'inventory-2' },
];

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'];

export default function RateTrip() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tripId = params.tripId as string;
  const { clearActiveTrip } = useTrip();

  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [tripFare, setTripFare] = useState<number | null>(null);

  useEffect(() => {
    loadTripAndRating();
  }, [tripId]);

  const loadTripAndRating = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      // Load trip info for driver name + fare
      const tripRes = await fetch(`${API_URL}/api/trips/${tripId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (tripRes.ok) {
        const td = await tripRes.json();
        const t = td.data || td;
        const d = t.driver || (typeof t.driverId === 'object' ? t.driverId : null);
        if (d?.name) setDriverName(d.name);
        if (t.estimatedFare) setTripFare(t.estimatedFare);
      }
      // Check existing rating
      const ratingRes = await fetch(`${API_URL}/api/trips/${tripId}/rating`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (ratingRes.ok) {
        const rd = await ratingRes.json();
        if (rd.data) {
          setAlreadyRated(true);
          setRating(rd.data.rating);
          setComment(rd.data.comment || '');
        }
      }
    } catch {}
    finally { setLoading(false); }
  };

  const toggleTag = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating first.');
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const selectedTagLabels = tags.map(id => QUICK_TAGS.find(t => t.id === id)?.label).filter(Boolean);
      const fullComment = [
        selectedTagLabels.length ? selectedTagLabels.join(', ') : '',
        comment.trim(),
      ].filter(Boolean).join(' · ');

      const response = await fetch(`${API_URL}/api/trips/${tripId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, comment: fullComment || undefined }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        clearActiveTrip();
        router.replace('/(tabs)/home');
      } else {
        throw new Error(data.message || 'Failed to submit rating');
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to submit rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.loadWrap}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity style={st.skipBtn} onPress={() => { clearActiveTrip(); router.replace('/(tabs)/home'); }}>
            <Text style={st.skipTxt}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Driver avatar + name */}
        <View style={st.driverSection}>
          <View style={st.avatarCircle}>
            <Text style={st.avatarLetter}>
              {(driverName || 'D').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={st.howWas}>How was your experience?</Text>
          {driverName && <Text style={st.driverNameTxt}>{driverName}</Text>}
          {tripFare && <Text style={st.fareTxt}>₹{tripFare} · Trip Completed</Text>}
        </View>

        {/* Star rating */}
        <View style={st.starsRow}>
          {[1, 2, 3, 4, 5].map(star => (
            <TouchableOpacity
              key={star}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRating(star);
              }}
              activeOpacity={0.7}
            >
              <Icon
                name={star <= rating ? 'star' : 'star-outline'}
                size={52}
                color={star <= rating ? '#F59E0B' : '#D1D5DB'}
              />
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && (
          <Text style={st.ratingLabel}>{RATING_LABELS[rating]}</Text>
        )}

        {/* Quick tag chips — show if rated ≥ 3 */}
        {rating >= 3 && (
          <View style={st.tagsSection}>
            <Text style={st.tagsSectionLabel}>What went well?</Text>
            <View style={st.tagsWrap}>
              {QUICK_TAGS.map(t => {
                const sel = tags.includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[st.tagChip, sel && st.tagChipSel]}
                    onPress={() => toggleTag(t.id)}
                    activeOpacity={0.8}
                  >
                    <Icon name={t.icon} size={15} color={sel ? '#16A34A' : '#6B7280'} />
                    <Text style={[st.tagTxt, sel && st.tagTxtSel]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Comment box */}
        <View style={st.commentBox}>
          <TextInput
            style={st.commentInput}
            placeholder="Add a comment (optional)…"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
          />
          <Text style={st.charCount}>{comment.length}/500</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[st.submitBtn, rating === 0 && st.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <>
                <Icon name="star" size={20} color="#fff" />
                <Text style={st.submitTxt}>
                  {alreadyRated ? 'Update Rating' : 'Submit Rating'}
                </Text>
              </>
          }
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#fff' },
  loadWrap:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:  { paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  skipBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  skipTxt: { fontSize: 15, color: '#9CA3AF', fontWeight: '600' },

  driverSection: { alignItems: 'center', paddingTop: 16, paddingBottom: 24 },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#16A34A',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#16A34A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  avatarLetter:  { fontSize: 36, fontWeight: '800', color: '#fff' },
  howWas:        { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  driverNameTxt: { fontSize: 15, color: '#374151', fontWeight: '500', marginBottom: 4 },
  fareTxt:       { fontSize: 13, color: '#9CA3AF' },

  starsRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 6, paddingHorizontal: 20, marginBottom: 8,
  },
  ratingLabel: {
    textAlign: 'center', fontSize: 16, fontWeight: '700',
    color: '#F59E0B', marginBottom: 24,
  },

  tagsSection:      { paddingHorizontal: 20, marginBottom: 20 },
  tagsSectionLabel: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  tagChipSel: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  tagTxt:    { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tagTxtSel: { color: '#16A34A' },

  commentBox: { paddingHorizontal: 20, marginBottom: 28 },
  commentInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 14, padding: 14,
    fontSize: 14, color: '#111827',
    minHeight: 90, textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  charCount: { fontSize: 12, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },

  submitBtn: {
    marginHorizontal: 20, height: 56, borderRadius: 18,
    backgroundColor: '#16A34A',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#16A34A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  submitBtnDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0 },
  submitTxt: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
