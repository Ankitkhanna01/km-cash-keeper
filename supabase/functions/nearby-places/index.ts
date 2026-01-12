import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NearbyPlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: 'restaurant' | 'residential' | 'business' | 'other';
  distance?: number;
  source?: 'trips' | 'cached' | 'osm' | 'google';
}

// Calculate distance between two points in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Track API usage
async function checkAndTrackUsage(supabase: any, apiType: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  try {
    const monthKey = new Date().toISOString().slice(0, 7);
    const key = `google_${apiType}_${monthKey}`;
    const limit = apiType === 'places_nearby' ? 5000 : 10000;
    
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

// Google Places Nearby Search - PRIMARY
async function searchGoogleNearby(lat: number, lon: number, radius: number, query: string | null, supabase: any): Promise<NearbyPlace[]> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) {
    console.log("No GOOGLE_MAPS_API_KEY configured");
    return [];
  }

  const usage = await checkAndTrackUsage(supabase, 'places_nearby');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE PLACES NEARBY LIMIT EXCEEDED: ${usage.count}/${usage.limit} - Falling back to OSM`);
    return [];
  }

  try {
    const params = new URLSearchParams({
      location: `${lat},${lon}`,
      radius: String(Math.min(radius, 500)), // Max 500m for nearby
      key: googleApiKey,
    });
    
    if (query) {
      params.set('keyword', query);
    } else {
      params.set('type', 'establishment');
    }

    console.log(`Google Nearby: ${lat}, ${lon} radius=${radius}m (usage: ${usage.count}/${usage.limit})`);
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      console.error(`Google API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
      console.warn(`🚨 GOOGLE PLACES STATUS: ${data.status}`);
      return [];
    }

    return (data.results || []).slice(0, 5).map((place: any) => {
      const location = place.geometry?.location || {};
      const placeLat = location.lat;
      const placeLon = location.lng;
      const distance = getDistance(lat, lon, placeLat, placeLon);
      
      // Determine type
      let type: NearbyPlace['type'] = 'other';
      const types = place.types || [];
      if (types.some((t: string) => ['restaurant', 'food', 'cafe', 'meal_takeaway', 'meal_delivery'].includes(t))) {
        type = 'restaurant';
      } else if (types.includes('store') || types.includes('establishment')) {
        type = 'business';
      }
      
      return {
        name: place.name,
        address: place.vicinity || place.formatted_address || '',
        lat: placeLat,
        lon: placeLon,
        type,
        distance: Math.round(distance),
        source: 'google' as const,
      };
    });
  } catch (err) {
    console.error(`Google Nearby error: ${err}`);
    return [];
  }
}

// OSM Nearby Search - FALLBACK
async function searchOSMNearby(lat: number, lon: number, radius: number, query: string | null): Promise<NearbyPlace[]> {
  const delta = radius / 111000;
  const viewbox = `${lon - delta},${lat + delta},${lon + delta},${lat - delta}`;
  const places: NearbyPlace[] = [];

  console.log(`OSM Nearby (fallback): ${lat}, ${lon} radius=${radius}m`);

  // If there's a search query, search by name
  if (query && query.trim()) {
    try {
      const searchUrl = `https://nominatim.openstreetmap.org/search?` +
        `format=json&` +
        `q=${encodeURIComponent(query)}&` +
        `viewbox=${viewbox}&` +
        `bounded=1&` +
        `limit=5&` +
        `addressdetails=1`;

      const response = await fetch(searchUrl, {
        headers: { "User-Agent": "CRA-Tax-Tracker/1.0" },
      });

      if (response.ok) {
        const data = await response.json();
        for (const place of data) {
          const placeLat = parseFloat(place.lat);
          const placeLon = parseFloat(place.lon);
          const distance = getDistance(lat, lon, placeLat, placeLon);
          
          if (distance <= radius) {
            const name = place.name || place.display_name?.split(',')[0] || '';
            const addr = place.address;
            const address = addr ? 
              `${addr.house_number || ''} ${addr.road || ''}, ${addr.city || addr.town || ''}`.trim().replace(/^,\s*/, '') :
              '';

            places.push({
              name,
              address: address || place.display_name?.split(',').slice(0, 2).join(',') || '',
              lat: placeLat,
              lon: placeLon,
              type: place.class === 'shop' || place.class === 'amenity' ? 'business' : 'other',
              distance: Math.round(distance),
              source: 'osm',
            });
          }
        }
      }
    } catch (e) {
      console.log("Error searching OSM:", e);
    }
  }

  // Only fetch businesses if we need more places
  if (places.length < 5) {
    const businessAmenities = ['restaurant', 'fast_food', 'cafe'];
    
    for (const amenity of businessAmenities.slice(0, 2)) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?` +
          `format=json&` +
          `amenity=${amenity}&` +
          `viewbox=${viewbox}&` +
          `bounded=1&` +
          `limit=3&` +
          `addressdetails=1`;

        const response = await fetch(url, {
          headers: { "User-Agent": "CRA-Tax-Tracker/1.0" },
        });

        if (response.ok) {
          const data = await response.json();
          for (const place of data) {
            const placeLat = parseFloat(place.lat);
            const placeLon = parseFloat(place.lon);
            const distance = getDistance(lat, lon, placeLat, placeLon);
            
            if (distance <= radius && place.name) {
              const addr = place.address;
              const address = addr ? 
                `${addr.house_number || ''} ${addr.road || ''}, ${addr.city || addr.town || ''}`.trim().replace(/^,\s*/, '') :
                '';

              places.push({
                name: place.name,
                address: address || place.display_name?.split(',').slice(0, 2).join(',') || '',
                lat: placeLat,
                lon: placeLon,
                type: 'restaurant',
                distance: Math.round(distance),
                source: 'osm',
              });
            }
          }
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.log(`Error fetching ${amenity}:`, e);
      }

      if (places.length >= 5) break;
    }
  }

  return places;
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

    const { lat, lon, radius = 150, query, userId, savePlace } = await req.json();

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: "lat and lon are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Nearby places at ${lat}, ${lon} within ${radius}m${query ? `, query: ${query}` : ''}${userId ? `, user: ${userId}` : ''}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If saving a custom place
    if (savePlace && savePlace.name) {
      console.log(`Saving custom place: ${savePlace.name}`);
      await supabase.from('cached_addresses').upsert({
        display_name: savePlace.address || savePlace.name,
        place_name: savePlace.name,
        lat: savePlace.lat || lat,
        lon: savePlace.lon || lon,
        user_id: userId || null,
        source: 'user_custom',
        hit_count: 1,
      }, {
        onConflict: 'display_name',
        ignoreDuplicates: false,
      });
    }

    const allPlaces: NearbyPlace[] = [];
    const seenKeys = new Set<string>();
    
    const addPlace = (place: NearbyPlace) => {
      const key = `${place.name.toLowerCase()}-${Math.round(place.lat * 1000)}-${Math.round(place.lon * 1000)}`;
      if (!seenKeys.has(key) && place.name) {
        seenKeys.add(key);
        allPlaces.push(place);
      }
    };

    // 1. Check user's past trips first (if userId provided)
    if (userId) {
      try {
        const { data: trips } = await supabase
          .from('trips')
          .select('start_location, start_lat, start_lon, end_location, end_lat, end_lon')
          .eq('user_id', userId)
          .not('start_lat', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (trips) {
          for (const trip of trips) {
            if (trip.start_lat && trip.start_lon) {
              const dist = getDistance(lat, lon, Number(trip.start_lat), Number(trip.start_lon));
              if (dist <= radius) {
                addPlace({
                  name: trip.start_location.split(',')[0].trim(),
                  address: trip.start_location,
                  lat: Number(trip.start_lat),
                  lon: Number(trip.start_lon),
                  type: 'other',
                  distance: Math.round(dist),
                  source: 'trips',
                });
              }
            }
            if (trip.end_lat && trip.end_lon) {
              const dist = getDistance(lat, lon, Number(trip.end_lat), Number(trip.end_lon));
              if (dist <= radius) {
                addPlace({
                  name: trip.end_location.split(',')[0].split('→').pop()?.trim() || trip.end_location,
                  address: trip.end_location,
                  lat: Number(trip.end_lat),
                  lon: Number(trip.end_lon),
                  type: 'other',
                  distance: Math.round(dist),
                  source: 'trips',
                });
              }
            }
          }
        }
        console.log(`Found ${allPlaces.length} places from past trips`);
      } catch (e) {
        console.log("Error fetching trips:", e);
      }
    }

    // 2. Check cached addresses
    try {
      const delta = radius / 111000;
      const { data: cached } = await supabase
        .from('cached_addresses')
        .select('*')
        .neq('source', 'usage_tracking')
        .gte('lat', lat - delta)
        .lte('lat', lat + delta)
        .gte('lon', lon - delta)
        .lte('lon', lon + delta)
        .limit(20);

      if (cached) {
        for (const addr of cached) {
          const dist = getDistance(lat, lon, Number(addr.lat), Number(addr.lon));
          if (dist <= radius) {
            addPlace({
              name: addr.place_name || addr.display_name.split(',')[0].trim(),
              address: addr.display_name,
              lat: Number(addr.lat),
              lon: Number(addr.lon),
              type: addr.source === 'user_custom' ? 'business' : 'other',
              distance: Math.round(dist),
              source: 'cached',
            });
          }
        }
        console.log(`Found ${cached.length} cached addresses`);
      }
    } catch (e) {
      console.log("Error fetching cached:", e);
    }

    // 3. If we have enough from cache/trips, return early
    if (allPlaces.length >= 5 && !query) {
      console.log(`Returning ${allPlaces.length} places from cache/trips (skipping external API)`);
      allPlaces.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      return new Response(
        JSON.stringify({ places: allPlaces.slice(0, 5) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. PRIMARY: Google Places API
    const googlePlaces = await searchGoogleNearby(lat, lon, radius, query || null, supabase);
    
    for (const place of googlePlaces) {
      addPlace(place);
    }

    // 5. FALLBACK: OSM if Google didn't return results
    if (googlePlaces.length === 0) {
      console.log("Google returned no results, falling back to OSM...");
      const osmPlaces = await searchOSMNearby(lat, lon, radius, query || null);
      
      for (const place of osmPlaces) {
        addPlace(place);
      }
    }

    // Sort by distance
    allPlaces.sort((a, b) => (a.distance || 0) - (b.distance || 0));

    console.log(`Returning ${Math.min(allPlaces.length, 5)} places total`);

    return new Response(
      JSON.stringify({ places: allPlaces.slice(0, 5) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Nearby places error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch nearby places";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
