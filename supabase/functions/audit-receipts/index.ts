import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AuditResult {
  expense_id: string;
  vendor_name: string;
  existing_amount: number;
  existing_date: string;
  claude_vendor: string | null;
  claude_amount: number | null;
  claude_date: string | null;
  claude_items: any[];
  discrepancies: string[];
  status: "match" | "discrepancy" | "error";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const userId = userData.user.id;
    const { year, batch_offset = 0, batch_size = 5 } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch expenses with receipts for this year
    const { data: expenses, error: fetchError } = await supabaseAdmin
      .from('expenses')
      .select('id, date, vendor_name, amount, category, notes, receipt_url')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('receipt_url', 'is', null)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: true })
      .range(batch_offset, batch_offset + batch_size - 1);

    if (fetchError) throw fetchError;

    // Get total count for progress
    const { count } = await supabaseAdmin
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('receipt_url', 'is', null)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);

    if (!expenses || expenses.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, results: [], total: count || 0, 
        batch_offset, has_more: false, message: "No more receipts to audit" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!ANTHROPIC_API_KEY && !LOVABLE_API_KEY && !GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "No AI keys configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a receipt auditor. Extract from this receipt:
- vendor_name: The store/business name
- date: Transaction date in YYYY-MM-DD format  
- amount: Total amount as a number
- card_last4: Last 4 digits of payment card if visible
- items: Array of line items with name, quantity, unit, price

Return ONLY valid JSON.`;

    const results: AuditResult[] = [];

    for (const expense of expenses) {
      try {
        // Download receipt from storage
        const { data: fileData, error: dlError } = await supabaseAdmin
          .storage.from('receipts')
          .download(expense.receipt_url);

        if (dlError || !fileData) {
          results.push({
            expense_id: expense.id,
            vendor_name: expense.vendor_name,
            existing_amount: expense.amount,
            existing_date: expense.date,
            claude_vendor: null, claude_amount: null, claude_date: null,
            claude_items: [],
            discrepancies: ["Could not download receipt"],
            status: "error",
          });
          continue;
        }

        // Convert to base64
        const arrayBuffer = await fileData.arrayBuffer();
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const mimeType = fileData.type || "image/jpeg";

        let resultData: any = null;

        // 1. Try Claude first
        if (ANTHROPIC_API_KEY) {
          try {
            console.log(`Auditing ${expense.vendor_name} with Claude`);
            const resp = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{ role: "user", content: [
                  { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } },
                  { type: "text", text: "Extract vendor, date, total amount, and all line items from this receipt. Return JSON only." }
                ]}],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              const text = data.content?.[0]?.text;
              if (text) {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) resultData = JSON.parse(jsonMatch[0]);
              }
            } else {
              console.error(`Claude audit failed: ${resp.status}`);
              await resp.text();
            }
          } catch (e) { console.error("Claude audit error:", e); }
        }

        // 2. Fallback to Lovable AI
        if (!resultData && LOVABLE_API_KEY) {
          try {
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
                    { type: "text", text: "Extract vendor, date, total amount, and all line items." },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
                  ]}
                ],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              const content = data.choices?.[0]?.message?.content;
              if (content) {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) resultData = JSON.parse(jsonMatch[0]);
              }
            } else { await resp.text(); }
          } catch (e) { console.error("Lovable AI audit error:", e); }
        }

        // 3. Fallback to Gemini direct
        if (!resultData && GEMINI_API_KEY) {
          try {
            const resp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [
                    { text: `${systemPrompt}\n\nExtract vendor, date, total amount, and all line items.` },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                  ]}],
                  generationConfig: { responseMimeType: "application/json" }
                }),
              }
            );
            if (resp.ok) {
              const data = await resp.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) resultData = JSON.parse(text);
            } else { await resp.text(); }
          } catch (e) { console.error("Gemini audit error:", e); }
        }

        if (!resultData) {
          results.push({
            expense_id: expense.id,
            vendor_name: expense.vendor_name,
            existing_amount: expense.amount,
            existing_date: expense.date,
            claude_vendor: null, claude_amount: null, claude_date: null,
            claude_items: [],
            discrepancies: ["AI could not process this receipt"],
            status: "error",
          });
          continue;
        }

        // Compare results
        const claudeVendor = resultData.vendor_name || null;
        const claudeAmount = typeof resultData.amount === 'number' ? Math.round(resultData.amount * 100) / 100 : null;
        const claudeDate = resultData.date || null;
        const claudeItems = Array.isArray(resultData.items) ? resultData.items : [];
        const discrepancies: string[] = [];

        // Check amount discrepancy (>$0.50 difference)
        if (claudeAmount !== null && Math.abs(claudeAmount - Number(expense.amount)) > 0.50) {
          discrepancies.push(`Amount: DB has $${expense.amount}, receipt shows $${claudeAmount}`);
        }

        // Check date discrepancy
        if (claudeDate && claudeDate !== expense.date) {
          discrepancies.push(`Date: DB has ${expense.date}, receipt shows ${claudeDate}`);
        }

        // Check vendor mismatch (fuzzy)
        if (claudeVendor) {
          const dbVendor = expense.vendor_name.toLowerCase().replace(/[^a-z]/g, '');
          const aiVendor = claudeVendor.toLowerCase().replace(/[^a-z]/g, '');
          if (!dbVendor.includes(aiVendor.slice(0, 5)) && !aiVendor.includes(dbVendor.slice(0, 5))) {
            discrepancies.push(`Vendor: DB has "${expense.vendor_name}", receipt shows "${claudeVendor}"`);
          }
        }

        // Check if items were in notes (missing items)
        const existingNotes = (expense.notes || '').toLowerCase();
        if (claudeItems.length > 0 && !existingNotes.includes('items:') && !existingNotes.includes('•')) {
          discrepancies.push(`Receipt has ${claudeItems.length} line items not stored in notes`);
        }

        results.push({
          expense_id: expense.id,
          vendor_name: expense.vendor_name,
          existing_amount: Number(expense.amount),
          existing_date: expense.date,
          claude_vendor: claudeVendor,
          claude_amount: claudeAmount,
          claude_date: claudeDate,
          claude_items: claudeItems,
          discrepancies,
          status: discrepancies.length > 0 ? "discrepancy" : "match",
        });

        // Small delay between requests
        await new Promise(r => setTimeout(r, 500));

      } catch (e) {
        console.error(`Error auditing expense ${expense.id}:`, e);
        results.push({
          expense_id: expense.id,
          vendor_name: expense.vendor_name,
          existing_amount: Number(expense.amount),
          existing_date: expense.date,
          claude_vendor: null, claude_amount: null, claude_date: null,
          claude_items: [],
          discrepancies: [`Processing error: ${e instanceof Error ? e.message : 'Unknown'}`],
          status: "error",
        });
      }
    }

    const has_more = (batch_offset + batch_size) < (count || 0);

    return new Response(JSON.stringify({ 
      success: true, 
      results, 
      total: count || 0,
      batch_offset,
      has_more,
      summary: {
        scanned: results.length,
        matches: results.filter(r => r.status === "match").length,
        discrepancies: results.filter(r => r.status === "discrepancy").length,
        errors: results.filter(r => r.status === "error").length,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Audit error:", error);
    return new Response(JSON.stringify({ error: "Failed to audit receipts" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
