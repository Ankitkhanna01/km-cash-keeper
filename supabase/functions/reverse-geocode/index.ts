import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 503 && i < retries) {
        // Wait before retry (exponential backoff)
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

    let data;
    try {
      const response = await fetchWithRetry(url.toString(), {
        headers: {
          "User-Agent": "KmCashKeeper/1.0 (delivery-driver-tax-tracker)",
          "Accept-Language": "en",
        },
      });

      if (!response.ok) {
        console.log(`Nominatim returned ${response.status}, using coordinate fallback`);
        // Return coordinates as address if service unavailable
        return new Response(
          JSON.stringify({ 
            address: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            full_address: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
            lat,
            lon,
            addressComponents: null
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      data = await response.json();
    } catch (fetchError) {
      console.log("Fetch failed, using coordinate fallback:", fetchError);
      return new Response(
        JSON.stringify({ 
          address: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          full_address: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          lat,
          lon,
          addressComponents: null
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
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
        lon: parseFloat(data.lon),
        addressComponents: data.address || null
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
