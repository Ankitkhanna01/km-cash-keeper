/**
 * Uses OSRM (free, no API key) to calculate actual driving distance
 * along a set of GPS waypoints. Falls back to haversine if OSRM fails.
 */

interface Coordinate {
  lat: number;
  lon: number;
}

interface OSRMRouteResponse {
  code: string;
  routes: Array<{
    distance: number; // meters
    duration: number; // seconds
    geometry: string; // encoded polyline
  }>;
}

/**
 * Decode an OSRM encoded polyline (precision 5) into lat/lon pairs.
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
 * OSRM has a max of ~100 coordinates per request.
 * If we have more waypoints, we sample them down.
 */
function sampleCoordinates(coords: Coordinate[], maxPoints: number = 80): Coordinate[] {
  if (coords.length <= maxPoints) return coords;

  const result: Coordinate[] = [coords[0]]; // always keep first
  const step = (coords.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]); // always keep last

  return result;
}

/**
 * Calculate actual driving distance using OSRM public router.
 * Returns { distanceKm, geometry } or null if it fails.
 */
export async function getOSRMRouteDistance(
  coordinates: Coordinate[]
): Promise<{ distanceKm: number; geometry: Array<[number, number]> } | null> {
  if (coordinates.length < 2) return null;

  try {
    const sampled = sampleCoordinates(coordinates);
    // OSRM expects lon,lat format
    const coordString = sampled.map(c => `${c.lon},${c.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=polyline`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data: OSRMRouteResponse = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const route = data.routes[0];
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const geometry = decodePolyline(route.geometry);

    return { distanceKm, geometry };
  } catch (error) {
    console.error('OSRM route calculation failed:', error);
    return null;
  }
}
