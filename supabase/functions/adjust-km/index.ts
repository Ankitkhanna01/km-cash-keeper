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

    // Build trip list with numbered mapping for clarity
    const tripList = trips.map((t, i) => ({
      index: i + 1,
      uuid: t.id,
      route: `${t.start_location} → ${t.end_location}`,
      km: t.kilometres,
      time: `${t.start_time}-${t.end_time}`
    }));

    const tripSummary = tripList.map(t => 
      `#${t.index} [UUID: ${t.uuid}] ${t.route} | ${t.km.toFixed(1)} km | ${t.time}`
    ).join('\n');

    // Create explicit ID mapping for AI
    const idMapping = tripList.map(t => `Trip #${t.index} = "${t.uuid}"`).join(', ');

    const systemPrompt = `You are a trip distance analyzer. Your ONLY job is to output a JSON array redistributing kilometres.

CRITICAL RULES:
1. Each trip has a UUID like "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
2. You MUST copy-paste the EXACT UUID from the input into your output
3. NEVER write "Trip 1", "Trip 2", etc - always use the actual UUID string
4. Return ONLY valid JSON, no other text`;

    const userPrompt = `Redistribute ${difference.toFixed(1)} km across these trips:

${tripSummary}

ID Reference: ${idMapping}

Return JSON array ONLY. Example format with REAL UUIDs from above:
[{"id": "${trips[0]?.id || 'uuid-here'}", "adjustment": ${(difference / trips.length).toFixed(1)}, "reason": "example"}]

Each "id" MUST be one of the exact UUIDs listed above. Sum of adjustments = ${difference.toFixed(1)}`;

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
