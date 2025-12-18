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

// Canadian province abbreviations
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

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

// Expand province abbreviations
function expandProvinces(query: string): string {
  let expanded = query;
  for (const [abbr, full] of Object.entries(PROVINCE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

// Check if query likely contains a business name
function looksLikeBusinessSearch(query: string): boolean {
  // Has text before a street number
  return /^[A-Za-z].*\d+\s+[A-Za-z]/.test(query) || 
         // Or is just a business name (no numbers)
         !/\d/.test(query);
}

// Extract street address portion
function extractStreetAddress(query: string): string | null {
  const match = query.match(/(\d+)\s+([A-Za-z].*)/);
  return match ? match[0] : null;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Search Photon (Komoot) - better for POIs/businesses
async function searchPhoton(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&lang=en`;
    
    // Add location bias if available
    if (near) {
      url += `&lat=${near.lat}&lon=${near.lon}`;
    }
    
    console.log(`Photon search: ${query}`);
    
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": "DriverTaxTracker/1.0" },
    }, 5000);
    
    if (!response.ok) return [];
    
    const data = await response.json();
    
    // Convert Photon format to Nominatim-like format
    return (data.features || [])
      .filter((f: any) => f.properties?.country === 'Canada')
      .map((f: any) => {
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [];
        
        // Build display name
        const parts: string[] = [];
        if (props.name) parts.push(props.name);
        if (props.housenumber && props.street) parts.push(`${props.housenumber} ${props.street}`);
        else if (props.street) parts.push(props.street);
        if (props.city || props.locality) parts.push(props.city || props.locality);
        if (props.state) parts.push(props.state);
        if (props.postcode) parts.push(props.postcode);
        
        return {
          display_name: parts.join(', ') || props.name,
          name: props.name || (props.housenumber ? `${props.housenumber} ${props.street}` : props.street),
          lat: String(coords[1]),
          lon: String(coords[0]),
          type: props.osm_value || props.type,
          address: {
            house_number: props.housenumber,
            road: props.street,
            city: props.city || props.locality,
            state: props.state,
            postcode: props.postcode,
            country: props.country,
          },
          source: 'photon',
        };
      });
  } catch (err) {
    console.error(`Photon error: ${err}`);
    return [];
  }
}

// Search Nominatim
async function searchNominatim(query: string, countrycodes: string, near?: Nearby, limit = 10): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("addressdetails", "1");
    params.set("q", query);
    params.set("limit", String(limit));
    params.set("countrycodes", countrycodes);
    
    if (near) {
      const kmRadius = 50;
      const latDelta = kmRadius / 111;
      const lonDelta = kmRadius / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);
      params.set("viewbox", `${near.lon - lonDelta},${near.lat + latDelta},${near.lon + lonDelta},${near.lat - latDelta}`);
      params.set("bounded", "0");
    }

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    console.log(`Nominatim search: ${query}`);

    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "DriverTaxTracker/1.0 (Lovable Cloud)",
      },
    }, 5000);

    if (!response.ok) return [];
    
    const results = await response.json();
    return results.map((r: any) => ({ ...r, source: 'nominatim' }));
  } catch (err) {
    console.error(`Nominatim error: ${err}`);
    return [];
  }
}

// Format address for display
function formatAddress(item: any): any {
  const address = item.address || {};
  const parts: string[] = [];
  
  if (item.name && !item.name.match(/^\d/)) {
    parts.push(item.name);
  }
  
  if (address.house_number && address.road) {
    parts.push(`${address.house_number} ${address.road}`);
  } else if (address.road) {
    parts.push(address.road);
  }
  
  if (address.suburb) parts.push(address.suburb);
  else if (address.neighbourhood) parts.push(address.neighbourhood);
  
  const city = address.city || address.town || address.village || address.municipality;
  if (city) parts.push(city);
  
  if (address.state) {
    const abbr = Object.entries(PROVINCE_ABBREVIATIONS).find(
      ([, full]) => full.toLowerCase() === address.state?.toLowerCase()
    );
    parts.push(abbr ? abbr[0].toUpperCase() : address.state);
  }
  
  if (address.postcode) parts.push(address.postcode);
  
  return {
    ...item,
    formatted_name: parts.join(', ') || item.display_name,
  };
}

// Deduplicate results by coordinates
function deduplicateResults(results: any[]): any[] {
  const seen = new Map<string, any>();
  
  for (const result of results) {
    const lat = parseFloat(result.lat).toFixed(5);
    const lon = parseFloat(result.lon).toFixed(5);
    const key = `${lat},${lon}`;
    
    // Prefer Photon results (better business names)
    if (!seen.has(key) || result.source === 'photon') {
      seen.set(key, result);
    }
  }
  
  return Array.from(seen.values());
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
    
    if (q.length < 2) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = Math.max(1, Math.min(20, Number(body.limit ?? 10)));
    const countrycodes = (body.countrycodes ?? "ca").toLowerCase().trim();
    const hasNearby = !!(body.near && isFiniteNumber(body.near.lat) && isFiniteNumber(body.near.lon));
    const near = hasNearby ? body.near : undefined;

    const expandedQuery = expandProvinces(q);
    const isBusinessSearch = looksLikeBusinessSearch(q);
    
    console.log(`Query: "${q}" | Business search: ${isBusinessSearch}`);

    // Search both sources in parallel
    const [photonResults, nominatimResults] = await Promise.all([
      // Photon is better for business/POI searches
      searchPhoton(expandedQuery, near, limit),
      searchNominatim(expandedQuery, countrycodes, near, limit),
    ]);

    console.log(`Photon: ${photonResults.length}, Nominatim: ${nominatimResults.length}`);

    // If business search and Photon found nothing, try extracting just the address
    let extraResults: any[] = [];
    if (isBusinessSearch && photonResults.length === 0) {
      const streetAddr = extractStreetAddress(expandedQuery);
      if (streetAddr) {
        console.log(`Trying street address: ${streetAddr}`);
        extraResults = await searchNominatim(streetAddr, countrycodes, near, limit);
      }
    }

    // Combine and deduplicate (Photon first for better business names)
    const combined = deduplicateResults([...photonResults, ...nominatimResults, ...extraResults]);
    
    // Sort by relevance (exact name matches first)
    const queryLower = q.toLowerCase();
    combined.sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aMatch = aName.includes(queryLower) || queryLower.includes(aName);
      const bMatch = bName.includes(queryLower) || queryLower.includes(bName);
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
      return 0;
    });

    // Format and limit results
    const formattedData = combined.slice(0, limit).map(formatAddress);
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
