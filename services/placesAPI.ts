// Places Autocomplete API Service
import { API_URL } from '../lib/env';

const API_BASE = API_URL;

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  isMaharashtra: boolean;
  types: string[];
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  addressComponents: any[];
}

// Helper function to make API requests
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for autocomplete

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
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
      
      const error: any = new Error(data.message || data.error || 'An error occurred');
      error.code = data.code || 'UNKNOWN_ERROR';
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError: any = new Error('Request timeout');
      timeoutError.code = 'TIMEOUT_ERROR';
      throw timeoutError;
    }
    
    if (error.message === 'Network request failed' || error.message.includes('fetch')) {
      const networkError: any = new Error('Unable to connect to the server');
      networkError.code = 'NETWORK_ERROR';
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
};

export const placesAPI = {
  // Get autocomplete suggestions
  getAutocomplete: async (
    input: string,
    location?: { latitude: number; longitude: number },
    radius?: number
  ): Promise<{ ok: boolean; data: PlaceSuggestion[] }> => {
    return apiRequest('/api/places/autocomplete', {
      method: 'POST',
      body: JSON.stringify({
        input,
        location,
        radius,
      }),
    });
  },

  // Get place details by place ID
  getPlaceDetails: async (placeId: string): Promise<{ ok: boolean; data: PlaceDetails }> => {
    return apiRequest('/api/places/details', {
      method: 'POST',
      body: JSON.stringify({ placeId }),
    });
  },
};

