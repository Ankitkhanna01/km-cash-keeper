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
    console.log("AI response:", JSON.stringify(data));

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const receiptData = JSON.parse(toolCall.function.arguments);
      console.log("Extracted receipt data:", receiptData);
      
      return new Response(
        JSON.stringify({ success: true, data: receiptData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return new Response(
          JSON.stringify({ success: true, data: parsed }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        console.error("Failed to parse response content:", content);
      }
    }

    return new Response(
      JSON.stringify({ error: "Could not extract receipt data" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing receipt:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
