import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation constants
const VALID_CATEGORIES = ["fuel", "repairs", "insurance", "licence", "interest", "other"] as const;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1000000; // Reasonable upper bound for expense amount
const MAX_VENDOR_LENGTH = 200;

interface ReceiptData {
  vendor_name: string | null;
  date: string | null;
  amount: number | null;
  category: typeof VALID_CATEGORIES[number];
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

  return { vendor_name, date, amount, category };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image, isPdf } = await req.json();
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Processing receipt ${isPdf ? 'PDF' : 'image'}...`);

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
            content: `You are a receipt OCR assistant. Extract the following information from receipt images:
- vendor_name: The store or business name
- date: The transaction date in YYYY-MM-DD format
- amount: The total amount as a number (no currency symbol)
- category: Suggest one of these categories based on the vendor type: fuel, repairs, insurance, licence, interest, other

If you cannot extract a field, use null. Return ONLY valid JSON, no other text.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the vendor name, date, and total amount from this receipt ${isPdf ? 'PDF document' : 'image'}. Return JSON only.`
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
              description: "Extract structured data from a receipt",
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
                  }
                },
                required: ["vendor_name", "date", "amount", "category"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const rawData = JSON.parse(toolCall.function.arguments);
        const validatedData = validateAndSanitizeReceiptData(rawData);
        console.log("Validated receipt data:", validatedData);
        
        return new Response(
          JSON.stringify({ success: true, data: validatedData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (validationError) {
        console.error("Validation error:", validationError);
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
        console.error("Failed to parse/validate response content");
      }
    }

    return new Response(
      JSON.stringify({ error: "Could not extract receipt data" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing receipt:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process receipt" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
