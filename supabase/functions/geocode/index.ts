import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Nearby = { lat: number; lon: number };

type Body = {
  q?: string;
  limit?: number;
  countrycodes?: string;
  near?: Nearby;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function buildViewbox(near: Nearby, kmRadius = 30) {
  // ~111km per degree latitude
  const latDelta = kmRadius / 111;
  const lonDelta = kmRadius / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);

  const left = near.lon - lonDelta;
  const right = near.lon + lonDelta;
  const top = near.lat + latDelta;
  const bottom = near.lat - latDelta;

  // Nominatim expects: left,top,right,bottom (lon,lat,lon,lat)
  return `${left},${top},${right},${bottom}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require logged-in users (prevents public abuse and keeps API reliable)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const q = (body.q ?? "").trim();
    if (q.length < 3) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = Math.max(1, Math.min(10, Number(body.limit ?? 6)));
    const countrycodes = (body.countrycodes ?? "ca").toLowerCase().trim();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("countrycodes", countrycodes);

    if (body.near && isFiniteNumber(body.near.lat) && isFiniteNumber(body.near.lon)) {
      // Bias results toward user's current area (not strictly bounded)
      url.searchParams.set("viewbox", buildViewbox(body.near, 35));
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        // Required by Nominatim usage policy for non-browser calls
        "User-Agent": "DriverTaxTracker/1.0 (Lovable Cloud)",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Geocoding failed", details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // lightweight caching to reduce repeated queries
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
