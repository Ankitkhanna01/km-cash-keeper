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
  source?: 'trips' | 'cached' | 'osm';
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
            // Check start location
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
            // Check end location
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

    // 3. If we have enough from cache/trips, return early (skip OSM)
    if (allPlaces.length >= 5 && !query) {
      console.log(`Returning ${allPlaces.length} places from cache/trips (skipping OSM)`);
      allPlaces.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      return new Response(
        JSON.stringify({ places: allPlaces.slice(0, 5) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Search OSM (only if needed)
    const delta = radius / 111000;
    const viewbox = `${lon - delta},${lat + delta},${lon + delta},${lat - delta}`;

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

              addPlace({
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

    // Only fetch businesses from OSM if we need more places
    if (allPlaces.length < 5) {
      const businessAmenities = ['restaurant', 'fast_food', 'cafe', 'shop', 'supermarket'];
      
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

                addPlace({
                  name: place.name,
                  address: address || place.display_name?.split(',').slice(0, 2).join(',') || '',
                  lat: placeLat,
                  lon: placeLon,
                  type: ['restaurant', 'fast_food', 'cafe'].includes(amenity) ? 'restaurant' : 'business',
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

        if (allPlaces.length >= 5) break;
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
