import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "tax_year_summary",
  title: "Tax year summary",
  description:
    "Summarize a tax year for the signed-in driver: business vs personal kilometres, odometer total, unlogged gap, business-use percentage, and expense totals by category.",
  inputSchema: {
    year: z.number().int().min(2000).max(2100).describe("Tax year, e.g. 2026."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const km = { business: 0, personal: 0, uncategorized: 0 };
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("trips")
        .select("kilometres, category")
        .gte("date", from)
        .lte("date", to)
        .range(offset, offset + pageSize - 1);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      for (const t of data ?? []) {
        const key = t.category === "business" || t.category === "personal" ? t.category : "uncategorized";
        km[key] += t.kilometres ?? 0;
      }
      if (!data || data.length < pageSize) break;
    }

    const byCategory: Record<string, number> = {};
    let expenseTotal = 0;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount, category")
        .is("deleted_at", null)
        .gte("date", from)
        .lte("date", to)
        .range(offset, offset + pageSize - 1);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      for (const e of data ?? []) {
        byCategory[e.category] = Number(((byCategory[e.category] ?? 0) + (e.amount ?? 0)).toFixed(2));
        expenseTotal += e.amount ?? 0;
      }
      if (!data || data.length < pageSize) break;
    }

    const { data: odo, error: odoError } = await supabase
      .from("odometer_readings")
      .select("start_reading, end_reading")
      .eq("year", year)
      .maybeSingle();
    if (odoError) return { content: [{ type: "text", text: odoError.message }], isError: true };

    const loggedKm = km.business + km.personal + km.uncategorized;
    const odometerKm = odo?.end_reading != null ? odo.end_reading - odo.start_reading : null;
    const unloggedKm = odometerKm != null ? Math.max(0, Number((odometerKm - loggedKm).toFixed(1))) : null;
    const businessPercentOfLogged = loggedKm > 0 ? Number(((km.business / loggedKm) * 100).toFixed(1)) : 0;
    const businessPercentOfOdometer =
      odometerKm && odometerKm > 0 ? Number(((km.business / odometerKm) * 100).toFixed(1)) : null;

    const summary = {
      year,
      business_km: Number(km.business.toFixed(1)),
      personal_km: Number(km.personal.toFixed(1)),
      uncategorized_km: Number(km.uncategorized.toFixed(1)),
      logged_km: Number(loggedKm.toFixed(1)),
      odometer_km: odometerKm,
      unlogged_km: unloggedKm,
      business_percent_of_logged: businessPercentOfLogged,
      business_percent_of_odometer: businessPercentOfOdometer,
      expense_total: Number(expenseTotal.toFixed(2)),
      expenses_by_category: byCategory,
    };

    return {
      content: [
        {
          type: "text",
          text: `${year}: ${summary.business_km} business km of ${summary.logged_km} logged (${businessPercentOfLogged}%), expenses $${summary.expense_total}.`,
        },
      ],
      structuredContent: { summary },
    };
  },
});
