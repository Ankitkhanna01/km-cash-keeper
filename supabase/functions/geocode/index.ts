import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function expandProvinces(query: string): string {
  let expanded = query;
  for (const [abbr, full] of Object.entries(PROVINCE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

function looksLikeBusinessSearch(query: string): boolean {
  return /^[A-Za-z].*\d+\s+[A-Za-z]/.test(query) || !/\d/.test(query);
}

function hasExplicitLocation(query: string): boolean {
  const locationPatterns = /\b(victoria|vancouver|saanich|langford|nanaimo|kamloops|kelowna|surrey|burnaby|richmond|coquitlam|abbotsford|chilliwack|prince george|calgary|edmonton|toronto|montreal|ottawa|bc|british columbia|alberta|ontario|quebec)\b/i;
  return locationPatterns.test(query);
}

function extractStreetAddress(query: string): string | null {
  const match = query.match(/(\d+)\s+([A-Za-z].*)/);
  return match ? match[0] : null;
}

// Initialize Supabase client for cache operations
function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// Search local cache first
async function searchCache(query: string, near?: Nearby): Promise<any[]> {
  try {
    const supabase = getSupabaseClient();
    const searchTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    // Search for addresses where any search term matches
    const { data, error } = await supabase
      .from('cached_addresses')
      .select('*')
      .limit(10);
    
    if (error || !data) {
      console.log(`Cache search error: ${error?.message}`);
      return [];
    }
    
    // Filter results that match any search term
    const matches = data.filter((addr: any) => {
      const displayLower = addr.display_name?.toLowerCase() || '';
      const cachedTerms = addr.search_terms || [];
      
      // Check if query terms match display_name or cached search_terms
      return searchTerms.some(term => 
        displayLower.includes(term) || 
        cachedTerms.some((t: string) => t.includes(term) || term.includes(t))
      );
    });
    
    if (matches.length > 0) {
      console.log(`Cache hit: ${matches.length} results`);
      
      // Update hit count for matched results
      for (const match of matches) {
        await supabase
          .from('cached_addresses')
          .update({ hit_count: (match.hit_count || 1) + 1 })
          .eq('id', match.id);
      }
    }
    
    return matches.map((addr: any) => ({
      display_name: addr.display_name,
      name: addr.display_name.split(',')[0],
      lat: String(addr.lat),
      lon: String(addr.lon),
      type: 'cached',
      address: {
        road: addr.street,
        city: addr.city,
        state: addr.province,
        postcode: addr.postal_code,
      },
      source: 'cache',
    }));
  } catch (err) {
    console.error(`Cache error: ${err}`);
    return [];
  }
}

// Save HERE results to cache for future use
async function cacheHEREResults(results: any[], originalQuery: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const searchTerms = originalQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    for (const result of results) {
      if (!result.lat || !result.lon) continue;
      
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      
      // Check if already cached (within 50m)
      const { data: existing } = await supabase
        .from('cached_addresses')
        .select('id, search_terms')
        .gte('lat', lat - 0.0005)
        .lte('lat', lat + 0.0005)
        .gte('lon', lon - 0.0005)
        .lte('lon', lon + 0.0005)
        .limit(1);
      
      if (existing && existing.length > 0) {
        // Update search_terms if new terms found
        const existingTerms = existing[0].search_terms || [];
        const newTerms = [...new Set([...existingTerms, ...searchTerms])];
        
        await supabase
          .from('cached_addresses')
          .update({ search_terms: newTerms })
          .eq('id', existing[0].id);
          
        console.log(`Updated cache entry: ${result.display_name}`);
      } else {
        // Insert new cache entry
        const addr = result.address || {};
        await supabase
          .from('cached_addresses')
          .insert({
            display_name: result.display_name,
            street: addr.road || addr.street,
            city: addr.city,
            province: addr.state,
            postal_code: addr.postcode,
            lat,
            lon,
            source: 'here',
            search_terms: searchTerms,
          });
          
        console.log(`Cached: ${result.display_name}`);
      }
    }
  } catch (err) {
    console.error(`Cache write error: ${err}`);
  }
}

// Reverse geocode coordinates to get city/province
async function getCityFromCoordinates(lat: number, lon: number): Promise<{ city: string; province: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    const response = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json", "User-Agent": "DriverTaxTracker/1.0" } },
      3000
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || '';
    const province = address.state || '';
    
    if (city || province) {
      console.log(`GPS location: ${city}, ${province}`);
      return { city, province };
    }
    return null;
  } catch (err) {
    console.error(`Reverse geocode error: ${err}`);
    return null;
  }
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

// Search Photon (better for POIs)
async function searchPhoton(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&lang=en`;
    if (near) url += `&lat=${near.lat}&lon=${near.lon}`;
    
    console.log(`Photon: ${query}`);
    const response = await fetchWithTimeout(url, { headers: { "User-Agent": "DriverTaxTracker/1.0" } }, 5000);
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.features || [])
      .filter((f: any) => f.properties?.country === 'Canada')
      .map((f: any) => {
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [];
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
          type: props.osm_value,
          address: {
            house_number: props.housenumber,
            road: props.street,
            city: props.city || props.locality,
            state: props.state,
            postcode: props.postcode,
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
    const params = new URLSearchParams({
      format: "json",
      addressdetails: "1",
      q: query,
      limit: String(limit),
      countrycodes,
    });
    
    if (near) {
      const kmRadius = 50;
      const latDelta = kmRadius / 111;
      const lonDelta = kmRadius / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);
      params.set("viewbox", `${near.lon - lonDelta},${near.lat + latDelta},${near.lon + lonDelta},${near.lat - latDelta}`);
      params.set("bounded", "0");
    }

    console.log(`Nominatim: ${query}`);
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { Accept: "application/json", "User-Agent": "DriverTaxTracker/1.0" } },
      5000
    );
    if (!response.ok) return [];
    return (await response.json()).map((r: any) => ({ ...r, source: 'nominatim' }));
  } catch (err) {
    console.error(`Nominatim error: ${err}`);
    return [];
  }
}

// HERE API - used when OSM doesn't find good results for business searches
async function searchHERE(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  const hereApiKey = Deno.env.get("HERE_API_KEY");
  if (!hereApiKey) {
    console.log("No HERE_API_KEY configured");
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      apiKey: hereApiKey,
      limit: String(limit),
      in: 'countryCode:CAN',
    });
    
    if (near) {
      params.set('at', `${near.lat},${near.lon}`);
    }

    console.log(`HERE: ${query}`);
    const response = await fetchWithTimeout(
      `https://geocode.search.hereapi.com/v1/geocode?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      5000
    );
    
    if (!response.ok) {
      console.error(`HERE API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return (data.items || []).map((item: any) => {
      const addr = item.address || {};
      return {
        display_name: item.title || addr.label,
        name: item.title,
        lat: String(item.position?.lat),
        lon: String(item.position?.lng),
        type: item.resultType,
        address: {
          house_number: addr.houseNumber,
          road: addr.street,
          city: addr.city,
          state: addr.state,
          postcode: addr.postalCode,
        },
        source: 'here',
      };
    });
  } catch (err) {
    console.error(`HERE error: ${err}`);
    return [];
  }
}

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

function deduplicateResults(results: any[]): any[] {
  const seen = new Map<string, any>();
  for (const result of results) {
    const lat = parseFloat(result.lat).toFixed(5);
    const lon = parseFloat(result.lon).toFixed(5);
    const key = `${lat},${lon}`;
    // Prioritize: cache > here > others
    if (!seen.has(key) || result.source === 'cache' || (result.source === 'here' && seen.get(key)?.source !== 'cache')) {
      seen.set(key, result);
    }
  }
  return Array.from(seen.values());
}

// Check if results contain relevant business matches
function hasRelevantBusinessMatch(results: any[], query: string): boolean {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return results.some(r => {
    const name = (r.name || '').toLowerCase();
    const displayName = (r.display_name || '').toLowerCase();
    const matchCount = queryWords.filter(w => name.includes(w) || displayName.includes(w)).length;
    return matchCount >= Math.min(2, queryWords.length);
  });
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
    const hasLocation = hasExplicitLocation(q);
    
    console.log(`Query: "${q}" | Business: ${isBusinessSearch} | HasLocation: ${hasLocation}`);

    // 1. Check local cache first
    const cachedResults = await searchCache(q, near);
    if (cachedResults.length > 0 && hasRelevantBusinessMatch(cachedResults, q)) {
      console.log(`Returning ${cachedResults.length} cached results`);
      const formattedData = cachedResults.slice(0, limit).map(r => formatAddress(r));
      return new Response(JSON.stringify(formattedData), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    }

    // 2. If business search without location, try to get city from GPS coordinates
    let enhancedQuery = expandedQuery;
    
    if (isBusinessSearch && !hasLocation && near) {
      const userCity = await getCityFromCoordinates(near.lat, near.lon);
      if (userCity && userCity.city) {
        enhancedQuery = `${expandedQuery} ${userCity.city}`;
        console.log(`Enhanced query: "${enhancedQuery}"`);
      }
    }

    // 3. Search both OSM sources in parallel
    const [photonResults, nominatimResults] = await Promise.all([
      searchPhoton(enhancedQuery, near, limit),
      searchNominatim(enhancedQuery, countrycodes, near, limit),
    ]);

    console.log(`OSM: Photon=${photonResults.length}, Nominatim=${nominatimResults.length}`);
    let allResults = [...cachedResults, ...photonResults, ...nominatimResults];

    // 4. For business searches: use HERE if OSM returns no results OR doesn't have relevant matches
    let hereResults: any[] = [];
    if (isBusinessSearch) {
      const hasGoodOSMResults = allResults.length > 0 && hasRelevantBusinessMatch(allResults, q);
      
      if (!hasGoodOSMResults) {
        console.log("OSM didn't find relevant business match, trying HERE...");
        hereResults = await searchHERE(enhancedQuery, near, limit);
        
        if (hereResults.length > 0) {
          console.log(`HERE found ${hereResults.length} results`);
          // Prepend HERE results for business searches
          allResults = [...hereResults, ...allResults];
          
          // Cache HERE results for future searches (async, don't await)
          cacheHEREResults(hereResults, q);
        }
      }
    }

    // 5. Fallback: try extracting street address if no results
    if (allResults.length === 0) {
      const streetAddr = extractStreetAddress(enhancedQuery);
      if (streetAddr) {
        console.log(`Trying street: ${streetAddr}`);
        const streetResults = await searchNominatim(streetAddr, countrycodes, near, limit);
        allResults = streetResults;
      }
    }

    // 6. Last resort for any query with no results: try HERE
    if (allResults.length === 0) {
      console.log("No OSM results, trying HERE as last resort...");
      hereResults = await searchHERE(enhancedQuery, near, limit);
      if (hereResults.length > 0) {
        console.log(`HERE found ${hereResults.length} results`);
        allResults = hereResults;
        
        // Cache these results too
        cacheHEREResults(hereResults, q);
      }
    }

    // 7. Deduplicate and format
    const combined = deduplicateResults(allResults);
    
    // Sort by relevance
    const queryLower = q.toLowerCase();
    combined.sort((a, b) => {
      // Cache/HERE results first for business searches
      if (a.source === 'cache' && b.source !== 'cache') return -1;
      if (b.source === 'cache' && a.source !== 'cache') return 1;
      if (a.source === 'here' && b.source !== 'here') return -1;
      if (b.source === 'here' && a.source !== 'here') return 1;
      
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aMatch = aName.includes(queryLower) || queryLower.includes(aName);
      const bMatch = bName.includes(queryLower) || queryLower.includes(bName);
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
      return 0;
    });

    const formattedData = combined.slice(0, limit).map(r => formatAddress(r));
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
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
