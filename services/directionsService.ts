// Directions Service - Get route coordinates using Google Directions API
import { MAPBOX_TOKEN } from '../lib/env';

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Get route coordinates between two points
 * Uses Google Directions API (via backend) or fallback to straight line
 */
export const getRouteCoordinates = async (
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
): Promise<RouteCoordinates[]> => {
  try {
    // For now, return straight line as fallback
    // In production, you can integrate with Google Directions API via backend
    // or use Mapbox Directions API if you have MAPBOX_TOKEN
    
    // Simple fallback: return straight line between points
    // You can enhance this later with actual API integration
    return [origin, destination];
  } catch (error) {
    console.error('Error fetching route:', error);
    return [origin, destination];
  }
};

