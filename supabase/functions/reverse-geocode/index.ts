import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Track API usage
async function checkAndTrackUsage(apiType: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const monthKey = new Date().toISOString().slice(0, 7);
    const key = `google_${apiType}_${monthKey}`;
    const limit = 10000;
    
    const { data } = await supabase
      .from('cached_addresses')
      .select('hit_count')
      .eq('display_name', key)
      .single();
    
    const currentCount = data?.hit_count || 0;
    
    if (currentCount >= limit * 0.9) {
      console.warn(`⚠️ GOOGLE API LIMIT WARNING: ${apiType} at ${currentCount}/${limit} (${Math.round(currentCount/limit*100)}%)`);
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

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 503 && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return response;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

// Google Maps Reverse Geocoding - PRIMARY
async function reverseGeocodeGoogle(lat: number, lon: number): Promise<any | null> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) {
    console.log("No GOOGLE_MAPS_API_KEY configured");
    return null;
  }

  const usage = await checkAndTrackUsage('geocoding');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE GEOCODING LIMIT EXCEEDED: ${usage.count}/${usage.limit} - Falling back to OSM`);
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${googleApiKey}`;
    console.log(`Google Reverse Geocode: ${lat}, ${lon} (usage: ${usage.count}/${usage.limit})`);
    
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.error(`Google API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
      console.warn(`🚨 GOOGLE API STATUS: ${data.status} - ${data.error_message || 'Limit exceeded'}`);
      return null;
    }

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return null;
    }

    // Get the most precise result (usually first one)
    const result = data.results[0];
    const addressComponents = result.address_components || [];
    
    const getComponent = (type: string) => 
      addressComponents.find((c: any) => c.types.includes(type))?.long_name || '';
    
    // Build a nice short address
    const parts = [];
    const streetNumber = getComponent('street_number');
    const route = getComponent('route');
    if (streetNumber && route) {
      parts.push(`${streetNumber} ${route}`);
    } else if (route) {
      parts.push(route);
    }
    
    const city = getComponent('locality') || getComponent('sublocality') || getComponent('administrative_area_level_2');
    if (city) parts.push(city);
    
    const province = getComponent('administrative_area_level_1');
    if (province) parts.push(province);
    
    return {
      address: parts.join(', ') || result.formatted_address,
      full_address: result.formatted_address,
      lat: result.geometry?.location?.lat || lat,
      lon: result.geometry?.location?.lng || lon,
      addressComponents: {
        house_number: streetNumber,
        road: route,
        city: city,
        state: province,
        postcode: getComponent('postal_code'),
        country: getComponent('country'),
      },
      source: 'google',
    };
  } catch (err) {
    console.error(`Google reverse geocode error: ${err}`);
    return null;
  }
}

// Nominatim Reverse Geocoding - FALLBACK
async function reverseGeocodeNominatim(lat: number, lon: number): Promise<any | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lon.toString());
    url.searchParams.set("addressdetails", "1");

    console.log(`Nominatim Reverse Geocode (fallback): ${lat}, ${lon}`);
    
    const response = await fetchWithRetry(url.toString(), {
      headers: {
        "User-Agent": "KmCashKeeper/1.0 (delivery-driver-tax-tracker)",
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      console.log(`Nominatim returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    let address = data.display_name || "";
    
    if (data.address) {
      const parts = [];
      if (data.address.house_number) parts.push(data.address.house_number);
      if (data.address.road) parts.push(data.address.road);
      if (data.address.city || data.address.town || data.address.village) {
        parts.push(data.address.city || data.address.town || data.address.village);
      }
      if (data.address.state || data.address.province) {
        parts.push(data.address.state || data.address.province);
      }
      if (parts.length > 0) {
        address = parts.join(", ");
      }
    }

    return {
      address,
      full_address: data.display_name,
      lat: parseFloat(data.lat),
      lon: parseFloat(data.lon),
      addressComponents: data.address || null,
      source: 'nominatim',
    };
  } catch (err) {
    console.error(`Nominatim error: ${err}`);
    return null;
  }
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

    const { lat, lon } = await req.json();

    if (typeof lat !== "number" || typeof lon !== "number") {
      return new Response(
        JSON.stringify({ error: "lat and lon are required numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try Google first (primary)
    let result = await reverseGeocodeGoogle(lat, lon);
    
    // Fallback to Nominatim if Google fails
    if (!result) {
      console.log("Google failed, falling back to Nominatim...");
      result = await reverseGeocodeNominatim(lat, lon);
    }
    
    // Ultimate fallback: return coordinates
    if (!result) {
      console.log("All geocoding services failed, using coordinate fallback");
      return new Response(
        JSON.stringify({ 
          address: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          full_address: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          lat,
          lon,
          addressComponents: null,
          source: 'coordinates',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Reverse geocode error:", error);
    const message = error instanceof Error ? error.message : "Failed to reverse geocode";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
