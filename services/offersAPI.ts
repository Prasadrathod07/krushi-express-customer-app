// Offers API Service for Customer App
import { API_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = API_URL;

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
}

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

// Helper function to make API requests
const apiRequest = async <T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
  const token = await AsyncStorage.getItem('userToken');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

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
    let data: ApiResponse<T>;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text || 'An error occurred');
    }

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error(`❌ API Error [${error.status || 'NETWORK'}]:`, error.message);
    throw error;
  }
};

export const offersAPI = {
  // Create a new offer (customer sends initial offer)
  createOffer: async (tripId: string, amount: number, userId: string): Promise<ApiResponse<Offer>> => {
    return apiRequest<Offer>('/api/offers', {
      method: 'POST',
      body: JSON.stringify({ tripId, amount, userId, userType: 'customer' }),
    });
  },

  // Get all offers for a trip
  getTripOffers: async (tripId: string): Promise<ApiResponse<Offer[]>> => {
    return apiRequest<Offer[]>(`/api/offers/trip/${tripId}`);
  },

  // Accept an offer
  acceptOffer: async (offerId: string, userId: string): Promise<ApiResponse<Offer>> => {
    return apiRequest<Offer>(`/api/offers/${offerId}/accept`, {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    });
  },

  // Reject an offer
  rejectOffer: async (offerId: string, userId: string): Promise<ApiResponse<Offer>> => {
    return apiRequest<Offer>(`/api/offers/${offerId}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    });
  },

  // Counter offer (update existing offer with new amount)
  counterOffer: async (offerId: string, newAmount: number, userId: string): Promise<ApiResponse<Offer>> => {
    return apiRequest<Offer>(`/api/offers/${offerId}/counter`, {
      method: 'PUT',
      body: JSON.stringify({ amount: newAmount, userId }),
    });
  },
};
