// Directions Service — road-based routing via OSRM (free, no API key)

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  coordinates: RouteCoordinates[];
  distance: number;   // km
  duration: number;   // minutes
  distanceText: string; // "2.4 km" or "450 m"
  durationText: string; // "12 min" or "1 hr 5 min"
  arrivalTime: string;  // "Arrives 2:30 PM"
}

/** Format distance: "450 m" below 1 km, "2.4 km" above */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Format duration: "5 min", "1 hr 20 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Arrival time: "Arrives 2:30 PM" */
export function formatArrivalTime(minutes: number): string {
  const arrival = new Date(Date.now() + minutes * 60 * 1000);
  return `Arrives ${arrival.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

function buildRouteInfo(
  coordinates: RouteCoordinates[],
  distanceKm: number,
  durationMin: number,
): RouteInfo {
  return {
    coordinates,
    distance: distanceKm,
    duration: durationMin,
    distanceText: formatDistance(distanceKm),
    durationText: formatDuration(durationMin),
    arrivalTime: formatArrivalTime(durationMin),
  };
}

/**
 * Road-based route via OSRM public API.
 * Returns actual road polyline + formatted distance/time/arrival.
 * Falls back to straight line on error.
 */
export const getRouteInfo = async (
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<RouteInfo> => {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
      `?overview=full&geometries=polyline&steps=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await response.json();

    if (data.code === 'Ok' && data.routes?.length > 0) {
      const route = data.routes[0];
      const coordinates = decodePolyline(route.geometry).map(([lat, lng]: number[]) => ({
        latitude: lat,
        longitude: lng,
      }));
      const distKm = route.distance / 1000;
      const durMin = Math.round(route.duration / 60);
      return buildRouteInfo(coordinates, distKm, durMin);
    }

    throw new Error('OSRM: no route');
  } catch {
    const dist = haversine(origin, destination);
    const dur = Math.round((dist / 30) * 60); // 30 km/h avg city speed
    return buildRouteInfo([origin, destination], dist, dur);
  }
};

/** @deprecated use getRouteInfo */
export const getRouteCoordinates = async (
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<RouteCoordinates[]> => (await getRouteInfo(origin, destination)).coordinates;

// ─── internals ───────────────────────────────────────────────

function haversine(
  p1: { latitude: number; longitude: number },
  p2: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.latitude * Math.PI) / 180) *
      Math.cos((p2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decodePolyline(encoded: string): number[][] {
  const coords: number[][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coords.push([lat * 1e-5, lng * 1e-5]);
  }

  return coords;
}
