import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_expenses",
  title: "List expenses",
  description:
    "List the signed-in driver's expenses, optionally filtered by date range, category or vendor name.",
  inputSchema: {
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest expense date, YYYY-MM-DD."),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest expense date, YYYY-MM-DD."),
    category: z.string().trim().optional().describe("Expense category, e.g. fuel, repairs, insurance, grocery."),
    vendor: z.string().trim().optional().describe("Vendor name (partial match)."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum expenses to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date, category, vendor, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("expenses")
      .select("id, date, vendor_name, amount, category, purpose, notes")
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(limit ?? 50);

    if (start_date) query = query.gte("date", start_date);
    if (end_date) query = query.lte("date", end_date);
    if (category) query = query.eq("category", category);
    if (vendor) query = query.ilike("vendor_name", `%${vendor}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const expenses = (data ?? []).map((e) => ({
      id: e.id,
      date: e.date,
      vendor_name: e.vendor_name,
      amount: e.amount,
      category: e.category,
      purpose: e.purpose,
      notes: e.notes ?? null,
    }));
    const total = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);

    return {
      content: [{ type: "text", text: `${expenses.length} expenses totalling $${total.toFixed(2)}.` }],
      structuredContent: { expenses, total_amount: Number(total.toFixed(2)) },
    };
  },
});
