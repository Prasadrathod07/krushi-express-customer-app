// Trips API Service
import { API_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = API_URL;

// Helper function to make API requests
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = await AsyncStorage.getItem('userToken');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Create AbortController for timeout (React Native doesn't support AbortSignal.timeout)
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Handle non-JSON responses (like 404 HTML pages)
      if (response.status === 404) {
        const error: any = new Error(`Endpoint not found: ${API_BASE}${endpoint}. Please ensure the backend server is running and routes are registered.`);
        error.code = 'NOT_FOUND';
        error.status = 404;
        throw error;
      }
      const text = await response.text();
      throw new Error(text || 'An error occurred');
    }

    if (!response.ok) {
      // Handle 404 specifically
      if (response.status === 404) {
        const error: any = new Error(data.message || `Endpoint not found: ${API_BASE}${endpoint}`);
        error.code = data.code || 'NOT_FOUND';
        error.status = 404;
        throw error;
      }
      
      // Handle 500 errors with more details
      if (response.status === 500) {
        if (__DEV__) {
          console.error(`❌ Server Error [500] from ${endpoint}:`, data);
          if (data.details) {
            console.error('   Server error details:', data.details);
          }
        }
      }
      
      const error: any = new Error(data.message || data.error || 'An error occurred');
      error.code = data.code || 'UNKNOWN_ERROR';
      error.status = response.status;
      error.details = data.details;
      throw error;
    }

    return data;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError: any = new Error('Request timeout. Please try again.');
      timeoutError.code = 'TIMEOUT_ERROR';
      throw timeoutError;
    }
    
    if (error.message === 'Network request failed' || error.message.includes('fetch')) {
      const networkError: any = new Error('Unable to connect to the server. Please check your internet connection.');
      networkError.code = 'NETWORK_ERROR';
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
};

// Trips API
export const tripsAPI = {
  // Get fare estimate
  getFareEstimate: async (tripData: {
    pickupLocation: { latitude: number; longitude: number };
    dropLocation: { latitude: number; longitude: number };
    vehicleType?: string;
    weight?: string;
  }) => {
    return apiRequest('/api/trips/estimate', {
      method: 'POST',
      body: JSON.stringify(tripData),
    });
  },

  // Create new trip/booking
  createTrip: async (tripData: {
    pickupLocation: { latitude: number; longitude: number; address?: string };
    dropLocation: { latitude: number; longitude: number; address?: string };
    parcelDetails: {
      type: string;
      category: string;
      weight: string;
      images: string[];
      description?: string;
      budget?: number;
    };
    requestedVehicleType: string;
    estimatedFare?: number;
    tripDate?: string;
    driverId?: string; // Optional driverId to assign trip directly to a driver
  }) => {
    // Format for backend
    const formattedData = {
      pickupLocation: {
        type: 'Point',
        coordinates: [tripData.pickupLocation.longitude, tripData.pickupLocation.latitude],
        address: tripData.pickupLocation.address || '',
      },
      dropLocation: {
        type: 'Point',
        coordinates: [tripData.dropLocation.longitude, tripData.dropLocation.latitude],
        address: tripData.dropLocation.address || '',
      },
      parcelDetails: {
        type: tripData.parcelDetails.type || 'Other Items',
        category: tripData.parcelDetails.category || 'Other Items',
        weight: tripData.parcelDetails.weight || 'Not specified',
        images: tripData.parcelDetails.images || [],
        description: tripData.parcelDetails.description || '',
        budget: tripData.parcelDetails.budget || undefined,
      },
      requestedVehicleType: tripData.requestedVehicleType,
      estimatedFare: tripData.estimatedFare || undefined,
      tripDate: tripData.tripDate || new Date().toISOString(),
      driverId: tripData.driverId || undefined, // Include driverId if provided
    };

    return apiRequest('/api/trips', {
      method: 'POST',
      body: JSON.stringify(formattedData),
    });
  },

  // Start Priority Search (Phase 2: 10-20km)
  startPrioritySearch: async (tripId: string) => {
    return apiRequest(`/api/trips/${tripId}/priority-search`, { method: 'POST' });
  },

  // Respond to driver's negotiation offer
  respondToOffer: async (tripId: string, action: 'accept' | 'reject') => {
    return apiRequest(`/api/trips/${tripId}/negotiate/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  // Get trip by ID
  getTrip: async (tripId: string) => {
    return apiRequest(`/api/trips/${tripId}`, {
      method: 'GET',
    });
  },

  // Get user's trips
  getMyTrips: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return apiRequest(`/api/trips${params}`, {
      method: 'GET',
    });
  },

  // Rate a trip
  rateTrip: async (tripId: string, rating: number, comment?: string) => {
    return apiRequest(`/api/trips/${tripId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    });
  },

  // Get rating for a trip
  getTripRating: async (tripId: string) => {
    return apiRequest(`/api/trips/${tripId}/rating`, {
      method: 'GET',
    });
  },

  // Update trip (e.g., assign driver)
  // Uses the state update endpoint with additionalData to set driverId
  updateTrip: async (tripId: string, updateData: {
    driverId?: string;
    currentTripState?: string;
    estimatedFare?: number;
    [key: string]: any;
  }) => {
    // Use the state update endpoint with additionalData
    // Keep the state as REQUESTED and pass driverId in additionalData
    const { driverId, estimatedFare, ...rest } = updateData;
    const additionalData: any = {};
    
    if (driverId) {
      additionalData.driverId = driverId;
    }
    if (estimatedFare !== undefined) {
      additionalData.estimatedFare = estimatedFare;
    }
    
    // Merge any other fields
    Object.assign(additionalData, rest);
    
    return apiRequest(`/api/trips/${tripId}/state`, {
      method: 'PUT',
      body: JSON.stringify({
        state: updateData.currentTripState || 'REQUESTED', // Keep current state or use REQUESTED
        additionalData: additionalData,
      }),
    });
  },

  // Update trip state
  updateTripState: async (tripId: string, newState: string) => {
    return apiRequest(`/api/trips/${tripId}/state`, {
      method: 'PUT',
      body: JSON.stringify({ state: newState }),
    });
  },

  // Verify OTP
  verifyOtp: async (tripId: string, otp: string) => {
    return apiRequest(`/api/trips/${tripId}/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });
  },

  // Cancel trip (customer)
  cancelTrip: async (tripId: string, reason?: string) => {
    return apiRequest(`/api/trips/${tripId}/state`, {
      method: 'PUT',
      body: JSON.stringify({
        state: 'CUSTOMER_CANCELLED',
        additionalData: { cancellationReason: reason || 'Cancelled by customer' },
      }),
    });
  },

  // Cancel negotiation with current driver and requeue trip for another driver
  cancelNegotiation: async (tripId: string) => {
    return apiRequest(`/api/trips/${tripId}/cancel-negotiation`, {
      method: 'POST',
    });
  },
};

