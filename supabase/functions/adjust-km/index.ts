import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Trip {
  id: string;
  start_location: string;
  end_location: string;
  kilometres: number;
  start_time: string;
  end_time: string;
}

interface RouteResult {
  id: string;
  calculatedKm: number | null;
  loggedKm: number;
}

interface GapResult {
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
}

// Cache for geocoded addresses
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address) || null;
  }

  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      { headers: { 'User-Agent': 'KMCashKeeper/1.0' } }
    );
    
    if (!response.ok) {
      geocodeCache.set(address, null);
      return null;
    }
    
    const data = await response.json();
    if (data && data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geocodeCache.set(address, result);
      return result;
    }
    geocodeCache.set(address, null);
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    geocodeCache.set(address, null);
    return null;
  }
}

async function getRouteDistance(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
    const response = await fetch(url, { headers: { 'User-Agent': 'KMCashKeeper/1.0' } });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      return Math.round(data.routes[0].distance / 100) / 10; // Round to 0.1 km
    }
    return null;
  } catch (error) {
    console.error('OSRM routing error:', error);
    return null;
  }
}

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

async function processTrip(trip: Trip): Promise<{
  trip: Trip;
  startCoords: { lat: number; lon: number } | null;
  endCoords: { lat: number; lon: number } | null;
  calculatedKm: number | null;
}> {
  const startCoords = await geocodeAddress(trip.start_location);
  const endCoords = await geocodeAddress(trip.end_location);
  
  let calculatedKm: number | null = null;
  if (startCoords && endCoords) {
    calculatedKm = await getRouteDistance(startCoords, endCoords);
  }
  
  return { trip, startCoords, endCoords, calculatedKm };
}

async function processTripsBatched(trips: Trip[], batchSize: number = 5) {
  const results: Awaited<ReturnType<typeof processTrip>>[] = [];
  
  for (let i = 0; i < trips.length; i += batchSize) {
    const batch = trips.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processTrip));
    results.push(...batchResults);
    
    if (i + batchSize < trips.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trips } = await req.json() as { trips: Trip[] };

    if (!trips || trips.length === 0) {
      return new Response(
        JSON.stringify({ error: "No trips provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${trips.length} trips for route verification...`);

    // Process all trips
    const tripAnalysis = await processTripsBatched(trips, 5);

    // Build route results
    const routeResults: RouteResult[] = tripAnalysis.map(a => ({
      id: a.trip.id,
      calculatedKm: a.calculatedKm,
      loggedKm: a.trip.kilometres,
    }));

    // Detect gaps between consecutive trips
    const gaps: GapResult[] = [];
    const sortedAnalysis = [...tripAnalysis].sort((a, b) => 
      parseTimeToMinutes(a.trip.start_time) - parseTimeToMinutes(b.trip.start_time)
    );

    const gapPromises = sortedAnalysis.slice(1).map(async (curr, idx) => {
      const prev = sortedAnalysis[idx];
      
      if (prev.endCoords && curr.startCoords) {
        const gapDistance = await getRouteDistance(prev.endCoords, curr.startCoords);
        
        if (gapDistance !== null && gapDistance > 0.3) {
          return {
            tripId: curr.trip.id,
            fromLocation: prev.trip.end_location,
            toLocation: curr.trip.start_location,
            estimatedKm: gapDistance,
          };
        }
      }
      return null;
    });

    const gapResults = await Promise.all(gapPromises);
    for (const result of gapResults) {
      if (result !== null) gaps.push(result);
    }

    const verified = routeResults.filter(r => r.calculatedKm !== null).length;
    console.log(`Verified ${verified}/${trips.length} trips, found ${gaps.length} gaps`);

    return new Response(
      JSON.stringify({ routeResults, gaps, verified, total: trips.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("adjust-km error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
