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

function buildViewbox(near: Nearby, kmRadius = 50) {
  const latDelta = kmRadius / 111;
  const lonDelta = kmRadius / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);
  return `${near.lon - lonDelta},${near.lat + latDelta},${near.lon + lonDelta},${near.lat - latDelta}`;
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

// Extract street address from query (removes business names, unit numbers, postal codes)
function extractStreetAddress(query: string): string | null {
  // Match Canadian street address pattern: number + street name
  const streetMatch = query.match(/(\d+)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Ave(?:nue)?|St(?:reet)?|Rd|Road|Dr(?:ive)?|Blvd|Boulevard|Cr(?:escent)?|Crt|Court|Way|Lane|Ln|Pl(?:ace)?|Terr(?:ace)?|Circle|Cir))/i);
  
  if (streetMatch) {
    return streetMatch[0].trim();
  }
  return null;
}

// Extract city from query
function extractCity(query: string): string | null {
  // Common Victoria area cities/municipalities
  const cities = ['Victoria', 'Saanich', 'Oak Bay', 'Esquimalt', 'Langford', 'Colwood', 'Sidney', 'View Royal', 'Metchosin', 'Sooke', 'Central Saanich', 'North Saanich', 'Highlands'];
  
  const lowerQuery = query.toLowerCase();
  for (const city of cities) {
    if (lowerQuery.includes(city.toLowerCase())) {
      return city;
    }
  }
  return null;
}

// Generate search variations from query
function generateSearchVariations(originalQuery: string): string[] {
  const variations: string[] = [];
  const query = expandProvinces(originalQuery);
  
  // 1. Original query (with province expansion)
  variations.push(query);
  
  // 2. Try without unit/suite numbers
  const withoutUnit = query.replace(/\s*(unit|suite|apt|apartment|#)\s*\d+[a-z]?\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (withoutUnit !== query) {
    variations.push(withoutUnit);
  }
  
  // 3. Try without postal code
  const withoutPostal = query.replace(/\s*[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutPostal !== query && !variations.includes(withoutPostal)) {
    variations.push(withoutPostal);
  }
  
  // 4. Extract just the street address + city
  const streetAddr = extractStreetAddress(query);
  const city = extractCity(query);
  if (streetAddr && city) {
    const streetWithCity = `${streetAddr}, ${city}`;
    if (!variations.includes(streetWithCity)) {
      variations.push(streetWithCity);
    }
    // Also try just street address
    if (!variations.includes(streetAddr)) {
      variations.push(streetAddr);
    }
  }
  
  // 5. Remove business names (text before the street number)
  const businessRemoved = query.replace(/^[^0-9]+(?=\d+\s+[A-Za-z])/i, '').trim();
  if (businessRemoved !== query && !variations.includes(businessRemoved)) {
    // Insert at position 1 (high priority)
    variations.splice(1, 0, businessRemoved);
  }
  
  return variations.filter(v => v.length >= 3);
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

async function queryNominatim(query: string, countrycodes: string, limit: number, viewbox?: string): Promise<any[]> {
  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("addressdetails", "1");
  params.set("q", query);
  params.set("limit", String(limit));
  params.set("countrycodes", countrycodes);
  
  if (viewbox) {
    params.set("viewbox", viewbox);
    params.set("bounded", "0");
  }

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  console.log(`Querying: ${query}`);

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "DriverTaxTracker/1.0 (Lovable Cloud)",
      },
    }, 6000);

    if (!response.ok) {
      console.error(`Nominatim returned ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (err) {
    console.error(`Query failed: ${err}`);
    return [];
  }
}

// Format Canadian address for display
function formatCanadianAddress(item: any): any {
  const address = item.address || {};
  const parts: string[] = [];
  
  if (address.house_number && address.road) {
    parts.push(`${address.house_number} ${address.road}`);
  } else if (address.road) {
    parts.push(address.road);
  } else if (item.name) {
    parts.push(item.name);
  }
  
  if (address.suburb) parts.push(address.suburb);
  else if (address.neighbourhood) parts.push(address.neighbourhood);
  
  if (address.city) parts.push(address.city);
  else if (address.town) parts.push(address.town);
  else if (address.village) parts.push(address.village);
  else if (address.municipality) parts.push(address.municipality);
  
  if (address.state) {
    const abbr = Object.entries(PROVINCE_ABBREVIATIONS).find(
      ([, full]) => full.toLowerCase() === address.state.toLowerCase()
    );
    parts.push(abbr ? abbr[0].toUpperCase() : address.state);
  }
  
  if (address.postcode) parts.push(address.postcode);
  
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
    const viewbox = hasNearby && body.near ? buildViewbox(body.near, 50) : undefined;

    // Generate search variations
    const variations = generateSearchVariations(q);
    console.log(`Search variations for "${q}":`, variations);

    let allResults: any[] = [];
    const seenIds = new Set<string>();

    // Try each variation until we get results
    for (const variation of variations) {
      const results = await queryNominatim(variation, countrycodes, limit, viewbox);
      
      if (Array.isArray(results) && results.length > 0) {
        // Add unique results
        for (const result of results) {
          const id = `${result.lat}-${result.lon}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            allResults.push(result);
          }
        }
        
        // If we have enough results, stop
        if (allResults.length >= limit) {
          break;
        }
      }
    }

    // Format results
    const formattedData = allResults.slice(0, limit).map(formatCanadianAddress);
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
