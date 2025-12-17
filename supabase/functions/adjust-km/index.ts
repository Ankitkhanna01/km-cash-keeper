import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Trip {
  id: string;
  start_location: string;
  end_location: string;
  kilometres: number;
  start_time: string;
  end_time: string;
}

interface Adjustment {
  id: string;
  adjustment: number;
  reason: string;
  calculatedKm?: number;
  loggedKm?: number;
  type: 'route' | 'distribution';
}

interface SegmentSuggestion {
  type: 'extend_start' | 'create_gap';
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
  reason: string;
}

// Cache for geocoded addresses
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

// Geocode address using Nominatim with caching
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address) || null;
  }

  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      { headers: { 'User-Agent': 'KMCashKeeper/1.0' } }
    );
    
    if (!response.ok) {
      geocodeCache.set(address, null);
      return null;
    }
    
    const data = await response.json();
    if (data && data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geocodeCache.set(address, result);
      return result;
    }
    geocodeCache.set(address, null);
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    geocodeCache.set(address, null);
    return null;
  }
}

// Calculate route distance using OSRM
async function getRouteDistance(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
    
    const response = await fetch(url, { headers: { 'User-Agent': 'KMCashKeeper/1.0' } });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      return data.routes[0].distance / 1000;
    }
    return null;
  } catch (error) {
    console.error('OSRM routing error:', error);
    return null;
  }
}

// Parse time string (HH:MM) to minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

// Process a single trip
async function processTrip(trip: Trip): Promise<{
  trip: Trip;
  startCoords: { lat: number; lon: number } | null;
  endCoords: { lat: number; lon: number } | null;
  calculatedKm: number | null;
  discrepancy: number | null;
}> {
  const startCoords = await geocodeAddress(trip.start_location);
  const endCoords = await geocodeAddress(trip.end_location);
  
  let calculatedKm: number | null = null;
  let discrepancy: number | null = null;
  
  if (startCoords && endCoords) {
    calculatedKm = await getRouteDistance(startCoords, endCoords);
    if (calculatedKm !== null) {
      discrepancy = trip.kilometres - calculatedKm;
    }
  }
  
  return { trip, startCoords, endCoords, calculatedKm, discrepancy };
}

// Process trips in batches with concurrency limit
async function processTripsBatched(trips: Trip[], batchSize: number = 5) {
  const results: Awaited<ReturnType<typeof processTrip>>[] = [];
  
  for (let i = 0; i < trips.length; i += batchSize) {
    const batch = trips.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processTrip));
    results.push(...batchResults);
    
    if (i + batchSize < trips.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trips, actualTotalKm } = await req.json() as { 
      trips: Trip[]; 
      actualTotalKm: number;
    };

    if (!trips || trips.length === 0) {
      return new Response(
        JSON.stringify({ error: "No trips provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentTotalKm = trips.reduce((sum, t) => sum + t.kilometres, 0);
    const difference = actualTotalKm - currentTotalKm;

    console.log(`Processing ${trips.length} trips. Current: ${currentTotalKm.toFixed(1)} km, Target: ${actualTotalKm} km, Diff: ${difference.toFixed(1)} km`);

    // If difference is negligible, return no adjustments
    if (Math.abs(difference) < 0.1) {
      return new Response(
        JSON.stringify({ 
          adjustments: [],
          distributionAdjustments: [],
          segmentSuggestions: [],
          summary: { currentTotal: currentTotalKm, actualTotal: actualTotalKm, difference: 0 }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process all trips in parallel batches
    const tripAnalysis = await processTripsBatched(trips, 5);

    // Build route-based adjustments
    const routeAdjustments: Adjustment[] = [];
    let totalCalculatedKm = 0;
    let tripsWithRoutes = 0;
    let routeAdjustmentSum = 0;

    for (const analysis of tripAnalysis) {
      if (analysis.calculatedKm !== null) {
        totalCalculatedKm += analysis.calculatedKm;
        tripsWithRoutes++;
        
        const diff = analysis.calculatedKm - analysis.trip.kilometres;
        
        // Only suggest adjustment if there's a meaningful difference (> 0.3 km)
        if (Math.abs(diff) > 0.3) {
          routeAdjustmentSum += diff;
          routeAdjustments.push({
            id: analysis.trip.id,
            adjustment: Math.round(diff * 10) / 10,
            calculatedKm: Math.round(analysis.calculatedKm * 10) / 10,
            loggedKm: analysis.trip.kilometres,
            reason: `Route: ${analysis.calculatedKm.toFixed(1)} km (logged ${analysis.trip.kilometres.toFixed(1)} km)`,
            type: 'route',
          });
        }
      }
    }

    // Detect potential missed segments between trips
    const segmentSuggestions: SegmentSuggestion[] = [];
    const sortedAnalysis = [...tripAnalysis].sort((a, b) => 
      parseTimeToMinutes(a.trip.start_time) - parseTimeToMinutes(b.trip.start_time)
    );

    let gapKmTotal = 0;
    const gapPromises = sortedAnalysis.slice(1).map(async (curr, idx) => {
      const prev = sortedAnalysis[idx];
      
      if (prev.endCoords && curr.startCoords) {
        const gapDistance = await getRouteDistance(prev.endCoords, curr.startCoords);
        
        if (gapDistance !== null && gapDistance > 0.5) {
          const suggestion: SegmentSuggestion = {
            type: 'extend_start',
            tripId: curr.trip.id,
            fromLocation: prev.trip.end_location,
            toLocation: curr.trip.start_location,
            estimatedKm: Math.round(gapDistance * 10) / 10,
            reason: `${gapDistance.toFixed(1)} km gap from previous trip`,
          };
          return suggestion;
        }
      }
      return null;
    });

    const gapResults = await Promise.all(gapPromises);
    for (const result of gapResults) {
      if (result !== null) {
        segmentSuggestions.push(result);
        gapKmTotal += result.estimatedKm;
      }
    }

    // Calculate remaining difference after route adjustments and gaps
    const remainingDiff = difference - routeAdjustmentSum - gapKmTotal;
    console.log(`Route adjustments: ${routeAdjustmentSum.toFixed(1)} km, Gaps: ${gapKmTotal.toFixed(1)} km, Remaining: ${remainingDiff.toFixed(1)} km`);

    // Create distribution adjustments for remaining difference
    // This handles KM driven on different routes than the system calculated
    const distributionAdjustments: Adjustment[] = [];
    
    if (Math.abs(remainingDiff) >= 0.2) {
      // Distribute proportionally based on trip distance (longer trips get more adjustment)
      const totalKmForDistribution = trips.reduce((sum, t) => sum + t.kilometres, 0);
      
      // Sort trips by duration (end_time - start_time) to prefer longer duration trips
      const tripsWithDuration = trips.map(t => {
        const startMins = parseTimeToMinutes(t.start_time);
        const endMins = parseTimeToMinutes(t.end_time);
        const duration = endMins - startMins;
        return { trip: t, duration };
      }).sort((a, b) => b.duration - a.duration);

      let remainingToDistribute = remainingDiff;
      
      for (const { trip, duration } of tripsWithDuration) {
        if (Math.abs(remainingToDistribute) < 0.1) break;
        
        // Weight by both distance and duration
        const distanceWeight = trip.kilometres / totalKmForDistribution;
        const durationWeight = duration / tripsWithDuration.reduce((sum, t) => sum + t.duration, 0);
        const combinedWeight = (distanceWeight + durationWeight) / 2;
        
        // Calculate adjustment for this trip
        let adjustment = remainingDiff * combinedWeight;
        
        // Round to 0.1 km
        adjustment = Math.round(adjustment * 10) / 10;
        
        // Skip tiny adjustments
        if (Math.abs(adjustment) < 0.2) continue;
        
        // Don't let adjustment make trip negative
        if (trip.kilometres + adjustment < 0.1) {
          adjustment = 0.1 - trip.kilometres;
        }
        
        remainingToDistribute -= adjustment;
        
        distributionAdjustments.push({
          id: trip.id,
          adjustment,
          loggedKm: trip.kilometres,
          calculatedKm: trip.kilometres + adjustment,
          reason: remainingDiff > 0 
            ? `Distribute +${adjustment.toFixed(1)} km (alternate routes)`
            : `Reduce by ${Math.abs(adjustment).toFixed(1)} km`,
          type: 'distribution',
        });
      }
    }

    console.log(`Completed: ${tripsWithRoutes}/${trips.length} verified, ${routeAdjustments.length} route adjustments, ${distributionAdjustments.length} distribution adjustments, ${segmentSuggestions.length} gaps`);

    return new Response(
      JSON.stringify({ 
        adjustments: routeAdjustments,
        distributionAdjustments,
        segmentSuggestions,
        summary: {
          currentTotal: currentTotalKm,
          actualTotal: actualTotalKm,
          difference,
          calculatedTotal: Math.round(totalCalculatedKm * 10) / 10,
          tripsVerified: tripsWithRoutes,
          tripsTotal: trips.length,
          routeAdjustmentSum: Math.round(routeAdjustmentSum * 10) / 10,
          gapKmTotal: Math.round(gapKmTotal * 10) / 10,
          remainingDiff: Math.round(remainingDiff * 10) / 10,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("adjust-km error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
