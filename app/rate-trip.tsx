import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../lib/env';

export default function RateTrip() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tripId = params.tripId as string;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    checkIfRated();
  }, [tripId]);

  const checkIfRated = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/trips/${tripId}/rating`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          setAlreadyRated(true);
          setRating(data.data.rating);
          setComment(data.data.comment || '');
        }
      }
    } catch (error) {
      console.error('Error checking rating:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting.');
      return;
    }

    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/trips/${tripId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Thank You!', 'Your rating has been submitted successfully.', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
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

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rate Your Trip</Text>
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.closeButton}
        >
          <Icon name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          {alreadyRated ? 'Update your rating' : 'How was your experience?'}
        </Text>

        {/* Star Rating */}
        <View style={styles.starContainer}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRating(star);
              }}
              style={styles.starButton}
            >
              <Icon
                name={star <= rating ? 'star' : 'star-border'}
                size={48}
                color={star <= rating ? '#FFD700' : '#ddd'}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.ratingText}>
          {rating === 0
            ? 'Tap a star to rate'
            : rating === 1
            ? 'Poor'
            : rating === 2
            ? 'Fair'
            : rating === 3
            ? 'Good'
            : rating === 4
            ? 'Very Good'
            : 'Excellent'}
        </Text>

        {/* Comment Input */}
        <View style={styles.commentContainer}>
          <Text style={styles.commentLabel}>Add a comment (optional)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Share your experience..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.skipButton]}
            onPress={handleSkip}
            disabled={submitting}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton, rating === 0 && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || rating === 0}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {alreadyRated ? 'Update Rating' : 'Submit Rating'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 32,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  starButton: {
    padding: 8,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  commentContainer: {
    marginBottom: 32,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 'auto',
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    backgroundColor: '#f5f5f5',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
