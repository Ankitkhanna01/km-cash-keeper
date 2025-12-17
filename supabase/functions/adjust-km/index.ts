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
}

interface SegmentSuggestion {
  type: 'extend_start' | 'create_gap';
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
  reason: string;
}

// Parse time string (HH:MM) to minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

// Calculate trip duration in minutes
function getTripDuration(trip: Trip): number {
  const startMinutes = parseTimeToMinutes(trip.start_time);
  const endMinutes = parseTimeToMinutes(trip.end_time);
  // Handle overnight trips
  return endMinutes >= startMinutes ? endMinutes - startMinutes : (1440 - startMinutes) + endMinutes;
}

// Calculate heuristic weight for a trip (longer duration + longer distance = more likely to have inaccuracy)
function calculateTripWeight(trip: Trip, allTrips: Trip[]): number {
  const duration = getTripDuration(trip);
  const km = trip.kilometres;
  
  // Base weight on distance (60%) and duration (40%)
  const totalKm = allTrips.reduce((sum, t) => sum + t.kilometres, 0);
  const totalDuration = allTrips.reduce((sum, t) => sum + getTripDuration(t), 0);
  
  const kmWeight = totalKm > 0 ? km / totalKm : 1 / allTrips.length;
  const durationWeight = totalDuration > 0 ? duration / totalDuration : 1 / allTrips.length;
  
  return kmWeight * 0.6 + durationWeight * 0.4;
}

// Detect potential missed segments between trips
function detectMissedSegments(trips: Trip[], difference: number): SegmentSuggestion[] {
  const suggestions: SegmentSuggestion[] = [];
  
  // Sort trips by start time
  const sortedTrips = [...trips].sort((a, b) => 
    parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)
  );
  
  // Only check for gaps if we're missing KM (difference > 0)
  if (difference <= 0.5) return suggestions;
  
  for (let i = 1; i < sortedTrips.length; i++) {
    const prevTrip = sortedTrips[i - 1];
    const currTrip = sortedTrips[i];
    
    // Check if current trip's start doesn't match previous trip's end
    const prevEnd = prevTrip.end_location.toLowerCase().trim();
    const currStart = currTrip.start_location.toLowerCase().trim();
    
    // Simple location comparison (check if they're different)
    const locationsMatch = prevEnd === currStart || 
      prevEnd.includes(currStart.split(',')[0]) || 
      currStart.includes(prevEnd.split(',')[0]);
    
    if (!locationsMatch) {
      // Calculate time gap
      const prevEndTime = parseTimeToMinutes(prevTrip.end_time);
      const currStartTime = parseTimeToMinutes(currTrip.start_time);
      const timeGap = currStartTime - prevEndTime;
      
      // If there's a time gap and locations don't match, suggest extending start
      if (timeGap >= 0) {
        // Estimate that the missing segment could account for part of the difference
        const estimatedGapKm = Math.min(difference * 0.5, 5); // Cap at 5km or half the difference
        
        suggestions.push({
          type: 'extend_start',
          tripId: currTrip.id,
          fromLocation: prevTrip.end_location,
          toLocation: currTrip.start_location,
          estimatedKm: estimatedGapKm,
          reason: `Trip may have started from "${prevTrip.end_location.split(',')[0]}" instead of "${currTrip.start_location.split(',')[0]}"`
        });
      }
    }
  }
  
  return suggestions;
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

    // Detect potential missed segments
    const segmentSuggestions = detectMissedSegments(trips, difference);
    console.log(`Found ${segmentSuggestions.length} potential missed segments`);

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

    // Calculate weights for each trip using heuristic approach
    const tripWeights = trips.map(trip => ({
      trip,
      weight: calculateTripWeight(trip, trips)
    }));

    // Normalize weights to ensure they sum to 1
    const totalWeight = tripWeights.reduce((sum, tw) => sum + tw.weight, 0);
    const normalizedWeights = tripWeights.map(tw => ({
      ...tw,
      normalizedWeight: tw.weight / totalWeight
    }));

    // Distribute the difference based on weights
    let remainingDifference = difference;
    const adjustments: Adjustment[] = [];

    // Sort by weight descending to assign larger adjustments to more likely candidates
    normalizedWeights.sort((a, b) => b.normalizedWeight - a.normalizedWeight);

    for (let i = 0; i < normalizedWeights.length; i++) {
      const { trip, normalizedWeight } = normalizedWeights[i];
      const duration = getTripDuration(trip);
      
      let adjustment: number;
      if (i === normalizedWeights.length - 1) {
        // Last trip gets the remainder to ensure exact total
        adjustment = Math.round(remainingDifference * 10) / 10;
      } else {
        // Proportional adjustment based on weight
        adjustment = Math.round(normalizedWeight * difference * 10) / 10;
        remainingDifference -= adjustment;
      }

      // Skip tiny adjustments
      if (Math.abs(adjustment) < 0.1) {
        adjustment = 0;
      }

      // Generate reason based on trip characteristics
      let reason = "";
      if (adjustment > 0) {
        if (trip.kilometres > 3 && duration > 15) {
          reason = `Longer route (${trip.kilometres.toFixed(1)}km, ${duration}min) - likely took alternate roads`;
        } else if (duration > 20) {
          reason = `Extended duration (${duration}min) suggests traffic detours`;
        } else {
          reason = `Adjusted based on route distance`;
        }
      } else if (adjustment < 0) {
        if (trip.kilometres > 5) {
          reason = `Shorter actual route than GPS estimated`;
        } else {
          reason = `Minor distance correction`;
        }
      }

      if (adjustment !== 0) {
        adjustments.push({
          id: trip.id,
          adjustment,
          reason
        });
      }
    }

    // Filter out zero adjustments
    const finalAdjustments = adjustments.filter(a => a.adjustment !== 0);

    return new Response(
      JSON.stringify({ 
        adjustments: finalAdjustments,
        segmentSuggestions,
        summary: {
          currentTotal: currentTotalKm,
          actualTotal: actualTotalKm,
          difference
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
