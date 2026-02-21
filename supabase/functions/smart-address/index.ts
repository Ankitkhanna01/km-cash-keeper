import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, city } = await req.json();
    
    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: "Query too short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    console.log("Processing address query:", query, "city hint:", city);

    // Use AI to interpret and expand the address
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a Canadian address parser for delivery drivers. Given a partial or abbreviated address input, expand it into a proper searchable address format.

Rules:
- Expand common abbreviations (St = Street, Ave = Avenue, Blvd = Boulevard, Dr = Drive, Rd = Road, Cres = Crescent, Ct = Court, etc.)
- Add "Canada" at the end if not present
- If a city hint is provided, include it in the address
- If the input looks like a business name (e.g., "mcdonalds", "tim hortons"), format it as "[Business Name], [City if known], Canada"
- If numbers are missing context, assume they're street numbers
- Keep it concise - just return the cleaned/expanded address, nothing else
- If input is already a good address, return it with minimal changes

Examples:
"123 main st" → "123 Main Street"
"456 queen ave toronto" → "456 Queen Avenue, Toronto, Canada"
"tims on dundas" → "Tim Hortons, Dundas Street, Canada"
"55 university waterloo" → "55 University Avenue, Waterloo, Canada"`
          },
          {
            role: "user",
            content: city ? `Address: "${query}" (near ${city})` : `Address: "${query}"`
          }
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      // Fall back to returning the original query
      return new Response(
        JSON.stringify({ expanded: query, original: query }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const expanded = data.choices?.[0]?.message?.content?.trim() || query;

    console.log("Expanded address:", expanded);

    return new Response(
      JSON.stringify({ expanded, original: query }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Smart address error:", error);
    const message = error instanceof Error ? error.message : "Failed to process address";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
