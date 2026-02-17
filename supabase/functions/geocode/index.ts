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

// Usage tracking - check if we're approaching limits
const GOOGLE_MONTHLY_LIMITS = {
  geocoding: 10000,
  autocomplete: 10000,
  places_details: 10000,
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
  const nearMeMatch = query.match(/^(.+?)\s+near\s+me$/i);
  if (nearMeMatch) {
    return { searchTerm: nearMeMatch[1].trim(), nearType: 'me', locationName: null };
  }
  
  const nearLocationMatch = query.match(/^(.+?)\s+near\s+(.+)$/i);
  if (nearLocationMatch) {
    const locationName = nearLocationMatch[2].trim();
    if (locationName.toLowerCase() !== 'me') {
      return { searchTerm: nearLocationMatch[1].trim(), nearType: 'location', locationName };
    }
  }
  
  return { searchTerm: query, nearType: null, locationName: null };
}

// Calculate distance between two points in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
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

function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// Track API usage and check limits
async function checkAndTrackUsage(apiType: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  try {
    const supabase = getSupabaseClient();
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `google_${apiType}_${monthKey}`;
    
    // Try to get current count
    const { data } = await supabase
      .from('cached_addresses')
      .select('hit_count')
      .eq('display_name', key)
      .single();
    
    const currentCount = data?.hit_count || 0;
    const limit = GOOGLE_MONTHLY_LIMITS[apiType as keyof typeof GOOGLE_MONTHLY_LIMITS] || 10000;
    
    if (currentCount >= limit * 0.9) {
      console.warn(`⚠️ GOOGLE API LIMIT WARNING: ${apiType} at ${currentCount}/${limit} (${Math.round(currentCount/limit*100)}%)`);
    }
    
    // Update count
    if (data) {
      await supabase
        .from('cached_addresses')
        .update({ hit_count: currentCount + 1 })
        .eq('display_name', key);
    } else {
      await supabase
        .from('cached_addresses')
        .insert({
          display_name: key,
          lat: 0,
          lon: 0,
          source: 'usage_tracking',
          hit_count: 1,
        });
    }
    
    return { allowed: currentCount < limit, count: currentCount + 1, limit };
  } catch (err) {
    console.error('Usage tracking error:', err);
    return { allowed: true, count: 0, limit: 10000 };
  }
}

// Search local cache first - GLOBAL SHARED CACHE for all users
async function searchCache(query: string, near?: Nearby): Promise<any[]> {
  try {
    const supabase = getSupabaseClient();
    const queryLower = query.toLowerCase().trim();
    const searchTerms = queryLower.split(/\s+/).filter(w => w.length > 1);
    
    // Build more targeted query for better cache hits
    let dbQuery = supabase
      .from('cached_addresses')
      .select('*')
      .neq('source', 'usage_tracking');
    
    // If we have coordinates, search nearby first (within ~500m)
    if (near) {
      const delta = 0.005; // ~500m
      dbQuery = dbQuery
        .gte('lat', near.lat - delta)
        .lte('lat', near.lat + delta)
        .gte('lon', near.lon - delta)
        .lte('lon', near.lon + delta);
    }
    
    const { data, error } = await dbQuery.limit(50);
    
    if (error || !data) {
      console.log(`Cache search error: ${error?.message}`);
      return [];
    }
    
    // Score and filter matches
    const matches = data.map((addr: any) => {
      const displayLower = addr.display_name?.toLowerCase() || '';
      const placeLower = addr.place_name?.toLowerCase() || '';
      const cachedTerms = (addr.search_terms || []).map((t: string) => t.toLowerCase());
      
      let score = 0;
      
      // Exact place name match = highest priority
      if (placeLower && queryLower.includes(placeLower)) score += 100;
      if (placeLower && placeLower.includes(queryLower)) score += 80;
      
      // Search term matches
      for (const term of searchTerms) {
        if (displayLower.includes(term)) score += 10;
        if (placeLower.includes(term)) score += 15;
        if (cachedTerms.some((t: string) => t.includes(term) || term.includes(t))) score += 5;
      }
      
      return { addr, score };
    }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);
    
    if (matches.length > 0) {
      console.log(`✅ Cache hit: ${matches.length} results for "${query}"`);
      
      // Update hit count for cache analytics (fire and forget)
      for (const { addr } of matches.slice(0, 5)) {
        supabase
          .from('cached_addresses')
          .update({ hit_count: (addr.hit_count || 1) + 1 })
          .eq('id', addr.id)
          .then(() => {});
      }
    }
    
    return matches.slice(0, 10).map(({ addr }) => ({
      display_name: addr.display_name,
      name: addr.place_name || addr.display_name.split(',')[0].trim(),
      lat: String(addr.lat),
      lon: String(addr.lon),
      type: 'cached',
      address: {
        road: addr.street,
        city: addr.city,
        state: addr.province,
        postcode: addr.postal_code,
        full_label: addr.display_name,
      },
      source: 'cache',
    }));
  } catch (err) {
    console.error(`Cache error: ${err}`);
    return [];
  }
}

// Save Google results to cache - SHARED for all users (user_id = NULL)
async function cacheGoogleResults(results: any[], originalQuery: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const searchTerms = originalQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    for (const result of results) {
      if (!result.lat || !result.lon) continue;
      
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      
      // Check if similar location already exists (within ~50m)
      const { data: existing } = await supabase
        .from('cached_addresses')
        .select('id, search_terms, hit_count')
        .gte('lat', lat - 0.0005)
        .lte('lat', lat + 0.0005)
        .gte('lon', lon - 0.0005)
        .lte('lon', lon + 0.0005)
        .limit(1);
      
      const addr = result.address || {};
      const placeName = result.name || result.display_name?.split(',')[0]?.trim() || '';
      
      if (existing && existing.length > 0) {
        // Update existing cache entry with new search terms
        const existingTerms = existing[0].search_terms || [];
        const newTerms = [...new Set([...existingTerms, ...searchTerms])];
        
        await supabase
          .from('cached_addresses')
          .update({ 
            search_terms: newTerms,
            hit_count: (existing[0].hit_count || 1) + 1,
            // Update place_name if we have a better one
            ...(placeName && { place_name: placeName }),
          })
          .eq('id', existing[0].id);
          
        console.log(`📝 Updated cache: ${result.display_name}`);
      } else {
        // Insert new cache entry - user_id = NULL for global sharing
        await supabase
          .from('cached_addresses')
          .insert({
            display_name: result.display_name,
            place_name: placeName,
            street: addr.road || addr.street || addr.house_number ? `${addr.house_number || ''} ${addr.road || ''}`.trim() : null,
            city: addr.city || addr.town || addr.locality,
            province: addr.state,
            postal_code: addr.postcode,
            lat,
            lon,
            source: 'google',
            search_terms: searchTerms,
            user_id: null, // NULL = shared globally for all users
            hit_count: 1,
          });
          
        console.log(`💾 Cached NEW: ${placeName || result.display_name}`);
      }
    }
  } catch (err) {
    console.error(`Cache write error: ${err}`);
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

// GOOGLE MAPS API - Primary geocoding source
async function searchGoogle(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) {
    console.log("No GOOGLE_MAPS_API_KEY configured");
    return [];
  }

  // Check usage limits
  const usage = await checkAndTrackUsage('geocoding');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE GEOCODING LIMIT EXCEEDED: ${usage.count}/${usage.limit} - Falling back to OSM`);
    return [];
  }

  try {
    const params = new URLSearchParams({
      address: query,
      key: googleApiKey,
      components: 'country:CA',
    });
    
    if (near) {
      params.set('bounds', `${near.lat - 0.5},${near.lon - 0.5}|${near.lat + 0.5},${near.lon + 0.5}`);
    }

    console.log(`Google Geocoding: ${query} (usage: ${usage.count}/${usage.limit})`);
    const response = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      5000
    );
    
    if (!response.ok) {
      console.error(`Google API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
      console.warn(`🚨 GOOGLE API STATUS: ${data.status} - ${data.error_message || 'Limit exceeded'}`);
      return [];
    }
    
    return (data.results || []).slice(0, limit).map((item: any) => {
      const location = item.geometry?.location || {};
      const addressComponents = item.address_components || [];
      
      const getComponent = (type: string) => 
        addressComponents.find((c: any) => c.types.includes(type))?.long_name || '';
      const getShortComponent = (type: string) => 
        addressComponents.find((c: any) => c.types.includes(type))?.short_name || '';
      
      return {
        display_name: item.formatted_address,
        name: item.formatted_address.split(',')[0].trim(),
        lat: String(location.lat),
        lon: String(location.lng),
        type: item.types?.[0] || 'address',
        address: {
          house_number: getComponent('street_number'),
          road: getComponent('route'),
          city: getComponent('locality') || getComponent('sublocality'),
          state: getComponent('administrative_area_level_1'),
          postcode: getComponent('postal_code'),
          full_label: item.formatted_address,
        },
        source: 'google',
      };
    });
  } catch (err) {
    console.error(`Google error: ${err}`);
    return [];
  }
}

// Google Places Autocomplete - for business searches
async function searchGooglePlaces(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) {
    return [];
  }

  const usage = await checkAndTrackUsage('autocomplete');
  if (!usage.allowed) {
    console.warn(`🚨 GOOGLE AUTOCOMPLETE LIMIT EXCEEDED: ${usage.count}/${usage.limit} - Falling back to OSM`);
    return [];
  }

  try {
    const params = new URLSearchParams({
      input: query,
      key: googleApiKey,
      components: 'country:ca',
      types: 'establishment',
    });
    
    if (near) {
      params.set('location', `${near.lat},${near.lon}`);
      params.set('radius', '50000'); // 50km radius bias
    }

    console.log(`Google Places Autocomplete: ${query} (usage: ${usage.count}/${usage.limit})`);
    const response = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      5000
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'REQUEST_DENIED') {
      console.warn(`🚨 GOOGLE PLACES STATUS: ${data.status}`);
      return [];
    }
    
    // Get place details for each prediction
    const predictions = (data.predictions || []).slice(0, Math.min(limit, 5)); // Limit to save API calls
    const detailedResults: any[] = [];
    
    for (const prediction of predictions) {
      const detailUsage = await checkAndTrackUsage('places_details');
      if (!detailUsage.allowed) {
        console.warn(`🚨 GOOGLE PLACES DETAILS LIMIT EXCEEDED - stopping detail lookups`);
        break;
      }
      
      try {
        const detailParams = new URLSearchParams({
          place_id: prediction.place_id,
          key: googleApiKey,
          fields: 'formatted_address,geometry,name,address_components',
        });
        
        const detailResponse = await fetchWithTimeout(
          `https://maps.googleapis.com/maps/api/place/details/json?${detailParams.toString()}`,
          { headers: { Accept: "application/json" } },
          3000
        );
        
        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          if (detailData.status === 'OK' && detailData.result) {
            const result = detailData.result;
            const location = result.geometry?.location || {};
            const addressComponents = result.address_components || [];
            
            const getComponent = (type: string) => 
              addressComponents.find((c: any) => c.types.includes(type))?.long_name || '';
            
            detailedResults.push({
              display_name: result.formatted_address,
              name: result.name || result.formatted_address.split(',')[0].trim(),
              lat: String(location.lat),
              lon: String(location.lng),
              type: 'establishment',
              address: {
                house_number: getComponent('street_number'),
                road: getComponent('route'),
                city: getComponent('locality') || getComponent('sublocality'),
                state: getComponent('administrative_area_level_1'),
                postcode: getComponent('postal_code'),
                full_label: result.formatted_address,
              },
              source: 'google',
            });
          }
        }
      } catch (e) {
        console.log(`Place detail error: ${e}`);
      }
    }
    
    return detailedResults;
  } catch (err) {
    console.error(`Google Places error: ${err}`);
    return [];
  }
}

// FALLBACK: Search Photon (free, good for POIs)
async function searchPhoton(query: string, near?: Nearby, limit = 10): Promise<any[]> {
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&lang=en`;
    if (near) url += `&lat=${near.lat}&lon=${near.lon}`;
    
    console.log(`Photon (fallback): ${query}`);
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

// FALLBACK: Search Nominatim (free)
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

    console.log(`Nominatim (fallback): ${query}`);
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

// Geocode a location name
async function geocodeLocation(locationName: string, userLocation?: Nearby): Promise<Nearby | null> {
  // Try Google first
  const googleResults = await searchGoogle(locationName, userLocation, 1);
  if (googleResults.length > 0) {
    return { lat: parseFloat(googleResults[0].lat), lon: parseFloat(googleResults[0].lon) };
  }
  
  // Fallback to Nominatim
  try {
    const params = new URLSearchParams({
      format: "json",
      q: locationName,
      limit: "1",
      countrycodes: "ca",
    });
    
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { Accept: "application/json", "User-Agent": "DriverTaxTracker/1.0" } },
      5000
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    console.error(`Geocode location error: ${err}`);
    return null;
  }
}

// Reverse geocode for city/province
async function getCityFromCoordinates(lat: number, lon: number): Promise<{ city: string; province: string } | null> {
  // Try Google first (it's more reliable)
  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (googleApiKey) {
    try {
      const usage = await checkAndTrackUsage('geocoding');
      if (usage.allowed) {
        const response = await fetchWithTimeout(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${googleApiKey}&result_type=locality`,
          { headers: { Accept: "application/json" } },
          3000
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results[0]) {
            const components = data.results[0].address_components || [];
            const city = components.find((c: any) => c.types.includes('locality'))?.long_name || '';
            const province = components.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name || '';
            if (city || province) {
              return { city, province };
            }
          }
        }
      }
    } catch (err) {
      console.log(`Google reverse geocode error: ${err}`);
    }
  }
  
  // Fallback to Nominatim
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
      return { city, province };
    }
    return null;
  } catch (err) {
    console.error(`Reverse geocode error: ${err}`);
    return null;
  }
}

function formatAddress(item: any): any {
  const address = item.address || {};
  
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
  
  const parts: string[] = [];
  
  if (item.name && !item.name.match(/^\d/)) {
    parts.push(item.name);
  }
  
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
    if (!seen.has(key) || result.source === 'google' || result.source === 'cache') {
      seen.set(key, result);
    }
  }
  return Array.from(seen.values());
}

function hasWholeWord(text: string, word: string): boolean {
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  return regex.test(text);
}

function hasRelevantBusinessMatch(results: any[], query: string): boolean {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
  
  if (queryWords.length === 0) return false;
  
  const primaryWord = queryWords[0];
  
  return results.some(r => {
    const name = (r.name || '').toLowerCase();
    const displayName = (r.display_name || '').toLowerCase();
    
    const hasPrimary = hasWholeWord(name, primaryWord) || hasWholeWord(displayName, primaryWord);
    if (!hasPrimary) return false;
    
    if (queryWords.length >= 2) {
      const matchCount = queryWords.filter(w => 
        hasWholeWord(name, w) || hasWholeWord(displayName, w)
      ).length;
      const needed = Math.ceil(queryWords.length / 2);
      return matchCount >= needed;
    }
    
    return true;
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

    // Validate JWT and extract user identity
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const { searchTerm, nearType, locationName } = parseNearQuery(q);
    
    let searchCenter: Nearby | undefined = userLocation;
    let maxDistance: number | null = null;
    let actualSearchTerm = q;
    
    if (nearType === 'me' && userLocation) {
      searchCenter = userLocation;
      maxDistance = 300;
      actualSearchTerm = searchTerm;
      console.log(`"Near me" search: "${searchTerm}" within 300m`);
    } else if (nearType === 'location' && locationName) {
      const locationCoords = await geocodeLocation(locationName, userLocation);
      if (locationCoords) {
        searchCenter = locationCoords;
        maxDistance = 1000;
        actualSearchTerm = searchTerm;
        console.log(`"Near ${locationName}" search: "${searchTerm}" within 1km`);
      }
    }

    const expandedQuery = expandProvinces(actualSearchTerm);
    const isBusinessSearch = looksLikeBusinessSearch(actualSearchTerm);
    const hasLocation = hasExplicitLocation(actualSearchTerm);
    
    console.log(`Query: "${actualSearchTerm}" | Business: ${isBusinessSearch} | HasLocation: ${hasLocation}`);

    // 1. Check local cache first
    const cachedResults = await searchCache(actualSearchTerm, searchCenter);
    
    let filteredCache = cachedResults;
    if (maxDistance && searchCenter && cachedResults.length > 0) {
      filteredCache = filterByDistance(cachedResults, searchCenter, maxDistance);
    }
    
    if (filteredCache.length > 0 && hasRelevantBusinessMatch(filteredCache, actualSearchTerm)) {
      console.log(`Returning ${filteredCache.length} cached results`);
      const formattedData = filteredCache.slice(0, limit).map(r => formatAddress(r));
      return new Response(JSON.stringify(formattedData), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    }

    // 2. If business search without location, try to get city from GPS
    let enhancedQuery = expandedQuery;
    
    if (isBusinessSearch && !hasLocation && searchCenter) {
      const userCity = await getCityFromCoordinates(searchCenter.lat, searchCenter.lon);
      if (userCity && userCity.city) {
        enhancedQuery = `${expandedQuery} ${userCity.city}`;
        console.log(`Enhanced query: "${enhancedQuery}"`);
      }
    }

    // 3. PRIMARY: Google Maps API
    let googleResults: any[] = [];
    
    if (isBusinessSearch) {
      // Use Places API for business searches
      googleResults = await searchGooglePlaces(enhancedQuery, searchCenter, limit);
    } else {
      // Use Geocoding API for address searches
      googleResults = await searchGoogle(enhancedQuery, searchCenter, limit);
    }
    
    let allResults = [...filteredCache, ...googleResults];
    
    // 4. FALLBACK: If Google didn't return results, use free alternatives
    if (googleResults.length === 0) {
      console.log("Google returned no results, falling back to OSM...");
      
      const [photonResults, nominatimResults] = await Promise.all([
        searchPhoton(enhancedQuery, searchCenter, limit * 2),
        searchNominatim(enhancedQuery, countrycodes, searchCenter, limit * 2),
      ]);
      
      console.log(`OSM fallback: Photon=${photonResults.length}, Nominatim=${nominatimResults.length}`);
      allResults = [...filteredCache, ...photonResults, ...nominatimResults];
    } else {
      // Cache Google results for future searches
      cacheGoogleResults(googleResults, actualSearchTerm);
    }

    // 5. Final fallback: try extracting street address
    if (allResults.length === 0) {
      const streetAddr = extractStreetAddress(enhancedQuery);
      if (streetAddr) {
        console.log(`Trying street: ${streetAddr}`);
        const streetResults = await searchNominatim(streetAddr, countrycodes, searchCenter, limit);
        allResults = streetResults;
      }
    }

    // 6. Apply distance filter if needed
    if (maxDistance && searchCenter && allResults.length > 0) {
      allResults = filterByDistance(allResults, searchCenter, maxDistance);
    }

    // 7. Deduplicate and format
    const combined = deduplicateResults(allResults);
    
    const queryLower = actualSearchTerm.toLowerCase();
    combined.sort((a, b) => {
      if (a.distance_meters !== undefined && b.distance_meters !== undefined) {
        return a.distance_meters - b.distance_meters;
      }
      
      // Google/cache results first
      if (a.source === 'google' && b.source !== 'google') return -1;
      if (b.source === 'google' && a.source !== 'google') return 1;
      if (a.source === 'cache' && b.source !== 'cache') return -1;
      if (b.source === 'cache' && a.source !== 'cache') return 1;
      
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
