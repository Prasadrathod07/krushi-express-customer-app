// Permanent Drivers API – Customer App
// Fetches admin-registered permanent drivers who are always visible (no online/offline dependency)
import { API_URL } from '../lib/env';

const API_BASE = API_URL || 'http://192.168.12.83:5000';

export interface PermanentDriverPackage {
  _id: string;
  title: string;
  description?: string;
  amount: number;
}

export interface PermanentDriver {
  _id: string;
  name: string;
  mobileNumber: string;
  alternateMobile?: string;
  city: string;
  serviceArea?: string;
  vehicleType: string;
  vehicleNumber?: string;
  experience: number;
  pricingType: 'per_km' | 'package' | 'both';
  perKmRate?: number;
  packages: PermanentDriverPackage[];
  profilePhoto?: string;
  bio?: string;
  availabilityText: string;
  isFeatured: boolean;
  languages: string[];
  isOnDuty: boolean;
}

export interface PermanentDriversResponse {
  ok: boolean;
  data: {
    drivers: PermanentDriver[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

/**
 * Fetch all active permanent drivers (no auth required).
 * Supports optional filters for city and vehicleType.
 */
export const permanentDriversAPI = {
  getAll: async (filters?: {
    vehicleType?: string;
    city?: string;
    search?: string;
  }): Promise<PermanentDriversResponse> => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filters?.vehicleType) params.append('vehicleType', filters.vehicleType);
      if (filters?.city) params.append('city', filters.city);
      if (filters?.search) params.append('search', filters.search);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE}/api/permanent-drivers/public?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  },

  getOne: async (id: string): Promise<{ ok: boolean; data: PermanentDriver }> => {
    const response = await fetch(`${API_BASE}/api/permanent-drivers/public/${id}`);
    return response.json();
  },
};
