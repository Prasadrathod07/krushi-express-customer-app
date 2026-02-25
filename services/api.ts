// API Service - Backend API calls
import { API_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = API_URL || 'http://192.168.12.81:5000';

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

  try {
    // Log the request for debugging (remove in production)
    console.log(`[API Request] ${options.method || 'GET'} ${API_BASE}${endpoint}`);
    
    // Create timeout controller for mobile apps
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (reduced from 30s)
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text || 'An error occurred');
    }

    if (!response.ok) {
      // Create error with proper message and code
      const error: any = new Error(data.message || 'An error occurred');
      error.code = data.code || 'UNKNOWN_ERROR';
      error.status = response.status;
      
      // Log expected errors (like 404) as info, not error
      if (response.status === 404 && data.code === 'EMAIL_NOT_FOUND') {
        console.log(`[API Info] ${options.method || 'GET'} ${API_BASE}${endpoint}: ${error.message}`);
      } else {
        console.error(`[API Error] ${options.method || 'GET'} ${API_BASE}${endpoint}:`, error.message);
      }
      
      throw error;
    }

    return data;
  } catch (error: any) {
    // Only log as error if it's not already logged above
    if (!error.status || (error.status !== 404 && error.code !== 'EMAIL_NOT_FOUND')) {
      console.error(`[API Error] ${options.method || 'GET'} ${API_BASE}${endpoint}:`, error.message);
    }
    
    // Handle network errors
    if (
      error.message === 'Network request failed' || 
      error.message.includes('fetch') ||
      error.message.includes('Failed to fetch') ||
      error.name === 'TypeError' ||
      error.code === 'NETWORK_ERROR' ||
      error.message.includes('NetworkError')
    ) {
      const networkError: any = new Error(
        `Unable to connect to the server at ${API_BASE}. Please ensure:\n\n` +
        `1. The server is running on port 5000\n` +
        `2. Your device and computer are on the same network\n` +
        `3. Firewall allows connections on port 5000`
      );
      networkError.code = 'NETWORK_ERROR';
      networkError.isNetworkError = true;
      throw networkError;
    }
    
    // Handle timeout errors
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      const timeoutError: any = new Error('Request timed out. Please check your connection and try again.');
      timeoutError.code = 'TIMEOUT_ERROR';
      timeoutError.isNetworkError = true;
      throw timeoutError;
    }
    
    // Re-throw other errors
    throw error;
  }
};

// Customer Authentication API
export const customerAuthAPI = {
  // Register new customer
  register: async (userData: {
    name: string;
    email: string;
    password: string;
    phone: string;
    address?: {
      street?: string;
      city?: string;
      district?: string;
      state?: string;
      pincode?: string;
    };
  }) => {
    return apiRequest('/api/customer-auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Login
  login: async (email: string, password: string) => {
    return apiRequest('/api/customer-auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // Forgot password
  forgotPassword: async (email: string) => {
    return apiRequest('/api/customer-auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  // Reset password
  resetPassword: async (token: string, email: string, password: string) => {
    return apiRequest('/api/customer-auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, email, password }),
    });
  },
};

// Notifications API
export const notificationsAPI = {
  // Get notifications
  getNotifications: async (page: number = 1, limit: number = 50, unreadOnly: boolean = false) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      unreadOnly: unreadOnly.toString(),
    });
    return apiRequest(`/api/notifications?${params}`);
  },

  // Mark notification as read
  markAsRead: async (notificationId: string) => {
    return apiRequest(`/api/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  },

  // Mark all notifications as read
  markAllAsRead: async () => {
    return apiRequest('/api/notifications/read-all', {
      method: 'PUT',
    });
  },

  // Delete notification
  deleteNotification: async (notificationId: string) => {
    return apiRequest(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },
};

