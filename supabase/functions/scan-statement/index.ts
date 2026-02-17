import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  category_hint: string;
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
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image } = await req.json();
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!LOVABLE_API_KEY && !OPENROUTER_API_KEY && !GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: no AI keys" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a credit card/bank statement parser. Extract ALL individual transactions from this statement.
For each transaction return:
- date: transaction date in YYYY-MM-DD format
- description: the merchant/vendor name or transaction description (clean it up, remove transaction codes)
- amount: the amount as a positive number (debits/charges as positive)
- category_hint: one of: fuel, restaurant, grocery, insurance, repairs, subscription, other

Only include actual purchase transactions. Skip payments, credits, interest charges, and fees unless they look like business expenses.
Return ONLY valid JSON with key "transactions" containing an array.`;

    const userPrompt = "Extract all transactions from this credit card/bank statement. Return JSON only with key: transactions.";

    const base64Match = image.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = base64Match ? base64Match[1] : "application/pdf";
    const base64Data = base64Match ? base64Match[2] : image;

    let resultData: unknown = null;

    // 1. Try Lovable AI gateway first (auto-provisioned)
    if (!resultData && LOVABLE_API_KEY) {
      try {
        console.log("Statement scan: trying Lovable AI");
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                name: "extract_statement_transactions",
                description: "Extract transactions from a credit card statement",
                parameters: {
                  type: "object",
                  properties: {
                    transactions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: { type: "string" },
                          description: { type: "string" },
                          amount: { type: "number" },
                          category_hint: { type: "string", enum: ["fuel", "restaurant", "grocery", "insurance", "repairs", "subscription", "other"] }
                        },
                        required: ["date", "description", "amount", "category_hint"]
                      }
                    }
                  },
                  required: ["transactions"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "extract_statement_transactions" } }
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            resultData = JSON.parse(toolCall.function.arguments);
            console.log("Lovable AI succeeded");
          } else {
            const content = data.choices?.[0]?.message?.content;
            if (content) resultData = JSON.parse(content);
          }
        } else {
          console.error(`Lovable AI failed: ${resp.status}`);
        }
      } catch (e) { console.error("Lovable AI error:", e); }
    }

    // 2. Fallback to OpenRouter
    if (!resultData && OPENROUTER_API_KEY) {
      try {
        console.log("Statement scan: trying OpenRouter");
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("OpenRouter succeeded"); }
        } else {
          console.error(`OpenRouter failed: ${resp.status}`);
        }
      } catch (e) { console.error("OpenRouter error:", e); }
    }

    // 3. Fallback to Routeway.ai
    const ROUTEWAY_API_KEY = Deno.env.get("ROUTEWAY_API_KEY");
    if (!resultData && ROUTEWAY_API_KEY) {
      try {
        console.log("Statement scan: trying Routeway.ai");
        const resp = await fetch("https://api.routeway.ai/v1/chat/completions", {
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
        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("Routeway.ai succeeded"); }
        } else {
          console.error(`Routeway.ai failed: ${resp.status}`);
        }
      } catch (e) { console.error("Routeway.ai error:", e); }
    }

    // 4. Fallback to Moonshot AI
    const MOONSHOT_API_KEY = Deno.env.get("MOONSHOT_API_KEY");
    if (!resultData && MOONSHOT_API_KEY) {
      try {
        console.log("Statement scan: trying Moonshot AI");
        const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
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
        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("Moonshot AI succeeded"); }
        } else {
          console.error(`Moonshot AI failed: ${resp.status}`);
        }
      } catch (e) { console.error("Moonshot AI error:", e); }
    }

    // 5. Fallback to Groq
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!resultData && GROQ_API_KEY) {
      try {
        console.log("Statement scan: trying Groq");
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
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

    // 6. Fallback to DeepSeek (Cerebras skipped - text-only, can't read images)
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    if (!resultData && DEEPSEEK_API_KEY) {
      try {
        console.log("Statement scan: trying DeepSeek");
        const resp = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
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
          if (content) { resultData = JSON.parse(content); console.log("DeepSeek succeeded"); }
        } else {
          console.error(`DeepSeek failed: ${resp.status}`);
        }
      } catch (e) { console.error("DeepSeek error:", e); }
    }

    // 7. Fallback to Google Gemini API directly (flash-lite for higher quota, with retry+backoff on 429)
    if (!resultData && GEMINI_API_KEY) {
      const GEMINI_RETRIES = 3;
      const GEMINI_BACKOFF = [5000, 10000, 20000];
      for (let attempt = 0; attempt < GEMINI_RETRIES && !resultData; attempt++) {
        try {
          if (attempt > 0) {
            const waitMs = GEMINI_BACKOFF[attempt - 1] || 20000;
            console.log(`Gemini retry ${attempt + 1}/${GEMINI_RETRIES}, waiting ${waitMs}ms`);
            await new Promise(r => setTimeout(r, waitMs));
          }
          console.log(`Statement scan: trying Gemini (attempt ${attempt + 1}, 2.0-flash — 1500 RPD)`);
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [
                  { text: `${systemPrompt}\n\n${userPrompt}` },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]}],
                generationConfig: { responseMimeType: "application/json" }
              }),
            }
          );
          if (resp.ok) {
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) { resultData = JSON.parse(text); console.log("Gemini succeeded"); }
          } else if (resp.status === 429) {
            console.warn(`Gemini 429 rate limited (attempt ${attempt + 1})`);
            await resp.text();
          } else {
            console.error(`Gemini failed: ${resp.status}`);
            await resp.text();
            break;
          }
        } catch (e) { console.error("Gemini error:", e); break; }
      }
    }

    // 9. Fallback to Ollama (self-hosted)
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL");
    if (!resultData && OLLAMA_BASE_URL) {
      try {
        console.log("Statement scan: trying Ollama");
        const resp = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.2-vision",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt, images: [base64Data] }
            ],
            format: "json",
            stream: false,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const content = data.message?.content;
          if (content) { resultData = JSON.parse(content); console.log("Ollama succeeded"); }
        } else {
          console.error(`Ollama failed: ${resp.status}`);
        }
      } catch (e) { console.error("Ollama error:", e); }
    }

    if (resultData && typeof resultData === 'object') {
      const raw = resultData as Record<string, unknown>;
      const transactions: StatementTransaction[] = [];
      const rawTxns = Array.isArray(raw.transactions) ? raw.transactions : [];

      for (const t of rawTxns) {
        if (t && typeof t === 'object') {
          const txn = t as Record<string, unknown>;
          const date = typeof txn.date === 'string' ? txn.date.trim() : '';
          const description = typeof txn.description === 'string' ? txn.description.trim() : '';
          const amount = typeof txn.amount === 'number' ? Math.round(txn.amount * 100) / 100 : 0;
          const category_hint = typeof txn.category_hint === 'string' ? txn.category_hint : 'other';
          if (date && description && amount > 0) {
            transactions.push({ date, description, amount, category_hint });
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, transactions }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Could not extract transactions. AI credits may be exhausted — try again later or top up in Settings → Workspace → Usage." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Statement processing error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process statement" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
