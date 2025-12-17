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
  type: 'restaurant' | 'residential' | 'other';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon, radius = 500 } = await req.json();

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: "lat and lon are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query Nominatim for nearby amenities (restaurants, fast food, cafes)
    // and residential buildings
    const amenities = ['restaurant', 'fast_food', 'cafe', 'bar', 'pub'];
    const allPlaces: NearbyPlace[] = [];

    // Search for restaurants/food places
    for (const amenity of amenities) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?` +
          `format=json&` +
          `amenity=${amenity}&` +
          `viewbox=${lon - 0.01},${lat + 0.01},${lon + 0.01},${lat - 0.01}&` +
          `bounded=1&` +
          `limit=10&` +
          `addressdetails=1`;

        const response = await fetch(url, {
          headers: { "User-Agent": "CRA-Tax-Tracker/1.0" },
        });

        if (response.ok) {
          const data = await response.json();
          for (const place of data) {
            const name = place.name || place.display_name?.split(',')[0] || 'Unknown';
            const addr = place.address;
            const address = addr ? 
              `${addr.house_number || ''} ${addr.road || ''}, ${addr.city || addr.town || addr.village || ''}`.trim() :
              place.display_name?.split(',').slice(0, 2).join(',') || '';

            allPlaces.push({
              name,
              address: address || 'No address',
              lat: parseFloat(place.lat),
              lon: parseFloat(place.lon),
              type: 'restaurant',
            });
          }
        }

        // Small delay between requests to respect Nominatim rate limits
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        console.log(`Error fetching ${amenity}:`, e);
      }
    }

    // Search for residential buildings/apartments nearby
    try {
      const residentialUrl = `https://nominatim.openstreetmap.org/search?` +
        `format=json&` +
        `q=apartment+OR+house&` +
        `viewbox=${lon - 0.005},${lat + 0.005},${lon + 0.005},${lat - 0.005}&` +
        `bounded=1&` +
        `limit=10&` +
        `addressdetails=1`;

      const response = await fetch(residentialUrl, {
        headers: { "User-Agent": "CRA-Tax-Tracker/1.0" },
      });

      if (response.ok) {
        const data = await response.json();
        for (const place of data) {
          const addr = place.address;
          const address = addr ? 
            `${addr.house_number || ''} ${addr.road || ''}, ${addr.city || addr.town || addr.village || ''}`.trim() :
            place.display_name?.split(',').slice(0, 2).join(',') || '';
          const name = addr?.house_number && addr?.road ? 
            `${addr.house_number} ${addr.road}` : 
            place.display_name?.split(',')[0] || 'Residential';

          allPlaces.push({
            name,
            address: address || 'No address',
            lat: parseFloat(place.lat),
            lon: parseFloat(place.lon),
            type: 'residential',
          });
        }
      }
    } catch (e) {
      console.log("Error fetching residential:", e);
    }

    // Sort by distance from the original point
    const sortedPlaces = allPlaces
      .map(place => ({
        ...place,
        distance: Math.sqrt(
          Math.pow(place.lat - lat, 2) + Math.pow(place.lon - lon, 2)
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ distance, ...place }) => place);

    // Remove duplicates by name
    const uniquePlaces: NearbyPlace[] = [];
    const seenNames = new Set<string>();
    for (const place of sortedPlaces) {
      const key = `${place.name.toLowerCase()}-${place.address.toLowerCase()}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        uniquePlaces.push(place);
      }
    }

    console.log(`Found ${uniquePlaces.length} nearby places for ${lat}, ${lon}`);

    return new Response(
      JSON.stringify({ places: uniquePlaces.slice(0, 30) }),
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
