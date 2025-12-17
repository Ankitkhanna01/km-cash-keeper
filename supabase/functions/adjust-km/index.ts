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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const currentTotalKm = trips.reduce((sum, t) => sum + t.kilometres, 0);
    const difference = actualTotalKm - currentTotalKm;

    console.log(`Current total: ${currentTotalKm} km, Actual: ${actualTotalKm} km, Difference: ${difference} km`);

    // Build trip summary for AI with actual IDs
    const tripSummary = trips.map((t) => 
      `ID: ${t.id} | ${t.start_location} → ${t.end_location} | ${t.kilometres.toFixed(1)} km | ${t.start_time}-${t.end_time}`
    ).join('\n');

    const systemPrompt = `You are an intelligent trip distance analyzer for a delivery driver's tax tracking app. 
Your task is to redistribute a kilometre difference across trips based on which routes likely had inaccurate GPS measurements.

Consider these factors when redistributing:
- Longer trips are more likely to have GPS inaccuracies
- Trips with multiple stops or complex routes may need more adjustment
- Highway vs city driving (infer from location names)
- Time duration vs distance ratio (longer time with short distance suggests traffic/complex route)

CRITICAL: You MUST use the exact trip ID provided (the UUID after "ID:") in your response. Do NOT use "Trip 1", "Trip 2", etc.

Return ONLY a valid JSON array with trip adjustments. No explanation text.`;

    const userPrompt = `The driver's car odometer shows ${actualTotalKm.toFixed(1)} km for today, but the app logged ${currentTotalKm.toFixed(1)} km.
That's a difference of ${difference.toFixed(1)} km that needs to be distributed across these trips:

${tripSummary}

Redistribute the ${Math.abs(difference).toFixed(1)} km ${difference > 0 ? 'addition' : 'reduction'} intelligently.

IMPORTANT: Use the exact UUID from each trip's "ID:" field. Return a JSON array like this:
[{"id": "actual-uuid-from-trip", "adjustment": 2.5, "reason": "brief reason"}]

The sum of all adjustments must equal ${difference.toFixed(1)}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";
    
    console.log("AI response:", content);

    // Parse JSON from response
    let adjustments;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        adjustments = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback: distribute evenly
      const perTrip = difference / trips.length;
      adjustments = trips.map(t => ({
        id: t.id,
        adjustment: perTrip,
        reason: "Distributed evenly (AI parsing failed)"
      }));
    }

    return new Response(
      JSON.stringify({ 
        adjustments,
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
