import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5-nano",
];

const VALID_PLATFORMS = ["uber", "doordash", "skip", "other"] as const;
const VALID_DOCUMENT_TYPES = ["paystub", "tax_form", "bank_record", "receipt", "other"] as const;
const MAX_INCOME = 100000; // Max income per paystub
const MAX_KM = 50000; // Max KM per paystub period

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
  
  // Validate platform
  let platform: typeof VALID_PLATFORMS[number] | null = null;
  if (raw.platform !== null && raw.platform !== undefined) {
    if (typeof raw.platform !== 'string') {
      throw new Error('platform must be a string');
    }
    const lowerPlatform = raw.platform.toLowerCase().trim();
    // Map common variations
    if (lowerPlatform.includes('uber')) platform = 'uber';
    else if (lowerPlatform.includes('doordash') || lowerPlatform.includes('door dash')) platform = 'doordash';
    else if (lowerPlatform.includes('skip')) platform = 'skip';
    else if (VALID_PLATFORMS.includes(lowerPlatform as typeof VALID_PLATFORMS[number])) {
      platform = lowerPlatform as typeof VALID_PLATFORMS[number];
    } else {
      platform = 'other';
    }
  }

  // Validate period_year
  let period_year: number | null = null;
  if (raw.period_year !== null && raw.period_year !== undefined) {
    const numYear = Number(raw.period_year);
    if (!isNaN(numYear) && numYear >= 2020 && numYear <= 2030) {
      period_year = numYear;
    }
  }

  // Validate period_month
  let period_month: number | null = null;
  if (raw.period_month !== null && raw.period_month !== undefined) {
    const numMonth = Number(raw.period_month);
    if (!isNaN(numMonth) && numMonth >= 1 && numMonth <= 12) {
      period_month = numMonth;
    }
  }

  // Validate income_amount
  let income_amount: number | null = null;
  if (raw.income_amount !== null && raw.income_amount !== undefined) {
    const numAmount = Number(raw.income_amount);
    if (!isNaN(numAmount) && numAmount >= 0 && numAmount <= MAX_INCOME) {
      income_amount = Math.round(numAmount * 100) / 100;
    }
  }

  // Validate kilometres
  let kilometres: number | null = null;
  let has_km = false;
  if (raw.kilometres !== null && raw.kilometres !== undefined) {
    const numKm = Number(raw.kilometres);
    if (!isNaN(numKm) && numKm >= 0 && numKm <= MAX_KM) {
      kilometres = Math.round(numKm * 10) / 10;
      has_km = true;
    }
  }

  // Determine document type
  let document_type: typeof VALID_DOCUMENT_TYPES[number] = 'paystub';
  if (raw.document_type !== null && raw.document_type !== undefined) {
    if (typeof raw.document_type === 'string') {
      const lowerType = raw.document_type.toLowerCase().trim();
      if (VALID_DOCUMENT_TYPES.includes(lowerType as typeof VALID_DOCUMENT_TYPES[number])) {
        document_type = lowerType as typeof VALID_DOCUMENT_TYPES[number];
      }
    }
  }

  // Extract raw text for debugging
  const raw_text = typeof raw.raw_text === 'string' ? raw.raw_text.slice(0, 500) : null;

  return {
    platform,
    period_year,
    period_month,
    income_amount,
    kilometres,
    has_km,
    document_type,
    raw_text,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image, isPdf } = await req.json();
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("Server configuration error: Missing API key");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing paystub request`);

    let response: Response | null = null;
    let lastError = "";

    for (const model of AI_MODELS) {
      console.log(`Trying model: ${model}`);

      const attempt = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are a paystub/income document OCR assistant for gig economy workers. Extract the following information:

- platform: The gig platform (Uber, DoorDash, Skip The Dishes, or other)
- period_year: The year of the pay period (YYYY format)
- period_month: The month of the pay period (1-12)
- income_amount: Total earnings/income as a number (no currency symbol)
- kilometres: Total kilometers/miles driven if shown (convert miles to km if needed, multiply by 1.60934)
- document_type: One of: paystub, tax_form, bank_record, receipt, other

Look for:
- "Total Earnings", "Net Pay", "Gross Pay" for income
- "Distance", "Kilometres", "Miles", "KM" for distance traveled
- Pay period dates to determine month and year
- Platform branding/logos to identify the source

If kilometres are not shown, set kilometres to null.
Return ONLY valid JSON, no other text.`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extract income and kilometer data from this gig economy ${isPdf ? 'PDF document' : 'image'}. Return JSON only with platform, period_year, period_month, income_amount, kilometres, and document_type.`
                },
                {
                  type: "image_url",
                  image_url: { url: image }
                }
              ]
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_paystub_data",
                description: "Extract structured data from a paystub or income document",
                parameters: {
                  type: "object",
                  properties: {
                    platform: { 
                      type: "string", 
                      enum: ["uber", "doordash", "skip", "other"],
                      description: "The gig platform" 
                    },
                    period_year: { type: "integer", description: "Year of pay period (YYYY)" },
                    period_month: { type: "integer", description: "Month of pay period (1-12)" },
                    income_amount: { type: "number", description: "Total earnings as a number" },
                    kilometres: { type: "number", description: "Total km driven if shown, null if not available" },
                    document_type: { 
                      type: "string", 
                      enum: ["paystub", "tax_form", "bank_record", "receipt", "other"],
                      description: "Type of document"
                    }
                  },
                  required: ["platform", "period_year", "period_month", "income_amount", "document_type"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "extract_paystub_data" } }
        }),
      });

      if (attempt.ok) {
        response = attempt;
        console.log(`Model ${model} succeeded`);
        break;
      }

      lastError = `${model}: ${attempt.status}`;
      console.error(`Model ${model} failed: ${attempt.status}`);
      await attempt.text();
    }

    if (!response) {
      console.error(`All models failed. Last: ${lastError}`);
      return new Response(
        JSON.stringify({ error: "Paystub scanning service temporarily unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Paystub processing completed");

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const rawData = JSON.parse(toolCall.function.arguments);
        const validatedData = validateAndSanitizePaystubData(rawData);
        
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

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        const validatedData = validateAndSanitizePaystubData(parsed);
        return new Response(
          JSON.stringify({ success: true, data: validatedData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        console.error("Response parsing failed");
      }
    }

    return new Response(
      JSON.stringify({ error: "Could not extract paystub data" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Paystub processing error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process paystub" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
