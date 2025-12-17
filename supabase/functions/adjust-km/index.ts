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
}

interface SegmentSuggestion {
  type: 'extend_start' | 'create_gap';
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
  reason: string;
}

// Geocode address using Nominatim
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: {
          'User-Agent': 'KMCashKeeper/1.0',
        },
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

// Calculate route distance using OSRM
async function getRouteDistance(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<number | null> {
  try {
    // OSRM expects lon,lat order
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KMCashKeeper/1.0',
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      // OSRM returns distance in meters
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

    console.log(`Current total: ${currentTotalKm} km, Actual: ${actualTotalKm} km, Difference: ${difference} km`);
    console.log(`Processing ${trips.length} trips for route verification...`);

    // If difference is negligible, return no adjustments
    if (Math.abs(difference) < 0.1) {
      return new Response(
        JSON.stringify({ 
          adjustments: [],
          segmentSuggestions: [],
          summary: {
            currentTotal: currentTotalKm,
            actualTotal: actualTotalKm,
            difference: 0
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate actual route distances for each trip
    const tripAnalysis: Array<{
      trip: Trip;
      startCoords: { lat: number; lon: number } | null;
      endCoords: { lat: number; lon: number } | null;
      calculatedKm: number | null;
      discrepancy: number | null;
    }> = [];

    for (const trip of trips) {
      console.log(`Analyzing trip: ${trip.start_location} → ${trip.end_location}`);
      
      // Geocode start and end locations
      const startCoords = await geocodeAddress(trip.start_location);
      const endCoords = await geocodeAddress(trip.end_location);
      
      let calculatedKm: number | null = null;
      let discrepancy: number | null = null;
      
      if (startCoords && endCoords) {
        calculatedKm = await getRouteDistance(startCoords, endCoords);
        if (calculatedKm !== null) {
          discrepancy = trip.kilometres - calculatedKm;
          console.log(`  Logged: ${trip.kilometres.toFixed(1)} km, Calculated: ${calculatedKm.toFixed(1)} km, Discrepancy: ${discrepancy.toFixed(1)} km`);
        }
      } else {
        console.log(`  Could not geocode addresses`);
      }
      
      tripAnalysis.push({
        trip,
        startCoords,
        endCoords,
        calculatedKm,
        discrepancy,
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Build adjustments based on actual route calculations
    const adjustments: Adjustment[] = [];
    let totalCalculatedKm = 0;
    let tripsWithRoutes = 0;

    for (const analysis of tripAnalysis) {
      if (analysis.calculatedKm !== null) {
        totalCalculatedKm += analysis.calculatedKm;
        tripsWithRoutes++;
        
        const diff = analysis.calculatedKm - analysis.trip.kilometres;
        
        // Only suggest adjustment if there's a meaningful difference (> 0.3 km)
        if (Math.abs(diff) > 0.3) {
          adjustments.push({
            id: analysis.trip.id,
            adjustment: Math.round(diff * 10) / 10,
            calculatedKm: Math.round(analysis.calculatedKm * 10) / 10,
            loggedKm: analysis.trip.kilometres,
            reason: diff > 0 
              ? `Route calculation shows ${analysis.calculatedKm.toFixed(1)} km (logged ${analysis.trip.kilometres.toFixed(1)} km)`
              : `Route calculation shows ${analysis.calculatedKm.toFixed(1)} km (logged ${analysis.trip.kilometres.toFixed(1)} km)`,
          });
        }
      }
    }

    // Detect potential missed segments between trips
    const segmentSuggestions: SegmentSuggestion[] = [];
    const sortedAnalysis = [...tripAnalysis].sort((a, b) => 
      parseTimeToMinutes(a.trip.start_time) - parseTimeToMinutes(b.trip.start_time)
    );

    for (let i = 1; i < sortedAnalysis.length; i++) {
      const prev = sortedAnalysis[i - 1];
      const curr = sortedAnalysis[i];
      
      // Check if current trip's start doesn't match previous trip's end
      if (prev.endCoords && curr.startCoords) {
        const gapDistance = await getRouteDistance(prev.endCoords, curr.startCoords);
        
        if (gapDistance !== null && gapDistance > 0.5) {
          console.log(`Gap detected: ${prev.trip.end_location} → ${curr.trip.start_location} = ${gapDistance.toFixed(1)} km`);
          
          segmentSuggestions.push({
            type: 'extend_start',
            tripId: curr.trip.id,
            fromLocation: prev.trip.end_location,
            toLocation: curr.trip.start_location,
            estimatedKm: Math.round(gapDistance * 10) / 10,
            reason: `Route shows ${gapDistance.toFixed(1)} km between previous trip end and this trip start`,
          });
        }
      }
    }

    // Calculate remaining difference after route-based adjustments
    const adjustmentSum = adjustments.reduce((sum, a) => sum + a.adjustment, 0);
    const remainingDiff = difference - adjustmentSum;

    console.log(`Route adjustments sum: ${adjustmentSum.toFixed(1)} km`);
    console.log(`Remaining difference: ${remainingDiff.toFixed(1)} km`);

    // If there's still a significant remaining difference, distribute it
    if (Math.abs(remainingDiff) > 0.5 && tripsWithRoutes > 0) {
      // Find trips that couldn't be route-verified and add note
      const unverifiedTrips = tripAnalysis.filter(a => a.calculatedKm === null);
      if (unverifiedTrips.length > 0) {
        console.log(`${unverifiedTrips.length} trips could not be route-verified`);
      }
    }

    return new Response(
      JSON.stringify({ 
        adjustments,
        segmentSuggestions,
        summary: {
          currentTotal: currentTotalKm,
          actualTotal: actualTotalKm,
          difference,
          calculatedTotal: Math.round(totalCalculatedKm * 10) / 10,
          tripsVerified: tripsWithRoutes,
          tripsTotal: trips.length,
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
