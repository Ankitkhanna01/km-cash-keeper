import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "log_expense",
  title: "Log an expense",
  description: "Record a new expense for the signed-in driver with date, vendor, amount and category.",
  inputSchema: {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Expense date, YYYY-MM-DD (Pacific time)."),
    vendor_name: z.string().trim().min(1).describe("Vendor or store name."),
    amount: z.number().positive().describe("Amount in CAD."),
    category: z.string().trim().min(1).describe("Category, e.g. fuel, repairs, insurance, licence, interest, grocery, other."),
    purpose: z.enum(["business", "personal"]).optional().describe("Whether the expense is business or personal (default business)."),
    notes: z.string().trim().optional().describe("Free-form notes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        user_id: ctx.getUserId(),
        date: input.date,
        vendor_name: input.vendor_name,
        amount: input.amount,
        category: input.category,
        purpose: input.purpose ?? "business",
        notes: input.notes ?? null,
      })
      .select("id, date, vendor_name, amount, category, purpose")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Logged $${data.amount} at ${data.vendor_name} on ${data.date}.` }],
      structuredContent: {
        expense: {
          id: data.id,
          date: data.date,
          vendor_name: data.vendor_name,
          amount: data.amount,
          category: data.category,
          purpose: data.purpose,
        },
      },
    };
  },
});
