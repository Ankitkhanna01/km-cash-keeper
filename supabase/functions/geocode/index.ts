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
  const latDelta = kmRadius / 111;
  const lonDelta = kmRadius / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);

  const left = near.lon - lonDelta;
  const right = near.lon + lonDelta;
  const top = near.lat + latDelta;
  const bottom = near.lat - latDelta;

  return `${left},${top},${right},${bottom}`;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function queryNominatim(params: URLSearchParams, bounded: boolean): Promise<Response> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = params.toString();
  
  if (bounded) {
    url.searchParams.set("bounded", "1");
  } else {
    url.searchParams.delete("bounded");
    url.searchParams.delete("viewbox");
  }

  console.log(`Querying Nominatim (bounded=${bounded}): ${url.searchParams.get("q")}`);

  return fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "DriverTaxTracker/1.0 (Lovable Cloud)",
    },
  }, 5000); // 5 second timeout
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

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("addressdetails", "1");
    params.set("q", q);
    params.set("limit", String(limit));
    params.set("countrycodes", countrycodes);

    const hasNearby = !!(body.near && isFiniteNumber(body.near.lat) && isFiniteNumber(body.near.lon));
    if (hasNearby) {
      params.set("viewbox", buildViewbox(body.near!, 25));
    }

    let res: Response;
    let data: unknown[];

    try {
      // Try bounded search first if we have nearby coordinates
      res = await queryNominatim(params, hasNearby);
      
      if (!res.ok) {
        throw new Error(`Nominatim returned ${res.status}`);
      }
      
      data = await res.json();
      
      // If bounded search returns no results, try unbounded
      if (Array.isArray(data) && data.length === 0 && hasNearby) {
        console.log("Bounded search returned no results, trying unbounded");
        res = await queryNominatim(params, false);
        if (res.ok) {
          data = await res.json();
        }
      }
    } catch (err) {
      // If bounded search times out or fails, try unbounded
      if (hasNearby) {
        console.log("Bounded search failed, falling back to unbounded:", err);
        try {
          res = await queryNominatim(params, false);
          if (res.ok) {
            data = await res.json();
          } else {
            throw new Error("Unbounded search also failed");
          }
        } catch (fallbackErr) {
          console.error("Both searches failed:", fallbackErr);
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.error("Search failed:", err);
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
