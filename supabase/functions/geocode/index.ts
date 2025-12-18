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

// Parse "near me" or "near [location]" from query
function parseNearQuery(query: string): { searchTerm: string; nearType: 'me' | 'location' | null; locationName: string | null } {
  // Match "near me" pattern
  const nearMeMatch = query.match(/^(.+?)\s+near\s+me$/i);
  if (nearMeMatch) {
    return { searchTerm: nearMeMatch[1].trim(), nearType: 'me', locationName: null };
  }
  
  // Match "near [location]" pattern
  const nearLocationMatch = query.match(/^(.+?)\s+near\s+(.+)$/i);
  if (nearLocationMatch) {
    const locationName = nearLocationMatch[2].trim();
    // Don't match if it's "near me"
    if (locationName.toLowerCase() !== 'me') {
      return { searchTerm: nearLocationMatch[1].trim(), nearType: 'location', locationName };
    }
  }
  
  return { searchTerm: query, nearType: null, locationName: null };
}

// Geocode a location name to get coordinates, biased by user's location
async function geocodeLocation(locationName: string, userLocation?: Nearby): Promise<Nearby | null> {
  try {
    const params = new URLSearchParams({
      format: "json",
      q: locationName,
      limit: "5",
      countrycodes: "ca",
    });
    
    // Bias search towards user's location if available
    if (userLocation) {
      const kmRadius = 30;
      const latDelta = kmRadius / 111;
      const lonDelta = kmRadius / (111 * Math.cos((userLocation.lat * Math.PI) / 180) || 1);
      params.set("viewbox", `${userLocation.lon - lonDelta},${userLocation.lat + latDelta},${userLocation.lon + lonDelta},${userLocation.lat - latDelta}`);
      params.set("bounded", "0");
    }
    
    console.log(`Geocoding location: ${locationName}`);
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { Accept: "application/json", "User-Agent": "DriverTaxTracker/1.0" } },
      5000
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (data.length > 0) {
      // If user location available, pick the closest result
      let best = data[0];
      if (userLocation && data.length > 1) {
        let minDist = Infinity;
        for (const item of data) {
          const dist = calculateDistanceMeters(
            userLocation.lat, userLocation.lon,
            parseFloat(item.lat), parseFloat(item.lon)
          );
          if (dist < minDist) {
            minDist = dist;
            best = item;
          }
        }
      }
      const lat = parseFloat(best.lat);
      const lon = parseFloat(best.lon);
      console.log(`Location found: ${locationName} -> ${lat}, ${lon} (${best.display_name})`);
      return { lat, lon };
    }
    return null;
  } catch (err) {
    console.error(`Geocode location error: ${err}`);
    return null;
  }
}

// Calculate distance between two points in meters (Haversine formula)
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Filter results by distance from a point
function filterByDistance(results: any[], center: Nearby, maxDistanceMeters: number): any[] {
  return results.filter(r => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (isNaN(lat) || isNaN(lon)) return false;
    const distance = calculateDistanceMeters(center.lat, center.lon, lat, lon);
    return distance <= maxDistanceMeters;
  }).map(r => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const distance = calculateDistanceMeters(center.lat, center.lon, lat, lon);
    return { ...r, distance_meters: Math.round(distance) };
  }).sort((a, b) => a.distance_meters - b.distance_meters);
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
    
    const { data, error } = await supabase
      .from('cached_addresses')
      .select('*')
      .limit(20);
    
    if (error || !data) {
      console.log(`Cache search error: ${error?.message}`);
      return [];
    }
    
    // Filter results that match any search term
    const matches = data.filter((addr: any) => {
      const displayLower = addr.display_name?.toLowerCase() || '';
      const cachedTerms = addr.search_terms || [];
      
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
      name: addr.display_name.split(',')[0].trim(),
      lat: String(addr.lat),
      lon: String(addr.lon),
      type: 'cached',
      address: {
        road: addr.street,
        city: addr.city,
        state: addr.province,
        postcode: addr.postal_code,
        full_label: addr.display_name, // Use display_name as full_label for consistent formatting
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
        const existingTerms = existing[0].search_terms || [];
        const newTerms = [...new Set([...existingTerms, ...searchTerms])];
        
        await supabase
          .from('cached_addresses')
          .update({ search_terms: newTerms })
          .eq('id', existing[0].id);
          
        console.log(`Updated cache entry: ${result.display_name}`);
      } else {
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
      // Build full address from HERE data - addr.label has the complete address
      const fullAddress = addr.label || item.title;
      // Extract unit/suite if present in the label
      const unitMatch = fullAddress.match(/Unit\s+\d+|Suite\s+\d+|#\d+/i);
      const unit = unitMatch ? unitMatch[0] : null;
      
      return {
        display_name: fullAddress,
        name: item.title,
        lat: String(item.position?.lat),
        lon: String(item.position?.lng),
        type: item.resultType,
        address: {
          house_number: addr.houseNumber,
          road: addr.street,
          unit: unit,
          city: addr.city,
          state: addr.state,
          postcode: addr.postalCode,
          full_label: addr.label,
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
  
  // If we have a full_label from HERE, use it as it's the most complete
  if (address.full_label) {
    const result: any = {
      ...item,
      formatted_name: address.full_label,
    };
    
    if (item.distance_meters !== undefined) {
      result.distance_meters = item.distance_meters;
      result.distance_label = item.distance_meters < 1000 
        ? `${item.distance_meters}m away` 
        : `${(item.distance_meters / 1000).toFixed(1)}km away`;
    }
    
    return result;
  }
  
  // Build address from components
  const parts: string[] = [];
  
  // Add business name if it exists and doesn't start with a number
  if (item.name && !item.name.match(/^\d/)) {
    parts.push(item.name);
  }
  
  // Build street address with unit if available
  let streetPart = '';
  if (address.house_number && address.road) {
    streetPart = `${address.house_number} ${address.road}`;
    if (address.unit) {
      streetPart += ` ${address.unit}`;
    }
    parts.push(streetPart);
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
  
  // Add distance if available
  const result: any = {
    ...item,
    formatted_name: parts.join(', ') || item.display_name,
  };
  
  if (item.distance_meters !== undefined) {
    result.distance_meters = item.distance_meters;
    result.distance_label = item.distance_meters < 1000 
      ? `${item.distance_meters}m away` 
      : `${(item.distance_meters / 1000).toFixed(1)}km away`;
  }
  
  return result;
}

function deduplicateResults(results: any[]): any[] {
  const seen = new Map<string, any>();
  for (const result of results) {
    const lat = parseFloat(result.lat).toFixed(5);
    const lon = parseFloat(result.lon).toFixed(5);
    const key = `${lat},${lon}`;
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
    const userLocation = hasNearby ? body.near : undefined;

    // Parse "near me" or "near [location]" queries
    const { searchTerm, nearType, locationName } = parseNearQuery(q);
    
    let searchCenter: Nearby | undefined = userLocation;
    let maxDistance: number | null = null;
    let actualSearchTerm = q;
    
    if (nearType === 'me' && userLocation) {
      // "near me" - use user's GPS, 300m radius
      searchCenter = userLocation;
      maxDistance = 300;
      actualSearchTerm = searchTerm;
      console.log(`"Near me" search: "${searchTerm}" within 300m of user location`);
    } else if (nearType === 'location' && locationName) {
      // "near [location]" - geocode location first (biased by user GPS), then 500m radius
      const locationCoords = await geocodeLocation(locationName, userLocation);
      if (locationCoords) {
        searchCenter = locationCoords;
        maxDistance = 1000; // 1km radius for "near [location]"
        actualSearchTerm = searchTerm;
        console.log(`"Near ${locationName}" search: "${searchTerm}" within 500m of ${locationCoords.lat}, ${locationCoords.lon}`);
      } else {
        console.log(`Could not geocode location: ${locationName}, falling back to normal search`);
      }
    }

    const expandedQuery = expandProvinces(actualSearchTerm);
    const isBusinessSearch = looksLikeBusinessSearch(actualSearchTerm);
    const hasLocation = hasExplicitLocation(actualSearchTerm);
    
    console.log(`Query: "${actualSearchTerm}" | Business: ${isBusinessSearch} | HasLocation: ${hasLocation} | NearType: ${nearType || 'none'}`);

    // 1. Check local cache first
    const cachedResults = await searchCache(actualSearchTerm, searchCenter);
    
    // If we have a distance filter, apply it to cache results
    let filteredCache = cachedResults;
    if (maxDistance && searchCenter && cachedResults.length > 0) {
      filteredCache = filterByDistance(cachedResults, searchCenter, maxDistance);
      console.log(`Cache: ${cachedResults.length} total, ${filteredCache.length} within ${maxDistance}m`);
    }
    
    if (filteredCache.length > 0 && hasRelevantBusinessMatch(filteredCache, actualSearchTerm)) {
      console.log(`Returning ${filteredCache.length} cached results`);
      const formattedData = filteredCache.slice(0, limit).map(r => formatAddress(r));
      return new Response(JSON.stringify(formattedData), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    }

    // 2. If business search without location, try to get city from GPS coordinates
    let enhancedQuery = expandedQuery;
    
    if (isBusinessSearch && !hasLocation && searchCenter) {
      const userCity = await getCityFromCoordinates(searchCenter.lat, searchCenter.lon);
      if (userCity && userCity.city) {
        enhancedQuery = `${expandedQuery} ${userCity.city}`;
        console.log(`Enhanced query: "${enhancedQuery}"`);
      }
    }

    // 3. Search both OSM sources in parallel
    const [photonResults, nominatimResults] = await Promise.all([
      searchPhoton(enhancedQuery, searchCenter, limit * 2), // Get more results for filtering
      searchNominatim(enhancedQuery, countrycodes, searchCenter, limit * 2),
    ]);

    console.log(`OSM: Photon=${photonResults.length}, Nominatim=${nominatimResults.length}`);
    let allResults = [...filteredCache, ...photonResults, ...nominatimResults];

    // 4. For business searches: use HERE if OSM returns no results OR doesn't have relevant matches
    let hereResults: any[] = [];
    if (isBusinessSearch) {
      const hasGoodOSMResults = allResults.length > 0 && hasRelevantBusinessMatch(allResults, actualSearchTerm);
      
      if (!hasGoodOSMResults) {
        console.log("OSM didn't find relevant business match, trying HERE...");
        hereResults = await searchHERE(enhancedQuery, searchCenter, limit * 2);
        
        if (hereResults.length > 0) {
          console.log(`HERE found ${hereResults.length} results`);
          allResults = [...hereResults, ...allResults];
          
          // Cache HERE results for future searches (async, don't await)
          cacheHEREResults(hereResults, actualSearchTerm);
        }
      }
    }

    // 5. Fallback: try extracting street address if no results
    if (allResults.length === 0) {
      const streetAddr = extractStreetAddress(enhancedQuery);
      if (streetAddr) {
        console.log(`Trying street: ${streetAddr}`);
        const streetResults = await searchNominatim(streetAddr, countrycodes, searchCenter, limit);
        allResults = streetResults;
      }
    }

    // 6. Last resort for any query with no results: try HERE
    if (allResults.length === 0) {
      console.log("No OSM results, trying HERE as last resort...");
      hereResults = await searchHERE(enhancedQuery, searchCenter, limit);
      if (hereResults.length > 0) {
        console.log(`HERE found ${hereResults.length} results`);
        allResults = hereResults;
        cacheHEREResults(hereResults, actualSearchTerm);
      }
    }

    // 7. Apply distance filter if "near me" or "near [location]" search
    if (maxDistance && searchCenter && allResults.length > 0) {
      allResults = filterByDistance(allResults, searchCenter, maxDistance);
      console.log(`Filtered to ${allResults.length} results within ${maxDistance}m`);
    }

    // 8. Deduplicate and format
    const combined = deduplicateResults(allResults);
    
    // Sort by distance if we have distance info, otherwise by relevance
    const queryLower = actualSearchTerm.toLowerCase();
    combined.sort((a, b) => {
      // If we have distance, sort by distance first
      if (a.distance_meters !== undefined && b.distance_meters !== undefined) {
        return a.distance_meters - b.distance_meters;
      }
      
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
