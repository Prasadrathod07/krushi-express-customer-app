// Environment Variable Utilities - Customer App V2
import Constants from 'expo-constants';

// Centralized environment variable access with fallbacks
export const SOCKET_URL = 
  Constants.expoConfig?.extra?.SOCKET_IO_URL || 
  process.env.EXPO_PUBLIC_SOCKET_IO_URL || 
  process.env.EXPO_PUBLIC_SOCKET_URL || 
  'http://localhost:5000';

export const API_URL = 
  Constants.expoConfig?.extra?.API_BASE_URL || 
  process.env.EXPO_PUBLIC_API_BASE_URL || 
  process.env.EXPO_PUBLIC_API_URL || 
  'http://localhost:5000';

export const MAPBOX_TOKEN = 
  Constants.expoConfig?.extra?.mapboxAccessToken || 
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN || 
  '';

export const CLOUDINARY_CLOUD_NAME = 
  Constants.expoConfig?.extra?.CLOUDINARY_CLOUD_NAME || 
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 
  '';

export const CLOUDINARY_API_KEY = 
  Constants.expoConfig?.extra?.CLOUDINARY_API_KEY || 
  process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || 
  '';



