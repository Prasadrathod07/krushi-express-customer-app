// Vehicles API Service
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
      
      const error: any = new Error(data.message || data.error || 'An error occurred');
      error.code = data.code || 'UNKNOWN_ERROR';
      error.status = response.status;
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

// Vehicles API
export const vehiclesAPI = {
  // Get nearby available vehicles
  getNearbyVehicles: async (latitude: number, longitude: number, radius: number = 10, vehicleType?: string) => {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      radius: radius.toString(),
    });
    
    if (vehicleType) {
      params.append('vehicleType', vehicleType);
    }

    return apiRequest(`/api/vehicles/nearby?${params.toString()}`, {
      method: 'GET',
    });
  },

  // Get vehicle details
  getVehicleDetails: async (vehicleId: string) => {
    return apiRequest(`/api/vehicles/${vehicleId}`, {
      method: 'GET',
    });
  },

  // Get all registered drivers (for customer app - excludes sensitive data)
  getAllDrivers: async (limit: number = 100, skip: number = 0, status?: string) => {
    const statusParam = status ? `&status=${status}` : '';
    return apiRequest(`/api/drivers?limit=${limit}&skip=${skip}${statusParam}`, {
      method: 'GET',
    });
  },

  // Get driver details by ID (for customer app - excludes sensitive data)
  getDriverDetails: async (driverId: string) => {
    return apiRequest(`/api/drivers/${driverId}`, {
      method: 'GET',
    });
  },
};

