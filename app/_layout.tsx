import { Stack } from 'expo-router';
import { View } from 'react-native';
import { LanguageProvider } from '../contexts/LanguageContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { TripProvider, useTrip } from '../contexts/TripContext';
import TripAcceptedModal from '../components/TripAcceptedModal';

function AppContent() {
  const { showAcceptedModal, setShowAcceptedModal } = useTrip();

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



