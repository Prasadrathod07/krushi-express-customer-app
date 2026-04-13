import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { LanguageProvider } from '../contexts/LanguageContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { TripProvider, useTrip } from '../contexts/TripContext';
import TripAcceptedModal from '../components/TripAcceptedModal';
import { socketManager } from '../services/socketManager';
import { notificationService } from '../services/notificationService';
import { tripsAPI } from '../services/tripsAPI';

function AppContent() {
  const { showAcceptedModal, setShowAcceptedModal } = useTrip();
  const router = useRouter();

  // Listen for server asking customer to rate the driver
  useEffect(() => {
    const handleRequestRating = (data: { tripId: string; raterType: string }) => {
      if (data.raterType === 'customer' && data.tripId) {
        router.push({ pathname: '/rate-trip', params: { tripId: data.tripId } });
      }
    };
    socketManager.on('request-rating', handleRequestRating);
    return () => { socketManager.off('request-rating', handleRequestRating); };
  }, []);

  // Notify customer when driver sends a negotiation offer
  useEffect(() => {
    const handleNewOffer = (data: any) => {
      const offer = data.offer || data;
      if (!offer?.tripId) return;
      // Only notify if the offer is from a driver (customer is the recipient)
      if (offer.userType !== 'driver') return;
      notificationService.sendNotification(
        '💬 Driver Sent an Offer',
        `Driver offered ₹${offer.amount} — tap to respond`,
        { type: 'new-offer', tripId: offer.tripId.toString() }
      ).catch(() => {});
    };
    socketManager.on('new-offer', handleNewOffer);
    return () => { socketManager.off('new-offer', handleNewOffer); };
  }, []);

  // Handle notification taps → deep-link to correct screen
  useEffect(() => {
    notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as any;
      if (!data?.tripId) return;

      if (data.type === 'new-offer') {
        // Verify the negotiation is still active before opening chat.
        // The notification may be stale (offer already accepted/rejected/cancelled).
        tripsAPI.getTrip(data.tripId)
          .then((res: any) => {
            const trip = res?.data || res;
            if (trip?.currentTripState === 'NEGOTIATING') {
              router.push({ pathname: '/trip-negotiation', params: { tripId: data.tripId } });
            }
            // else: negotiation already ended — ignore the stale notification
          })
          .catch(() => {});
      } else if (data.type === 'trip-accepted') {
        // trip-accepted is always safe to navigate — trip-tracking handles its own state
        router.push({ pathname: '/trip-tracking', params: { id: data.tripId } });
      }
    });
    return () => { notificationService.removeAllListeners(); };
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="select-location" />
        <Stack.Screen name="book-ride" />
        <Stack.Screen name="searching-drivers" />
        <Stack.Screen name="select-driver" />
        <Stack.Screen name="trip-tracking" />
        <Stack.Screen name="track-trip" />
        <Stack.Screen name="active-trip" />
        <Stack.Screen name="my-trips" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="about" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="terms-conditions" />
        <Stack.Screen name="profile-about" />
        <Stack.Screen name="help-support" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="notification-detail" />
        <Stack.Screen name="driver-detail" />
        <Stack.Screen name="rate-trip" />
        <Stack.Screen name="trip-negotiation" options={{ headerShown: false }} />
      </Stack>
      <TripAcceptedModal
        visible={showAcceptedModal}
        onClose={() => setShowAcceptedModal(false)}
        role="customer"
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <NotificationProvider>
        <TripProvider>
          <AppContent />
        </TripProvider>
      </NotificationProvider>
    </LanguageProvider>
  );
}



