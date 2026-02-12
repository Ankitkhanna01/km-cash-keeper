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

// Validation constants
const VALID_CATEGORIES = ["fuel", "repairs", "insurance", "licence", "interest", "other"] as const;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1000000; // Reasonable upper bound for expense amount
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
  
  // Validate and sanitize vendor_name
  let vendor_name: string | null = null;
  if (raw.vendor_name !== null && raw.vendor_name !== undefined) {
    if (typeof raw.vendor_name !== 'string') {
      throw new Error('vendor_name must be a string');
    }
    // Sanitize: trim, limit length, remove potential injection characters
    vendor_name = raw.vendor_name
      .trim()
      .slice(0, MAX_VENDOR_LENGTH)
      .replace(/[<>'"&]/g, ''); // Remove potential XSS/injection chars
    if (vendor_name.length === 0) vendor_name = null;
  }

  // Validate date format
  let date: string | null = null;
  if (raw.date !== null && raw.date !== undefined) {
    if (typeof raw.date !== 'string') {
      throw new Error('date must be a string');
    }
    const trimmedDate = raw.date.trim();
    if (trimmedDate && DATE_REGEX.test(trimmedDate)) {
      // Additional validation: check if it's a valid date
      const parsed = new Date(trimmedDate);
      if (!isNaN(parsed.getTime())) {
        date = trimmedDate;
      }
    }
  }

  // Validate amount
  let amount: number | null = null;
  if (raw.amount !== null && raw.amount !== undefined) {
    const numAmount = Number(raw.amount);
    if (isNaN(numAmount)) {
      throw new Error('amount must be a valid number');
    }
    if (numAmount < 0 || numAmount > MAX_AMOUNT) {
      throw new Error(`amount must be between 0 and ${MAX_AMOUNT}`);
    }
    // Round to 2 decimal places
    amount = Math.round(numAmount * 100) / 100;
  }

  // Validate category
  let category: typeof VALID_CATEGORIES[number] = 'other';
  if (raw.category !== null && raw.category !== undefined) {
    if (typeof raw.category !== 'string') {
      throw new Error('category must be a string');
    }
    const lowerCategory = raw.category.toLowerCase().trim();
    if (VALID_CATEGORIES.includes(lowerCategory as typeof VALID_CATEGORIES[number])) {
      category = lowerCategory as typeof VALID_CATEGORIES[number];
    }
  }

  // Validate and sanitize items array
  const items: LineItem[] = [];
  if (raw.items && Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        const name = typeof itemObj.name === 'string' 
          ? itemObj.name.trim().slice(0, 200).replace(/[<>'"&]/g, '') 
          : '';
        const quantity = typeof itemObj.quantity === 'number' && itemObj.quantity > 0 
          ? Math.round(itemObj.quantity * 1000) / 1000 // 3 decimal places for weights
          : 1;
        // Normalize unit to lowercase and validate
        const validUnits = ['ea', 'kg', 'g', 'lb', 'oz', 'l', 'ml', 'each', 'unit', 'pc', 'pcs'];
        let unit = 'ea';
        if (typeof itemObj.unit === 'string') {
          const normalizedUnit = itemObj.unit.toLowerCase().trim();
          if (validUnits.includes(normalizedUnit)) {
            unit = normalizedUnit;
          }
        }
        const price = typeof itemObj.price === 'number' && itemObj.price >= 0 
          ? Math.round(itemObj.price * 100) / 100 
          : 0;
        
        if (name) {
          items.push({ name, quantity, unit, price });
        }
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
    // Authentication check - require valid JWT
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

    console.log(`Processing receipt request`);

    let response: Response | null = null;
    let lastError = "";

    for (const model of AI_MODELS) {
      console.log(`Trying model: ${model}`);
      
      const requestBody = JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a receipt OCR assistant. Extract the following information from receipt images:
- vendor_name: The store or business name
- date: The transaction date in YYYY-MM-DD format
- amount: The total amount as a number (no currency symbol)
- category: Suggest one of these categories based on the vendor type: fuel, repairs, insurance, licence, interest, other
- items: Array of line items from the receipt, each with name (item description), quantity (number of units or weight), unit (e.g., "ea", "kg", "g", "lb", "L"), and price (total price for this line)

IMPORTANT: For weight-based items (sold by kg, gram, lb, etc.):
- Extract the WEIGHT as the quantity (e.g., 1.5 for 1.5kg, 500 for 500g)
- Include the unit type (kg, g, lb, L, ml, etc.)
- For items without weight units, use quantity as count and unit as "ea" (each)

Extract ALL individual items/products listed on the receipt with their quantities and prices.
If you cannot extract a field, use null. Return ONLY valid JSON, no other text.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the vendor name, date, total amount, and ALL individual line items (with name, quantity, price) from this receipt ${isPdf ? 'PDF document' : 'image'}. Return JSON only.`
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
              name: "extract_receipt_data",
              description: "Extract structured data from a receipt including all line items",
              parameters: {
                type: "object",
                properties: {
                  vendor_name: { type: "string", description: "The store or business name" },
                  date: { type: "string", description: "Transaction date in YYYY-MM-DD format" },
                  amount: { type: "number", description: "Total amount as a number" },
                  category: { 
                    type: "string", 
                    enum: ["fuel", "repairs", "insurance", "licence", "interest", "other"],
                    description: "Expense category based on vendor type"
                  },
                  items: {
                    type: "array",
                    description: "List of individual items/products on the receipt",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Item/product name or description" },
                        quantity: { type: "number", description: "Quantity or weight purchased" },
                        unit: { type: "string", enum: ["ea", "kg", "g", "lb", "oz", "L", "ml"], description: "Unit of measurement" },
                        price: { type: "number", description: "Total price for this line item" }
                      },
                      required: ["name", "quantity", "unit", "price"]
                    }
                  }
                },
                required: ["vendor_name", "date", "amount", "category", "items"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
      });

      const attempt = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (attempt.ok) {
        response = attempt;
        console.log(`Model ${model} succeeded`);
        break;
      }

      lastError = `${model}: ${attempt.status}`;
      console.error(`Model ${model} failed: ${attempt.status}`);
      // Consume body to avoid leak
      await attempt.text();
    }

    if (!response) {
      console.error(`All models failed. Last: ${lastError}`);
      return new Response(
        JSON.stringify({ error: "Receipt scanning service temporarily unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Receipt processing completed");

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const rawData = JSON.parse(toolCall.function.arguments);
        const validatedData = validateAndSanitizeReceiptData(rawData);
        
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

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        const validatedData = validateAndSanitizeReceiptData(parsed);
        return new Response(
          JSON.stringify({ success: true, data: validatedData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        console.error("Response parsing failed");
      }
    }

    return new Response(
      JSON.stringify({ error: "Could not extract receipt data" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Receipt processing error");
    return new Response(
      JSON.stringify({ error: "Failed to process receipt" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
