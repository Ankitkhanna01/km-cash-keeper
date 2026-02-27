/**
 * Calls the calculate-route edge function which uses Google Routes API
 * (primary) with OSRM fallback for accurate driving distance.
 */
import { supabase } from '@/integrations/supabase/client';

interface Coordinate {
  lat: number;
  lon: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  polyline?: string;
  source: 'google' | 'osrm' | 'fallback';
  usageWarning?: string;
}

/**
 * Decode an encoded polyline (Google or OSRM, precision 5) into lat/lon pairs.
 */
export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Calculate driving distance via the calculate-route edge function.
 * Uses Google Routes API (primary) with OSRM fallback.
 * Supports intermediate waypoints for route accuracy.
 */
export async function getRouteDistance(
  coordinates: Coordinate[]
): Promise<RouteResult | null> {
  if (coordinates.length < 2) return null;

  try {
    const origin = coordinates[0];
    const destination = coordinates[coordinates.length - 1];
    
    // Sample intermediate waypoints (Google Routes limits intermediates)
    let waypoints: Coordinate[] | undefined;
    if (coordinates.length > 2) {
      const intermediates = coordinates.slice(1, -1);
      // Google Routes allows up to 25 intermediates; sample if more
      if (intermediates.length > 25) {
        const step = intermediates.length / 25;
        waypoints = Array.from({ length: 25 }, (_, i) => 
          intermediates[Math.round(i * step)]
        );
      } else {
        waypoints = intermediates;
      }
    }

    const { data, error } = await supabase.functions.invoke('calculate-route', {
      body: {
        origin,
        destination,
        waypoints,
        mode: 'DRIVE',
      },
    });

    if (error) {
      console.error('calculate-route error:', error);
      return null;
    }

    return data as RouteResult;
  } catch (error) {
    console.error('Route distance calculation failed:', error);
    return null;
  }
}
