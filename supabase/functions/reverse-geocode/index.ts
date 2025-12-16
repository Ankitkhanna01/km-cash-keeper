import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon } = await req.json();

    if (typeof lat !== "number" || typeof lon !== "number") {
      return new Response(
        JSON.stringify({ error: "lat and lon are required numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lon.toString());
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "KmCashKeeper/1.0",
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status}`);
    }

    const data = await response.json();
    
    // Format a nice address from the response
    let address = data.display_name || "";
    
    // Try to create a shorter, cleaner address
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

    return new Response(
      JSON.stringify({ 
        address,
        full_address: data.display_name,
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon)
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
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
