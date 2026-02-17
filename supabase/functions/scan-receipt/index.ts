import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Validation constants
const VALID_CATEGORIES = ["fuel", "repairs", "insurance", "licence", "interest", "other"] as const;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1000000;
const MAX_VENDOR_LENGTH = 200;

interface LineItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

interface ReceiptData {
  vendor_name: string | null;
  date: string | null;
  amount: number | null;
  category: typeof VALID_CATEGORIES[number];
  items: LineItem[];
}

function validateAndSanitizeReceiptData(data: unknown): ReceiptData {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid receipt data structure');
  }

  const raw = data as Record<string, unknown>;
  
  let vendor_name: string | null = null;
  if (raw.vendor_name !== null && raw.vendor_name !== undefined) {
    if (typeof raw.vendor_name !== 'string') {
      throw new Error('vendor_name must be a string');
    }
    vendor_name = raw.vendor_name.trim().slice(0, MAX_VENDOR_LENGTH).replace(/[<>'"&]/g, '');
    if (vendor_name.length === 0) vendor_name = null;
  }

  let date: string | null = null;
  if (raw.date !== null && raw.date !== undefined) {
    if (typeof raw.date !== 'string') {
      throw new Error('date must be a string');
    }
    const trimmedDate = raw.date.trim();
    if (trimmedDate && DATE_REGEX.test(trimmedDate)) {
      const parsed = new Date(trimmedDate);
      if (!isNaN(parsed.getTime())) {
        date = trimmedDate;
      }
    }
  }

  let amount: number | null = null;
  if (raw.amount !== null && raw.amount !== undefined) {
    const numAmount = Number(raw.amount);
    if (isNaN(numAmount)) throw new Error('amount must be a valid number');
    if (numAmount < 0 || numAmount > MAX_AMOUNT) throw new Error(`amount must be between 0 and ${MAX_AMOUNT}`);
    amount = Math.round(numAmount * 100) / 100;
  }

  let category: typeof VALID_CATEGORIES[number] = 'other';
  if (raw.category !== null && raw.category !== undefined) {
    if (typeof raw.category !== 'string') throw new Error('category must be a string');
    const lowerCategory = raw.category.toLowerCase().trim();
    if (VALID_CATEGORIES.includes(lowerCategory as typeof VALID_CATEGORIES[number])) {
      category = lowerCategory as typeof VALID_CATEGORIES[number];
    }
  }

  const items: LineItem[] = [];
  if (raw.items && Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        const name = typeof itemObj.name === 'string' ? itemObj.name.trim().slice(0, 200).replace(/[<>'"&]/g, '') : '';
        const quantity = typeof itemObj.quantity === 'number' && itemObj.quantity > 0 ? Math.round(itemObj.quantity * 1000) / 1000 : 1;
        const validUnits = ['ea', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'each', 'unit', 'pc', 'pcs'];
        let unit = 'ea';
        if (typeof itemObj.unit === 'string') {
          const normalizedUnit = itemObj.unit.toLowerCase().trim();
          if (validUnits.includes(normalizedUnit)) unit = normalizedUnit;
        }
        const price = typeof itemObj.price === 'number' && itemObj.price >= 0 ? Math.round(itemObj.price * 100) / 100 : 0;
        if (name) items.push({ name, quantity, unit, price });
      }
    }
  }

  return { vendor_name, date, amount, category, items };
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

    console.log("Processing receipt request");

    const systemPrompt = `You are a receipt OCR assistant. Extract the following information from receipt images and return ONLY valid JSON:
- vendor_name: The store or business name
- date: The transaction date in YYYY-MM-DD format
- amount: The total amount as a number (no currency symbol)
- category: One of: fuel, repairs, insurance, licence, interest, other
- items: Array of line items, each with name, quantity (number), unit (ea/kg/g/lb/oz/L/ml), price (number)

For weight-based items, extract the weight as quantity with proper unit. For count items use "ea".
Extract ALL individual items. If you cannot extract a field, use null.`;

    const userPrompt = `Extract the vendor name, date, total amount, and ALL individual line items from this receipt ${isPdf ? 'PDF document' : 'image'}. Return JSON only with keys: vendor_name, date, amount, category, items.`;

    const base64Match = image.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = base64Match ? base64Match[1] : (isPdf ? "application/pdf" : "image/jpeg");
    const base64Data = base64Match ? base64Match[2] : image;

    let resultData: unknown = null;

    // 1. Try Lovable AI gateway first (auto-provisioned)
    if (LOVABLE_API_KEY) {
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
                name: "extract_receipt_data",
                description: "Extract structured data from a receipt",
                parameters: {
                  type: "object",
                  properties: {
                    vendor_name: { type: "string" },
                    date: { type: "string" },
                    amount: { type: "number" },
                    category: { type: "string", enum: ["fuel", "repairs", "insurance", "licence", "interest", "other"] },
                    items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, price: { type: "number" } }, required: ["name", "quantity", "unit", "price"] } }
                  },
                  required: ["vendor_name", "date", "amount", "category", "items"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
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

    // 2. Fallback to OpenRouter
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

    // 3. Fallback to Google Gemini API directly
    if (!resultData && GEMINI_API_KEY) {
      try {
        console.log("Trying Google Gemini API directly");
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `${systemPrompt}\n\n${userPrompt}` },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    vendor_name: { type: "STRING" },
                    date: { type: "STRING" },
                    amount: { type: "NUMBER" },
                    category: { type: "STRING", enum: ["fuel", "repairs", "insurance", "licence", "interest", "other"] },
                    items: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: { name: { type: "STRING" }, quantity: { type: "NUMBER" }, unit: { type: "STRING" }, price: { type: "NUMBER" } },
                        required: ["name", "quantity", "unit", "price"]
                      }
                    }
                  },
                  required: ["vendor_name", "date", "amount", "category", "items"]
                }
              }
            }),
          }
        );

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            resultData = JSON.parse(text);
            console.log("Google Gemini succeeded");
          }
        } else {
          const errText = await geminiResponse.text();
          console.error(`Gemini API failed: ${geminiResponse.status} - ${errText}`);
        }
      } catch (e) {
        console.error("Gemini API error:", e);
      }
    }

    // 4. Fallback to Routeway.ai
    const ROUTEWAY_API_KEY = Deno.env.get("ROUTEWAY_API_KEY");
    if (!resultData && ROUTEWAY_API_KEY) {
      try {
        console.log("Trying Routeway.ai API");
        const routewayResponse = await fetch("https://api.routeway.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ROUTEWAY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
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

        if (routewayResponse.ok) {
          const data = await routewayResponse.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            resultData = JSON.parse(content);
            console.log("Routeway.ai succeeded");
          }
        } else {
          const errText = await routewayResponse.text();
          console.error(`Routeway.ai failed: ${routewayResponse.status} - ${errText}`);
        }
      } catch (e) {
        console.error("Routeway.ai error:", e);
      }
    }

    // 5. Fallback to Moonshot AI
    const MOONSHOT_API_KEY = Deno.env.get("MOONSHOT_API_KEY");
    if (!resultData && MOONSHOT_API_KEY) {
      try {
        console.log("Trying Moonshot AI API");
        const moonshotResponse = await fetch("https://api.moonshot.cn/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MOONSHOT_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "moonshot-v1-auto",
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
        if (moonshotResponse.ok) {
          const data = await moonshotResponse.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("Moonshot AI succeeded"); }
        } else {
          console.error(`Moonshot AI failed: ${moonshotResponse.status}`);
        }
      } catch (e) { console.error("Moonshot AI error:", e); }
    }

    // 6. Fallback to Groq
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!resultData && GROQ_API_KEY) {
      try {
        console.log("Trying Groq API");
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.2-90b-vision-preview",
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
        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("Groq succeeded"); }
        } else {
          console.error(`Groq failed: ${resp.status}`);
        }
      } catch (e) { console.error("Groq error:", e); }
    }

    // 7. Fallback to Cerebras
    const CEREBRAS_API_KEY = Deno.env.get("CEREBRAS_API_KEY");
    if (!resultData && CEREBRAS_API_KEY) {
      try {
        console.log("Trying Cerebras API");
        const resp = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CEREBRAS_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("Cerebras succeeded"); }
        } else {
          console.error(`Cerebras failed: ${resp.status}`);
        }
      } catch (e) { console.error("Cerebras error:", e); }
    }

    if (resultData) {
      try {
        const validatedData = validateAndSanitizeReceiptData(resultData);
        return new Response(
          JSON.stringify({ success: true, data: validatedData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (validationError) {
        console.error("Data validation failed");
        return new Response(
          JSON.stringify({ error: "Invalid receipt data format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "All AI providers are currently unavailable (credits/quota exhausted). Please top up your Lovable AI credits in Settings → Workspace → Usage, or try again later." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Receipt processing error");
    return new Response(
      JSON.stringify({ error: "Failed to process receipt" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
