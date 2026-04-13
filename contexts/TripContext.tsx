// TripContext - Single source of truth for active trip state
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socketManager } from '../services/socketManager';
import { tripsAPI } from '../services/tripsAPI';

const STORAGE_KEY = 'activeTrip';

interface Trip {
  _id: string;
  currentTripState: string;
  customerId?: string;
  driverId?: string;
  otp?: string;
  pickupCode?: string;
  driver?: any;
  customer?: any;
  [key: string]: any;
}

interface TripContextType {
  activeTrip: Trip | null;
  setActiveTrip: (trip: Trip | null) => void;
  updateTripState: (tripId: string, state: string, tripData?: any) => void;
  clearActiveTrip: () => void;
  showAcceptedModal: boolean;
  setShowAcceptedModal: (show: boolean) => void;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [activeTrip, setActiveTripState] = useState<Trip | null>(null);
  const [showAcceptedModal, setShowAcceptedModal] = useState(false);
  // Use state (not just ref) for initialized so the socket effect re-runs once restore completes
  const [initialized, setInitialized] = useState(false);
  const initializedRef = useRef(false);

  // Restore activeTrip from AsyncStorage on mount, then validate against server
  useEffect(() => {
    const restoreTrip = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const trip = JSON.parse(stored);

          const terminalStates = [
            'COMPLETED',
            'CANCELLED',
            'CUSTOMER_CANCELLED',
            'DRIVER_CANCELLED',
            'REJECTED',
            'DELIVERED',
          ];

          if (terminalStates.includes(trip.currentTripState)) {
            console.log('🏁 TripContext: Restored trip is in terminal state, clearing it');
            await AsyncStorage.removeItem(STORAGE_KEY);
            setActiveTripState(null);
          } else {
            // Validate the stored trip against the server before restoring it.
            // This handles the case where the app was killed while a trip was PENDING/REQUESTED
            // and the driver rejected or the trip expired — no socket event was received.
            try {
              const response = await tripsAPI.getTrip(trip._id);
              const serverTrip = response?.data || response;
              const serverState = serverTrip?.currentTripState;

              if (!serverState || terminalStates.includes(serverState)) {
                console.log('🏁 TripContext: Server trip is terminal or missing, clearing stored trip');
                await AsyncStorage.removeItem(STORAGE_KEY);
                setActiveTripState(null);
              } else {
                // Use fresh data from server so state is always accurate
                setActiveTripState({ ...trip, ...serverTrip, currentTripState: serverState });
              }
            } catch (serverError: any) {
              if (serverError?.status === 404 || serverError?.code === 'NOT_FOUND') {
                console.log('🏁 TripContext: Trip not found on server, clearing stored trip');
                await AsyncStorage.removeItem(STORAGE_KEY);
                setActiveTripState(null);
              } else {
                // Network error — restore from cache so app works offline
                console.warn('TripContext: Could not validate trip with server, restoring from cache');
                setActiveTripState(trip);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error restoring activeTrip:', error);
      }
      initializedRef.current = true;
      setInitialized(true);
    };
    restoreTrip();
  }, []);

  // Persist activeTrip to AsyncStorage
  useEffect(() => {
    if (!initializedRef.current) return;

    const persistTrip = async () => {
      try {
        if (activeTrip) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeTrip));
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        console.error('Error persisting activeTrip:', error);
      }
    };
    persistTrip();
  }, [activeTrip]);

  // Initialize socket and listen for trip events — runs once restore completes (initialized → true)
  useEffect(() => {
    if (!initialized) return;

    const initSocket = async () => {
      try {
        if (!socketManager.isConnected()) {
          await socketManager.connect();
        }

        // Handle trip-accepted event
        const handleTripAccepted = (data: { tripId: string; trip: any; otp?: string }) => {
          console.log('🎉 TripContext: trip-accepted received', data);
          
          const tripId = data.tripId || data.trip?._id;
          if (tripId) {
            const tripData = {
              ...(data.trip || data),
              _id: tripId,
              currentTripState: 'ACCEPTED',
              otp: data.otp || data.trip?.otp || data.trip?.pickupCode,
            };
            
            setActiveTripState(tripData);
            setShowAcceptedModal(true);
          }
        };

        // Handle trip-state-updated event
        const handleTripStateUpdated = (data: { tripId: string; state: string; trip?: any }) => {
          console.log('📬 TripContext: trip-state-updated received', data);
          
          // Terminal states - clear active trip
          const terminalStates = [
            'COMPLETED',
            'CANCELLED',
            'CUSTOMER_CANCELLED',
            'DRIVER_CANCELLED',
            'REJECTED',
            'DELIVERED',
          ];
          
          if (terminalStates.includes(data.state)) {
            console.log('🏁 TripContext: Trip in terminal state, clearing active trip');
            setActiveTripState(null);
            setShowAcceptedModal(false);
            return;
          }
          
          setActiveTripState((prev) => {
            if (prev && prev._id === data.tripId) {
              return {
                ...prev,
                currentTripState: data.state,
                ...(data.trip || {}),
              };
            } else if (data.trip) {
              return {
                ...data.trip,
                currentTripState: data.state,
              };
            }
            return prev;
          });
        };

        // Handle otp-verified event
        const handleOtpVerified = (data: { tripId: string; trip?: any }) => {
          console.log('✅ TripContext: otp-verified received', data);

          setActiveTripState((prev) => {
            if (prev && prev._id === data.tripId) {
              return {
                ...prev,
                otpVerified: true,
                ...(data.trip || {}),
              };
            }
            return prev;
          });
        };

        // Handle trip-cancelled event (driver cancelled or system cancelled)
        const handleTripCancelled = (data: { tripId: string; reason?: string; cancelledBy?: string }) => {
          console.log('❌ TripContext: trip-cancelled received', data);
          setActiveTripState((prev) => {
            if (prev && (prev._id === data.tripId || !data.tripId)) {
              return null;
            }
            return prev;
          });
          setShowAcceptedModal(false);
          AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        };

        socketManager.on('trip-accepted', handleTripAccepted);
        socketManager.on('trip-state-updated', handleTripStateUpdated);
        socketManager.on('otp-verified', handleOtpVerified);
        socketManager.on('trip-cancelled', handleTripCancelled);

        return () => {
          socketManager.off('trip-accepted', handleTripAccepted);
          socketManager.off('trip-state-updated', handleTripStateUpdated);
          socketManager.off('otp-verified', handleOtpVerified);
          socketManager.off('trip-cancelled', handleTripCancelled);
        };
      } catch (error) {
        console.error('Error initializing TripContext socket:', error);
      }
    };

    initSocket();
  }, [initialized]);

  const setActiveTrip = (trip: Trip | null) => {
    setActiveTripState(trip);
  };

  const updateTripState = (tripId: string, state: string, tripData?: any) => {
    if (activeTrip && activeTrip._id === tripId) {
      const updatedTrip = {
        ...activeTrip,
        currentTripState: state,
        ...(tripData || {}),
      };
      setActiveTripState(updatedTrip);
    } else if (tripData) {
      setActiveTripState({
        ...tripData,
        currentTripState: state,
      });
    }
  };

  const clearActiveTrip = async () => {
    setActiveTripState(null);
    setShowAcceptedModal(false);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing activeTrip:', error);
    }
  };

  return (
    <TripContext.Provider
      value={{
        activeTrip,
        setActiveTrip,
        updateTripState,
        clearActiveTrip,
        showAcceptedModal,
        setShowAcceptedModal,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
}
