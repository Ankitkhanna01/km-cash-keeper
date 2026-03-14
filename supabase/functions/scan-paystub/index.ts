import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_PLATFORMS = ["uber", "doordash", "skip", "other"] as const;
const VALID_DOCUMENT_TYPES = ["paystub", "tax_form", "bank_record", "receipt", "other"] as const;
const MAX_INCOME = 100000;
const MAX_KM = 50000;

interface PaystubData {
  platform: typeof VALID_PLATFORMS[number] | null;
  period_year: number | null;
  period_month: number | null;
  income_amount: number | null;
  kilometres: number | null;
  has_km: boolean;
  document_type: typeof VALID_DOCUMENT_TYPES[number];
  raw_text: string | null;
}

function validateAndSanitizePaystubData(data: unknown): PaystubData {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid paystub data structure');
  }

  const raw = data as Record<string, unknown>;
  
  let platform: typeof VALID_PLATFORMS[number] | null = null;
  if (raw.platform !== null && raw.platform !== undefined) {
    if (typeof raw.platform !== 'string') throw new Error('platform must be a string');
    const lowerPlatform = raw.platform.toLowerCase().trim();
    if (lowerPlatform.includes('uber')) platform = 'uber';
    else if (lowerPlatform.includes('doordash') || lowerPlatform.includes('door dash')) platform = 'doordash';
    else if (lowerPlatform.includes('skip')) platform = 'skip';
    else if (VALID_PLATFORMS.includes(lowerPlatform as typeof VALID_PLATFORMS[number])) {
      platform = lowerPlatform as typeof VALID_PLATFORMS[number];
    } else {
      platform = 'other';
    }
  }

  let period_year: number | null = null;
  if (raw.period_year !== null && raw.period_year !== undefined) {
    const numYear = Number(raw.period_year);
    if (!isNaN(numYear) && numYear >= 2020 && numYear <= 2030) period_year = numYear;
  }

  let period_month: number | null = null;
  if (raw.period_month !== null && raw.period_month !== undefined) {
    const numMonth = Number(raw.period_month);
    if (!isNaN(numMonth) && numMonth >= 1 && numMonth <= 12) period_month = numMonth;
  }

  let income_amount: number | null = null;
  if (raw.income_amount !== null && raw.income_amount !== undefined) {
    const numAmount = Number(raw.income_amount);
    if (!isNaN(numAmount) && numAmount >= 0 && numAmount <= MAX_INCOME) {
      income_amount = Math.round(numAmount * 100) / 100;
    }
  }

  let kilometres: number | null = null;
  let has_km = false;
  if (raw.kilometres !== null && raw.kilometres !== undefined) {
    const numKm = Number(raw.kilometres);
    if (!isNaN(numKm) && numKm >= 0 && numKm <= MAX_KM) {
      kilometres = Math.round(numKm * 10) / 10;
      has_km = true;
    }
  }

  let document_type: typeof VALID_DOCUMENT_TYPES[number] = 'paystub';
  if (raw.document_type !== null && raw.document_type !== undefined) {
    if (typeof raw.document_type === 'string') {
      const lowerType = raw.document_type.toLowerCase().trim();
      if (VALID_DOCUMENT_TYPES.includes(lowerType as typeof VALID_DOCUMENT_TYPES[number])) {
        document_type = lowerType as typeof VALID_DOCUMENT_TYPES[number];
      }
    }
  }

  const raw_text = typeof raw.raw_text === 'string' ? raw.raw_text.slice(0, 500) : null;

  return { platform, period_year, period_month, income_amount, kilometres, has_km, document_type, raw_text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    const { image, isPdf } = await req.json();
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!OPENROUTER_API_KEY && !GEMINI_API_KEY && !LOVABLE_API_KEY) {
      console.error("Server configuration error: Missing API keys");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing paystub request");

    const systemPrompt = `You are a paystub/income document OCR assistant for gig economy workers. Extract:
- platform: The gig platform (Uber, DoorDash, Skip The Dishes, or other)
- period_year: Year of pay period (YYYY)
- period_month: Month of pay period (1-12)
- income_amount: Total earnings as a number
- kilometres: Total km driven if shown (convert miles to km * 1.60934), null if not shown
- document_type: One of: paystub, tax_form, bank_record, receipt, other

Look for "Total Earnings", "Net Pay", "Gross Pay" for income. "Distance", "Kilometres", "Miles" for distance.
Return ONLY valid JSON.`;

    const userPrompt = `Extract income and kilometer data from this gig economy ${isPdf ? 'PDF document' : 'image'}. Return JSON with platform, period_year, period_month, income_amount, kilometres, document_type.`;

    const base64Match = image.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = base64Match ? base64Match[1] : (isPdf ? "application/pdf" : "image/jpeg");
    const base64Data = base64Match ? base64Match[2] : image;

    let resultData: unknown = null;

    // 1. Try Lovable AI gateway first (auto-provisioned)
    if (!resultData && LOVABLE_API_KEY) {
      try {
        console.log("Trying Lovable AI gateway");
        const lovableResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: image } }
              ]}
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_paystub_data",
                description: "Extract structured data from a paystub",
                parameters: {
                  type: "object",
                  properties: {
                    platform: { type: "string", enum: ["uber", "doordash", "skip", "other"] },
                    period_year: { type: "integer" },
                    period_month: { type: "integer" },
                    income_amount: { type: "number" },
                    kilometres: { type: "number" },
                    document_type: { type: "string", enum: ["paystub", "tax_form", "bank_record", "receipt", "other"] }
                  },
                  required: ["platform", "period_year", "period_month", "income_amount", "document_type"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "extract_paystub_data" } }
          }),
        });

        if (lovableResponse.ok) {
          const data = await lovableResponse.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            resultData = JSON.parse(toolCall.function.arguments);
            console.log("Lovable AI succeeded");
          } else {
            const content = data.choices?.[0]?.message?.content;
            if (content) resultData = JSON.parse(content);
          }
        } else {
          console.error(`Lovable AI failed: ${lovableResponse.status}`);
          await lovableResponse.text();
        }
      } catch (e) {
        console.error("Lovable AI error:", e);
      }
    }

    // 2. Fallback to Anthropic Claude
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!resultData && ANTHROPIC_API_KEY) {
      try {
        console.log("Trying Anthropic Claude");
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } },
              { type: "text", text: userPrompt }
            ]}],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const text = data.content?.[0]?.text;
          if (text) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) { resultData = JSON.parse(jsonMatch[0]); console.log("Anthropic Claude succeeded"); }
          }
        } else {
          console.error(`Anthropic Claude failed: ${resp.status}`);
          await resp.text();
        }
      } catch (e) { console.error("Anthropic Claude error:", e); }
    }

    // 3. Fallback to OpenRouter
    if (!resultData && OPENROUTER_API_KEY) {
      try {
        console.log("Trying OpenRouter API");
        const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
              ]}
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (orResponse.ok) {
          const data = await orResponse.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            resultData = JSON.parse(content);
            console.log("OpenRouter succeeded");
          }
        } else {
          const errText = await orResponse.text();
          console.error(`OpenRouter failed: ${orResponse.status} - ${errText}`);
        }
      } catch (e) {
        console.error("OpenRouter error:", e);
      }
    }

    // 3. Smart Gemini multi-model rotation (spread load across free tier limits)
    // Paystub = simpler extraction → Flash models fine, save Pro for complex tasks
    if (!resultData && GEMINI_API_KEY) {
      const geminiModels = [
        { id: "gemini-2.0-flash", rpd: 1500, note: "high capacity" },
        { id: "gemini-2.0-flash-exp", rpd: 1500, note: "high capacity exp" },
        { id: "gemini-2.5-pro", rpd: 1500, note: "pro quality" },
        { id: "gemini-3-pro", rpd: 1500, note: "next-gen" },
        { id: "gemini-2.5-flash-lite", rpd: 20, note: "low quota lite" },
        { id: "gemini-2.5-flash", rpd: 20, note: "low quota" },
        { id: "gemini-3-flash", rpd: 20, note: "low quota next-gen" },
      ];
      const paystubSchema = {
        type: "OBJECT",
        properties: {
          platform: { type: "STRING" },
          period_year: { type: "INTEGER" },
          period_month: { type: "INTEGER" },
          income_amount: { type: "NUMBER" },
          kilometres: { type: "NUMBER" },
          document_type: { type: "STRING", enum: ["paystub", "tax_form", "bank_record", "receipt", "other"] }
        },
        required: ["platform", "period_year", "period_month", "income_amount", "document_type"]
      };

      for (const model of geminiModels) {
        if (resultData) break;
        try {
          console.log(`Trying Gemini ${model.id} (${model.note}, ${model.rpd} RPD)`);
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [
                  { text: `${systemPrompt}\n\n${userPrompt}` },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]}],
                generationConfig: { responseMimeType: "application/json", responseSchema: paystubSchema }
              }),
            }
          );
          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json();
            const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) { resultData = JSON.parse(text); console.log(`Gemini ${model.id} succeeded`); }
          } else if (geminiResponse.status === 429) {
            console.warn(`Gemini ${model.id} rate limited (429), trying next model`);
            await geminiResponse.text();
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.error(`Gemini ${model.id} failed: ${geminiResponse.status}`);
            await geminiResponse.text();
          }
        } catch (e) { console.error(`Gemini ${model.id} error:`, e); }
      }
    }

    if (resultData) {
      try {
        const validatedData = validateAndSanitizePaystubData(resultData);
        return new Response(
          JSON.stringify({ success: true, data: validatedData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (validationError) {
        console.error("Data validation failed:", validationError);
        return new Response(
          JSON.stringify({ error: "Invalid paystub data format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Paystub scanning service temporarily unavailable. Please try again later." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Paystub processing error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process paystub" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
