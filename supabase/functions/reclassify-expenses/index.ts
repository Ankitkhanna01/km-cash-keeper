import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = [
  "fuel", "repairs", "insurance", "licence", "interest", "other",
  "grocery", "restaurant", "subscription"
] as const;

const SM_CATEGORIES = [
  "grocery", "clothing", "grooming", "mani_pedicure", "transportation",
  "professional_fees", "medicals", "gas", "work_from_home", "cookware",
  "entertainment", "advertising", "car_wash", "delivery_freight", "repairs",
  "hydro", "phone_internet", "rent", "home_insurance", "kitchen_dining",
  "licence", "drivers_insurance", "car_gas", "car", "car_maintenance",
  "home_power", "membership", "gym", "alcohol", "airport_shopping",
  "vitamins", "government_fees", "parking"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
    const { year } = await req.json();

    // Fetch all active expenses for the year
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: expenses, error: fetchError } = await supabaseAdmin
      .from('expenses')
      .select('id, date, vendor_name, amount, category, notes, purpose')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: true });

    if (fetchError) throw fetchError;
    if (!expenses || expenses.length === 0) {
      return new Response(JSON.stringify({ success: true, changes: 0, message: "No expenses found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Reclassifying ${expenses.length} expenses for ${year}`);

    // Build expense list for AI review
    const expenseList = expenses.map((e: any, i: number) => 
      `${i}|${e.vendor_name}|$${e.amount}|${e.category}|${e.notes || ''}`
    ).join('\n');

    const systemPrompt = `You are a Canadian tax expense categorization expert. Review each expense and assign the correct CRA T2125 category AND the correct Salad Master spreadsheet column.

The Salad Master columns are: ${SM_CATEGORIES.join(', ')}

The CRA categories are: ${VALID_CATEGORIES.join(', ')}

IMPORTANT classification rules for this user:
- Fit4Less, GoodLife = gym
- London Drugs = grocery (NOT medical)
- Priceline, hotels = transportation
- Parking (Honk, ParkVictoria, etc.) = parking
- DoorDash, FoodPanda = entertainment (restaurant)
- Freshii, Erito Sushi, Ocean Garden = entertainment
- Purdys Chocolatier = entertainment
- Liquor Plus, Wandering Bear, 4 Mile, Cascadia = alcohol
- World Duty Free = airport_shopping
- SterlingBackcheck = airport_shopping
- Blueprint = vitamins
- RSBC, BCGOV = government_fees
- MODO, EVO = transportation (NOT fuel)
- BC Ferries = transportation
- Uber = transportation
- Gas stations (Esso, Petro, Shell, Chevron) = gas/fuel
- ICBC = drivers_insurance/insurance
- Costco, MM Food = membership
- Starbucks, Tim Hortons, restaurants = entertainment
- Fido, Shaw = phone_internet
- Amazon, Walmart, Thrifty Foods, Save-On = grocery
- Canadian Tire = grocery (unless notes say repairs)
- Staples, Lovable, software = professional_fees
- FedEx = delivery_freight
- Dental = medicals

For each expense, return ONLY the ones that need category changes.`;

    const userPrompt = `Review these ${expenses.length} expenses (format: index|vendor|amount|current_category|notes):

${expenseList}

Return a JSON object with key "changes" containing an array of objects, each with:
- index: the expense index number
- new_category: the correct CRA category (one of: ${VALID_CATEGORIES.join(', ')})
- new_sm_category: the correct Salad Master column (one of: ${SM_CATEGORIES.join(', ')})
- reason: brief explanation

Only include expenses that are INCORRECTLY categorized. If all are correct, return {"changes": []}.`;

    let resultData: any = null;

    // Try Anthropic Claude first
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (ANTHROPIC_API_KEY) {
      try {
        console.log("Reclassify: trying Anthropic Claude");
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const text = data.content?.[0]?.text;
          if (text) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) { resultData = JSON.parse(jsonMatch[0]); console.log("Claude succeeded"); }
          }
        } else {
          console.error(`Claude failed: ${resp.status}`);
          await resp.text();
        }
      } catch (e) { console.error("Claude error:", e); }
    }

    // Fallback to Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!resultData && LOVABLE_API_KEY) {
      try {
        console.log("Reclassify: trying Lovable AI");
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "reclassify_expenses",
                description: "Return expenses that need category changes",
                parameters: {
                  type: "object",
                  properties: {
                    changes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "integer" },
                          new_category: { type: "string" },
                          new_sm_category: { type: "string" },
                          reason: { type: "string" }
                        },
                        required: ["index", "new_category", "reason"]
                      }
                    }
                  },
                  required: ["changes"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "reclassify_expenses" } }
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
            if (content) {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) resultData = JSON.parse(jsonMatch[0]);
            }
          }
        } else {
          console.error(`Lovable AI failed: ${resp.status}`);
        }
      } catch (e) { console.error("Lovable AI error:", e); }
    }

    if (!resultData || !Array.isArray(resultData.changes)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "AI could not process the expenses. Try again later." 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const changes = resultData.changes;
    let updatedCount = 0;
    const details: any[] = [];

    for (const change of changes) {
      const idx = change.index;
      if (idx < 0 || idx >= expenses.length) continue;
      
      const expense = expenses[idx];
      const newCat = change.new_category;
      
      // Only update if the category is valid and actually different
      if (VALID_CATEGORIES.includes(newCat as any) && newCat !== expense.category) {
        const { error: updateError } = await supabaseAdmin
          .from('expenses')
          .update({ category: newCat })
          .eq('id', expense.id);

        if (!updateError) {
          updatedCount++;
          details.push({
            vendor: expense.vendor_name,
            from: expense.category,
            to: newCat,
            sm_column: change.new_sm_category || null,
            reason: change.reason,
          });
        }
      }
    }

    console.log(`Reclassified ${updatedCount} expenses out of ${changes.length} suggested changes`);

    return new Response(JSON.stringify({ 
      success: true, 
      changes: updatedCount, 
      total_reviewed: expenses.length,
      details 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Reclassification error:", error);
    return new Response(JSON.stringify({ error: "Failed to reclassify expenses" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
