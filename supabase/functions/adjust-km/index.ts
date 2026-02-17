import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Trip {
  id: string;
  start_location: string;
  end_location: string;
  start_lat?: number;
  start_lon?: number;
  end_lat?: number;
  end_lon?: number;
  kilometres: number;
  start_time: string;
  end_time: string;
}

interface RouteResult {
  id: string;
  calculatedKm: number | null;
  loggedKm: number;
  source?: string;
}

interface GapResult {
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
}

// Google Routes API usage limits
const GOOGLE_MONTHLY_LIMITS = {
  routes_essentials: 10000,
  geocoding: 10000,
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// Track API usage
async function checkAndTrackUsage(apiType: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  try {
    const supabase = getSupabaseClient();
    const monthKey = new Date().toISOString().slice(0, 7);
    const key = `google_${apiType}_${monthKey}`;
    const limit = GOOGLE_MONTHLY_LIMITS[apiType as keyof typeof GOOGLE_MONTHLY_LIMITS] || 10000;
    
    const { data } = await supabase
      .from('cached_addresses')
      .select('hit_count')
      .eq('display_name', key)
      .single();
    
    const currentCount = data?.hit_count || 0;
    
    if (currentCount >= limit * 0.9) {
      console.warn(`⚠️ GOOGLE API LIMIT WARNING: ${apiType} at ${currentCount}/${limit}`);
    }
    
    if (data) {
      await supabase
        .from('cached_addresses')
        .update({ hit_count: currentCount + 1 })
        .eq('display_name', key);
    } else {
      await supabase
        .from('cached_addresses')
        .insert({
          display_name: key,
          lat: 0,
          lon: 0,
          source: 'usage_tracking',
          hit_count: 1,
        });
    }
    
    return { allowed: currentCount < limit, count: currentCount + 1, limit };
  } catch (err) {
    console.error('Usage tracking error:', err);
    return { allowed: true, count: 0, limit: 10000 };
  }
}

// Cache for geocoded addresses
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

// Google Geocoding API (primary)
async function geocodeAddressGoogle(address: string): Promise<{ lat: number; lon: number } | null> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) return null;

  const usage = await checkAndTrackUsage('geocoding');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE GEOCODING LIMIT EXCEEDED - falling back to Nominatim`);
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleApiKey}&components=country:CA`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lon: location.lng };
    }
    return null;
  } catch (err) {
    console.error('Google geocoding error:', err);
    return null;
  }
}

// Nominatim Geocoding (fallback)
async function geocodeAddressNominatim(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': 'KMCashKeeper/1.0' } }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data?.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    console.error('Nominatim geocoding error:', err);
    return null;
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address) || null;
  }

  // Try Google first
  let result = await geocodeAddressGoogle(address);
  
  // Fallback to Nominatim
  if (!result) {
    result = await geocodeAddressNominatim(address);
  }

  geocodeCache.set(address, result);
  return result;
}

// Google Routes API (primary) - most accurate
async function getRouteDistanceGoogle(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<{ km: number; source: string } | null> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) return null;

  const usage = await checkAndTrackUsage('routes_essentials');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE ROUTES LIMIT EXCEEDED - falling back to OSRM`);
    return null;
  }

  try {
    const body = {
      origin: {
        location: {
          latLng: { latitude: start.lat, longitude: start.lon }
        }
      },
      destination: {
        location: {
          latLng: { latitude: end.lat, longitude: end.lon }
        }
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      languageCode: "en-CA",
      units: "METRIC",
    };

    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.routes?.length > 0) {
      const distanceKm = Math.round(data.routes[0].distanceMeters / 100) / 10;
      return { km: distanceKm, source: 'google' };
    }
    return null;
  } catch (err) {
    console.error('Google Routes error:', err);
    return null;
  }
}

// OSRM Routing (fallback)
async function getRouteDistanceOSRM(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<{ km: number; source: string } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
    const response = await fetch(url, { headers: { 'User-Agent': 'KMCashKeeper/1.0' } });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.code === 'Ok' && data.routes?.length > 0) {
      return { 
        km: Math.round(data.routes[0].distance / 100) / 10,
        source: 'osrm'
      };
    }
    return null;
  } catch (err) {
    console.error('OSRM routing error:', err);
    return null;
  }
}

async function getRouteDistance(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<{ km: number; source: string } | null> {
  // Try Google Routes first (most accurate)
  let result = await getRouteDistanceGoogle(start, end);
  
  // Fallback to OSRM
  if (!result) {
    result = await getRouteDistanceOSRM(start, end);
  }
  
  return result;
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
  source: string | null;
}> {
  // Use provided coordinates if available, otherwise geocode
  let startCoords = trip.start_lat && trip.start_lon 
    ? { lat: trip.start_lat, lon: trip.start_lon }
    : await geocodeAddress(trip.start_location);
    
  let endCoords = trip.end_lat && trip.end_lon
    ? { lat: trip.end_lat, lon: trip.end_lon }
    : await geocodeAddress(trip.end_location);
  
  let calculatedKm: number | null = null;
  let source: string | null = null;
  
  if (startCoords && endCoords) {
    const routeResult = await getRouteDistance(startCoords, endCoords);
    if (routeResult) {
      calculatedKm = routeResult.km;
      source = routeResult.source;
    }
  }
  
  return { trip, startCoords, endCoords, calculatedKm, source };
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate JWT and extract user identity
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { trips } = await req.json() as { trips: Trip[] };

    if (!trips || trips.length === 0) {
      return new Response(
        JSON.stringify({ error: "No trips provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${trips.length} trips for route verification (Google Routes primary)...`);

    // Process all trips
    const tripAnalysis = await processTripsBatched(trips, 5);

    // Build route results
    const routeResults: RouteResult[] = tripAnalysis.map(a => ({
      id: a.trip.id,
      calculatedKm: a.calculatedKm,
      loggedKm: a.trip.kilometres,
      source: a.source || undefined,
    }));

    // Detect gaps between consecutive trips
    const gaps: GapResult[] = [];
    const sortedAnalysis = [...tripAnalysis].sort((a, b) => 
      parseTimeToMinutes(a.trip.start_time) - parseTimeToMinutes(b.trip.start_time)
    );

    const gapPromises = sortedAnalysis.slice(1).map(async (curr, idx) => {
      const prev = sortedAnalysis[idx];
      
      if (prev.endCoords && curr.startCoords) {
        const gapResult = await getRouteDistance(prev.endCoords, curr.startCoords);
        
        if (gapResult && gapResult.km > 0.3) {
          return {
            tripId: curr.trip.id,
            fromLocation: prev.trip.end_location,
            toLocation: curr.trip.start_location,
            estimatedKm: gapResult.km,
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
    const googleRoutes = routeResults.filter(r => r.source === 'google').length;
    console.log(`Verified ${verified}/${trips.length} trips (${googleRoutes} via Google Routes), found ${gaps.length} gaps`);

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
