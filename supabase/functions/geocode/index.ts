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

function hasNaturalLanguage(query: string): boolean {
  // Detect queries like "fit 4 less near royal spice" or "starbucks opposite staples"
  const naturalPatterns = /\b(near|by|next to|across from|beside|behind|in front of|close to|around|at the|on the|opposite|across)\b/i;
  return naturalPatterns.test(query);
}

function hasExplicitLocation(query: string): boolean {
  // Check if query already includes a city/province/area name
  const locationPatterns = /\b(victoria|vancouver|saanich|langford|nanaimo|kamloops|kelowna|surrey|burnaby|richmond|coquitlam|abbotsford|chilliwack|prince george|calgary|edmonton|toronto|montreal|ottawa|bc|british columbia|alberta|ontario|quebec)\b/i;
  return locationPatterns.test(query);
}

function extractStreetAddress(query: string): string | null {
  const match = query.match(/(\d+)\s+([A-Za-z].*)/);
  return match ? match[0] : null;
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

// HERE API fallback - only use when OSM services fail (5k free requests/month limit)
async function searchHERE(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  const hereApiKey = Deno.env.get("HERE_API_KEY");
  if (!hereApiKey) {
    console.log("No HERE_API_KEY for fallback");
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

    console.log(`HERE fallback: ${query}`);
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

// AI-powered address lookup using Lovable AI
async function lookupAddressWithAI(query: string, near?: Nearby): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.log("No LOVABLE_API_KEY for AI lookup");
    return null;
  }

  try {
    console.log(`AI lookup: ${query}${near ? ` near (${near.lat.toFixed(4)}, ${near.lon.toFixed(4)})` : ''}`);
    
    // Build location context for AI
    let locationHint = "";
    if (near) {
      locationHint = `\n\nIMPORTANT: The user is currently located near coordinates (${near.lat.toFixed(5)}, ${near.lon.toFixed(5)}). Find the location of the business that is CLOSEST to these coordinates. For chain businesses with multiple locations, pick the one nearest to the user.`;
    }
    
    const response = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are an address lookup assistant for Canadian businesses and locations. When given a business name with hints like "near [landmark]", "opposite [store]", or just a city/area name, find the actual street address.

IMPORTANT RULES:
1. The user might say things like "Fit 4 Less near Royal Spice" or "Starbucks opposite Staples" - use your knowledge to find the specific location based on these hints.
2. For chains with multiple locations, use the landmark/nearby business hint OR the user's GPS coordinates to pick the CORRECT specific location.
3. Include the unit/suite number if the business has one (e.g., "Unit 104" or "Suite 200").
4. Respond with ONLY the full street address in this exact format:
"[Street Number] [Street Name] [Unit if any], [City], [Province Abbreviation] [Postal Code]"

Examples:
- "805 Cloverdale Ave Unit 104, Victoria, BC V8X 5H9"
- "3440 Saanich Rd, Victoria, BC V8P 5A7"
- "123 Main St Suite 200, Vancouver, BC V6B 1A1"

If you cannot determine the exact address, respond with "UNKNOWN".
Do not include any other text, explanations, or the business name - just the address or UNKNOWN.${locationHint}`
            },
            {
              role: "user",
              content: `What is the street address of "${query}" in Canada?`
            }
          ],
          max_tokens: 100,
          temperature: 0.1,
        }),
      },
      8000
    );

    if (!response.ok) {
      console.error(`AI API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    if (!content || content === "UNKNOWN" || content.length < 10) {
      console.log("AI couldn't find address");
      return null;
    }
    
    console.log(`AI found: ${content}`);
    return content;
  } catch (err) {
    console.error(`AI lookup error: ${err}`);
    return null;
  }
}

// Geocode an AI-found address using both services
async function geocodeAIAddress(address: string, countrycodes: string, near?: Nearby): Promise<any[]> {
  // Try Nominatim first
  const nominatimResults = await searchNominatim(address, countrycodes, near, 5);
  if (nominatimResults.length > 0) {
    console.log(`AI address geocoded via Nominatim: ${nominatimResults.length}`);
    return nominatimResults;
  }
  
  // Fallback to Photon
  const photonResults = await searchPhoton(address, near, 5);
  if (photonResults.length > 0) {
    console.log(`AI address geocoded via Photon: ${photonResults.length}`);
    return photonResults;
  }
  
  console.log("AI address geocoding failed");
  return [];
}

function formatAddress(item: any, originalQuery?: string): any {
  // For AI-enhanced results, use the already-formatted display_name
  if (item.source === 'ai_enhanced') {
    return {
      ...item,
      formatted_name: item.display_name,
    };
  }
  
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
    if (!seen.has(key) || result.source === 'ai_enhanced') {
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
    const isNaturalLanguage = hasNaturalLanguage(q);
    const hasLocation = hasExplicitLocation(q);
    
    console.log(`Query: "${q}" | Business: ${isBusinessSearch} | Natural: ${isNaturalLanguage} | HasLocation: ${hasLocation}`);

    // If business search without location, try to get city from GPS coordinates
    let enhancedQuery = expandedQuery;
    let userCity: { city: string; province: string } | null = null;
    
    if (isBusinessSearch && !hasLocation && near) {
      userCity = await getCityFromCoordinates(near.lat, near.lon);
      if (userCity && userCity.city) {
        enhancedQuery = `${expandedQuery} ${userCity.city}`;
        console.log(`Enhanced query: "${enhancedQuery}"`);
      }
    }

    // For natural language queries, try AI first as it understands context better
    let allResults: any[] = [];
    
    if (isNaturalLanguage) {
      console.log("Natural language query, trying AI first...");
      
      const aiAddress = await lookupAddressWithAI(enhancedQuery, near);
      
      if (aiAddress) {
        const aiGeoResults = await geocodeAIAddress(aiAddress, countrycodes, near);
        
        if (aiGeoResults.length > 0) {
          // Extract business name (remove natural language parts)
          const businessName = q
            .replace(/\s+(near|by|next to|across from|beside|behind|in front of|close to|around|at the|on the|opposite)\s+.*/i, '')
            .replace(/\s+(victoria|vancouver|saanich|bc|british columbia|canada).*$/i, '')
            .trim();
          
          const enhancedResults = aiGeoResults.slice(0, 1).map(r => ({
            ...r,
            source: 'ai_enhanced',
            name: businessName,
            display_name: `${businessName}, ${aiAddress}`,
          }));
          
          console.log(`AI enhanced: ${enhancedResults.length} results for "${businessName}"`);
          allResults = enhancedResults;
        }
      }
    }
    
    // Search both map sources in parallel (if no AI results yet or not natural language)
    if (allResults.length === 0) {
      const [photonResults, nominatimResults] = await Promise.all([
        searchPhoton(enhancedQuery, near, limit),
        searchNominatim(enhancedQuery, countrycodes, near, limit),
      ]);

      console.log(`Maps: Photon=${photonResults.length}, Nominatim=${nominatimResults.length}`);
      allResults = [...photonResults, ...nominatimResults];

      // If business search and no/few results, try AI lookup
      if (isBusinessSearch && allResults.length < 3) {
        console.log("Few map results, trying AI lookup...");
        
        const aiAddress = await lookupAddressWithAI(enhancedQuery, near);
        
        if (aiAddress) {
          const aiGeoResults = await geocodeAIAddress(aiAddress, countrycodes, near);
          
          if (aiGeoResults.length > 0) {
            const businessName = q
              .replace(/\s+(near|by|next to|across from|beside|behind|in front of|close to|around|at the|on the|opposite)\s+.*/i, '')
              .replace(/\s+(victoria|vancouver|saanich|bc|british columbia|canada).*$/i, '')
              .trim();
            
            const enhancedResults = aiGeoResults.slice(0, 1).map(r => ({
              ...r,
              source: 'ai_enhanced',
              name: businessName,
              display_name: `${businessName}, ${aiAddress}`,
            }));
            
            console.log(`AI enhanced: ${enhancedResults.length} results`);
            allResults = [...enhancedResults, ...allResults];
          }
        }
      }
    }

    // Also try extracting street address as fallback
    if (allResults.length === 0) {
      const streetAddr = extractStreetAddress(enhancedQuery);
      if (streetAddr) {
        console.log(`Trying street: ${streetAddr}`);
        const streetResults = await searchNominatim(streetAddr, countrycodes, near, limit);
        allResults = streetResults;
      }
    }

    // Last resort: try HERE API (limited to 5k requests/month)
    if (allResults.length === 0) {
      console.log("OSM returned no results, trying HERE fallback...");
      const hereResults = await searchHERE(enhancedQuery, near, limit);
      if (hereResults.length > 0) {
        console.log(`HERE found ${hereResults.length} results`);
        allResults = hereResults;
      }
    }

    // Deduplicate and format
    const combined = deduplicateResults(allResults);
    
    // Sort by relevance
    const queryLower = q.toLowerCase();
    combined.sort((a, b) => {
      // AI-enhanced results first
      if (a.source === 'ai_enhanced' && b.source !== 'ai_enhanced') return -1;
      if (b.source === 'ai_enhanced' && a.source !== 'ai_enhanced') return 1;
      
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aMatch = aName.includes(queryLower) || queryLower.includes(aName);
      const bMatch = bName.includes(queryLower) || queryLower.includes(bName);
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
      return 0;
    });

    const formattedData = combined.slice(0, limit).map(r => formatAddress(r, q));
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
