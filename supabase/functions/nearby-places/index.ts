import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
}

// Calculate distance between two points in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
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
    const { lat, lon, radius = 150 } = await req.json();

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: "lat and lon are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Searching nearby places at ${lat}, ${lon} within ${radius}m`);

    const allPlaces: NearbyPlace[] = [];
    
    // Calculate bounding box (rough approximation: 1 degree ≈ 111km)
    const delta = radius / 111000;
    const viewbox = `${lon - delta},${lat + delta},${lon + delta},${lat - delta}`;

    // Search for businesses/POIs using Nominatim
    const businessAmenities = ['restaurant', 'fast_food', 'cafe', 'shop', 'supermarket', 'pharmacy', 'bank'];
    
    for (const amenity of businessAmenities.slice(0, 3)) { // Limit to 3 types for speed
      try {
        const url = `https://nominatim.openstreetmap.org/search?` +
          `format=json&` +
          `amenity=${amenity}&` +
          `viewbox=${viewbox}&` +
          `bounded=1&` +
          `limit=5&` +
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
            
            if (distance <= radius) {
              const name = place.name || '';
              const addr = place.address;
              const address = addr ? 
                `${addr.house_number || ''} ${addr.road || ''}, ${addr.city || addr.town || ''}`.trim().replace(/^,\s*/, '') :
                '';

              allPlaces.push({
                name,
                address: address || place.display_name?.split(',').slice(0, 2).join(',') || '',
                lat: placeLat,
                lon: placeLon,
                type: ['restaurant', 'fast_food', 'cafe'].includes(amenity) ? 'restaurant' : 'business',
                distance: Math.round(distance),
              });
            }
          }
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.log(`Error fetching ${amenity}:`, e);
      }
    }

    // Search for nearby house numbers using reverse geocoding around the point
    // Generate points in a small grid around the location
    const houseSearchPoints = [
      { lat, lon },
      { lat: lat + 0.0001, lon },
      { lat: lat - 0.0001, lon },
      { lat, lon: lon + 0.0001 },
      { lat, lon: lon - 0.0001 },
    ];

    for (const point of houseSearchPoints.slice(0, 3)) { // Limit for speed
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?` +
          `format=json&` +
          `lat=${point.lat}&` +
          `lon=${point.lon}&` +
          `addressdetails=1&` +
          `zoom=18`;

        const response = await fetch(url, {
          headers: { "User-Agent": "CRA-Tax-Tracker/1.0" },
        });

        if (response.ok) {
          const place = await response.json();
          if (place && place.address && place.address.house_number) {
            const placeLat = parseFloat(place.lat);
            const placeLon = parseFloat(place.lon);
            const distance = getDistance(lat, lon, placeLat, placeLon);
            
            if (distance <= radius) {
              const addr = place.address;
              const houseNum = addr.house_number;
              const road = addr.road || '';
              
              allPlaces.push({
                name: `${houseNum} ${road}`.trim(),
                address: `${addr.city || addr.town || ''}, ${addr.postcode || ''}`.trim().replace(/^,\s*/, ''),
                lat: placeLat,
                lon: placeLon,
                type: 'residential',
                distance: Math.round(distance),
              });
            }
          }
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.log("Error fetching residential:", e);
      }
    }

    // Sort by distance and remove duplicates
    const sortedPlaces = allPlaces.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    
    const uniquePlaces: NearbyPlace[] = [];
    const seenKeys = new Set<string>();
    
    for (const place of sortedPlaces) {
      const key = `${place.name.toLowerCase()}-${place.address.toLowerCase()}`.replace(/\s+/g, '');
      if (!seenKeys.has(key) && place.name) {
        seenKeys.add(key);
        uniquePlaces.push(place);
      }
    }

    console.log(`Found ${uniquePlaces.length} nearby places`);

    return new Response(
      JSON.stringify({ places: uniquePlaces.slice(0, 5) }),
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