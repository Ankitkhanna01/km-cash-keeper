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

// Canadian province abbreviations for smart expansion
const PROVINCE_ABBREVIATIONS: Record<string, string> = {
  'bc': 'British Columbia',
  'ab': 'Alberta',
  'sk': 'Saskatchewan',
  'mb': 'Manitoba',
  'on': 'Ontario',
  'qc': 'Quebec',
  'nb': 'New Brunswick',
  'ns': 'Nova Scotia',
  'pe': 'Prince Edward Island',
  'pei': 'Prince Edward Island',
  'nl': 'Newfoundland and Labrador',
  'nt': 'Northwest Territories',
  'nwt': 'Northwest Territories',
  'yt': 'Yukon',
  'nu': 'Nunavut',
};

// Common Canadian city abbreviations
const CITY_ABBREVIATIONS: Record<string, string> = {
  'vic': 'Victoria',
  'van': 'Vancouver',
  'tor': 'Toronto',
  'mtl': 'Montreal',
  'cgy': 'Calgary',
  'edm': 'Edmonton',
  'wpg': 'Winnipeg',
  'ott': 'Ottawa',
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function buildViewbox(near: Nearby, kmRadius = 50) {
  const latDelta = kmRadius / 111;
  const lonDelta = kmRadius / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);

  const left = near.lon - lonDelta;
  const right = near.lon + lonDelta;
  const top = near.lat + latDelta;
  const bottom = near.lat - latDelta;

  return `${left},${top},${right},${bottom}`;
}

// Expand Canadian abbreviations in query
function expandCanadianAbbreviations(query: string): string {
  let expanded = query.toLowerCase();
  
  // Expand province abbreviations (check word boundaries)
  for (const [abbr, full] of Object.entries(PROVINCE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  // Expand city abbreviations
  for (const [abbr, full] of Object.entries(CITY_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded;
}

// Detect if user is searching near a specific Canadian region
function detectRegion(near: Nearby): string | null {
  // Victoria/Vancouver Island region
  if (near.lat > 48.2 && near.lat < 49.0 && near.lon > -124.0 && near.lon < -123.0) {
    return 'Victoria, British Columbia';
  }
  // Metro Vancouver region
  if (near.lat > 49.0 && near.lat < 49.5 && near.lon > -123.5 && near.lon < -122.5) {
    return 'Vancouver, British Columbia';
  }
  return null;
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
    url.searchParams.set("bounded", "0");
  }

  console.log(`Querying Nominatim (bounded=${bounded}): ${url.searchParams.get("q")}`);

  return fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "DriverTaxTracker/1.0 (Lovable Cloud)",
    },
  }, 8000); // 8 second timeout
}

// Format address result for better Canadian display
function formatCanadianAddress(item: any): any {
  const address = item.address || {};
  
  // Build a cleaner display name for Canadian addresses
  const parts: string[] = [];
  
  // Street address
  if (address.house_number && address.road) {
    parts.push(`${address.house_number} ${address.road}`);
  } else if (address.road) {
    parts.push(address.road);
  } else if (item.name) {
    parts.push(item.name);
  }
  
  // Neighborhood/suburb
  if (address.suburb) {
    parts.push(address.suburb);
  } else if (address.neighbourhood) {
    parts.push(address.neighbourhood);
  }
  
  // City
  if (address.city) {
    parts.push(address.city);
  } else if (address.town) {
    parts.push(address.town);
  } else if (address.village) {
    parts.push(address.village);
  } else if (address.municipality) {
    parts.push(address.municipality);
  }
  
  // Province (use abbreviation for cleaner display)
  if (address.state) {
    const abbr = Object.entries(PROVINCE_ABBREVIATIONS).find(
      ([, full]) => full.toLowerCase() === address.state.toLowerCase()
    );
    parts.push(abbr ? abbr[0].toUpperCase() : address.state);
  }
  
  // Postal code
  if (address.postcode) {
    parts.push(address.postcode);
  }
  
  return {
    ...item,
    formatted_name: parts.join(', ') || item.display_name,
  };
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
    let q = (body.q ?? "").trim();
    
    if (q.length < 2) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Expand Canadian abbreviations
    const originalQuery = q;
    q = expandCanadianAbbreviations(q);
    console.log(`Query: "${originalQuery}" -> Expanded: "${q}"`);

    const limit = Math.max(1, Math.min(20, Number(body.limit ?? 10)));
    const countrycodes = (body.countrycodes ?? "ca").toLowerCase().trim();

    const hasNearby = !!(body.near && isFiniteNumber(body.near.lat) && isFiniteNumber(body.near.lon));
    
    // If we have nearby coords and query doesn't include city/region, append detected region
    let searchQuery = q;
    if (hasNearby && body.near) {
      const region = detectRegion(body.near);
      // Only add region if query doesn't already contain a city/province
      const hasLocation = /victoria|vancouver|saanich|oak bay|esquimalt|langford|sidney|colwood/i.test(q);
      if (region && !hasLocation) {
        searchQuery = `${q}, ${region}`;
        console.log(`Added region context: "${searchQuery}"`);
      }
    }

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("addressdetails", "1");
    params.set("q", searchQuery);
    params.set("limit", String(limit));
    params.set("countrycodes", countrycodes);

    if (hasNearby && body.near) {
      params.set("viewbox", buildViewbox(body.near, 50));
    }

    let data: any[] = [];

    try {
      // Try bounded search first if we have nearby coordinates
      let res = await queryNominatim(params, hasNearby);
      
      if (res.ok) {
        data = await res.json();
      }
      
      // If no results, try without region context
      if (Array.isArray(data) && data.length === 0 && searchQuery !== q) {
        console.log("No results with region, trying original query");
        params.set("q", q);
        res = await queryNominatim(params, hasNearby);
        if (res.ok) {
          data = await res.json();
        }
      }
      
      // If still no results with bounded search, try unbounded
      if (Array.isArray(data) && data.length === 0 && hasNearby) {
        console.log("Bounded search returned no results, trying unbounded");
        params.delete("viewbox");
        res = await queryNominatim(params, false);
        if (res.ok) {
          data = await res.json();
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      // Return empty results on error
      data = [];
    }

    // Format results for Canadian addresses
    const formattedData = Array.isArray(data) 
      ? data.map(formatCanadianAddress)
      : [];

    console.log(`Returning ${formattedData.length} results`);

    return new Response(JSON.stringify(formattedData), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
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
