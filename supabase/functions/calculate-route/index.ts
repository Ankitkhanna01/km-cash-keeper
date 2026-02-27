import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Google Routes API usage limits (per month)
const GOOGLE_MONTHLY_LIMITS = {
  routes_essentials: 10000,
  routes_pro: 5000,
};

interface Waypoint {
  lat: number;
  lon: number;
  address?: string;
}

interface RouteRequest {
  origin: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  mode?: 'DRIVE' | 'WALK' | 'BICYCLE';
}

interface RouteResponse {
  distanceKm: number;
  durationMinutes: number;
  polyline?: string;
  source: 'google' | 'osrm' | 'fallback';
  usageWarning?: string;
}

function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// Track API usage and check limits
async function checkAndTrackUsage(apiType: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  try {
    const supabase = getSupabaseClient();
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `google_${apiType}_${monthKey}`;
    
    const limit = GOOGLE_MONTHLY_LIMITS[apiType as keyof typeof GOOGLE_MONTHLY_LIMITS] || 10000;
    
    const { data } = await supabase
      .from('cached_addresses')
      .select('hit_count')
      .eq('display_name', key)
      .single();
    
    const currentCount = data?.hit_count || 0;
    
    if (currentCount >= limit * 0.9) {
      console.warn(`⚠️ GOOGLE ROUTES API LIMIT WARNING: ${apiType} at ${currentCount}/${limit} (${Math.round(currentCount/limit*100)}%)`);
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

// Google Routes API - Compute Routes (PRIMARY)
async function calculateRouteGoogle(request: RouteRequest): Promise<RouteResponse | null> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) {
    console.log("No GOOGLE_MAPS_API_KEY configured");
    return null;
  }

  // Check usage limits
  const usage = await checkAndTrackUsage('routes_essentials');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE ROUTES LIMIT EXCEEDED: ${usage.count}/${usage.limit} - Falling back to OSRM`);
    return null;
  }

  try {
    const body = {
      origin: {
        location: {
          latLng: {
            latitude: request.origin.lat,
            longitude: request.origin.lon,
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: request.destination.lat,
            longitude: request.destination.lon,
          }
        }
      },
      travelMode: request.mode || "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
      },
      languageCode: "en-CA",
      units: "METRIC",
    };

    // Add waypoints if provided
    if (request.waypoints && request.waypoints.length > 0) {
      (body as any).intermediates = request.waypoints.map(wp => ({
        location: {
          latLng: {
            latitude: wp.lat,
            longitude: wp.lon,
          }
        }
      }));
    }

    console.log(`Google Routes API: ${request.origin.lat},${request.origin.lon} → ${request.destination.lat},${request.destination.lon} (usage: ${usage.count}/${usage.limit})`);
    
    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google Routes API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      console.log("Google Routes: No routes found");
      return null;
    }

    const route = data.routes[0];
    const distanceMeters = route.distanceMeters || 0;
    const durationSeconds = parseInt(route.duration?.replace('s', '') || '0');

    const result: RouteResponse = {
      distanceKm: Math.round(distanceMeters / 100) / 10, // Round to 0.1 km
      durationMinutes: Math.round(durationSeconds / 60),
      source: 'google',
    };

    if (route.polyline?.encodedPolyline) {
      result.polyline = route.polyline.encodedPolyline;
    }

    if (usage.count >= usage.limit * 0.9) {
      result.usageWarning = `Google Routes API at ${Math.round(usage.count / usage.limit * 100)}% of monthly limit`;
    }

    console.log(`Google Routes: ${result.distanceKm}km, ${result.durationMinutes}min`);
    return result;
  } catch (err) {
    console.error(`Google Routes error: ${err}`);
    return null;
  }
}

// OSRM Routing - FALLBACK (free, unlimited)
async function calculateRouteOSRM(request: RouteRequest): Promise<RouteResponse | null> {
  try {
    let coords = `${request.origin.lon},${request.origin.lat}`;
    
    if (request.waypoints && request.waypoints.length > 0) {
      for (const wp of request.waypoints) {
        coords += `;${wp.lon},${wp.lat}`;
      }
    }
    
    coords += `;${request.destination.lon},${request.destination.lat}`;

    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`;
    console.log(`OSRM (fallback): ${request.origin.lat},${request.origin.lon} → ${request.destination.lat},${request.destination.lon}`);
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'KMCashKeeper/1.0' }
    });

    if (!response.ok) {
      console.log(`OSRM error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.log("OSRM: No route found");
      return null;
    }

    const route = data.routes[0];
    const result: RouteResponse = {
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMinutes: Math.round(route.duration / 60),
      source: 'osrm',
    };
    if (route.geometry) {
      result.polyline = route.geometry;
    }
    return result;
  } catch (err) {
    console.error(`OSRM error: ${err}`);
    return null;
  }
}

// Haversine distance as last resort
function calculateStraightLineDistance(origin: Waypoint, destination: Waypoint): number {
  const R = 6371; // Earth's radius in km
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLon = (destination.lon - origin.lon) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const straightDistance = R * c;
  
  // Multiply by 1.3 to estimate road distance (roads are rarely straight)
  return Math.round(straightDistance * 1.3 * 10) / 10;
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
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const request = await req.json() as RouteRequest;

    if (!request.origin || !request.destination) {
      return new Response(
        JSON.stringify({ error: "origin and destination are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate coordinates
    if (typeof request.origin.lat !== 'number' || typeof request.origin.lon !== 'number' ||
        typeof request.destination.lat !== 'number' || typeof request.destination.lon !== 'number') {
      return new Response(
        JSON.stringify({ error: "Invalid coordinates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Try Google Routes API (primary - most accurate)
    let result = await calculateRouteGoogle(request);

    // 2. Fallback to OSRM if Google fails
    if (!result) {
      console.log("Google failed, falling back to OSRM...");
      result = await calculateRouteOSRM(request);
    }

    // 3. Ultimate fallback: straight-line distance estimation
    if (!result) {
      console.log("All routing services failed, using straight-line estimate");
      const estimatedKm = calculateStraightLineDistance(request.origin, request.destination);
      result = {
        distanceKm: estimatedKm,
        durationMinutes: Math.round(estimatedKm / 0.5), // Assume 30 km/h average
        source: 'fallback',
      };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Calculate route error:", error);
    const message = error instanceof Error ? error.message : "Failed to calculate route";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
