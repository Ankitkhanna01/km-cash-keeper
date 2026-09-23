import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_trips",
  title: "List trips",
  description:
    "List the signed-in driver's logged trips, optionally filtered by date range and category (business, personal, uncategorized).",
  inputSchema: {
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest trip date, YYYY-MM-DD."),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Latest trip date, YYYY-MM-DD."),
    category: z.enum(["business", "personal", "uncategorized"]).optional().describe("Filter by trip category."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum trips to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("trips")
      .select("id, date, start_time, end_time, start_location, end_location, kilometres, category, company, notes")
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(limit ?? 50);

    if (start_date) query = query.gte("date", start_date);
    if (end_date) query = query.lte("date", end_date);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const trips = (data ?? []).map((t) => ({
      id: t.id,
      date: t.date,
      start_time: t.start_time,
      end_time: t.end_time,
      start_location: t.start_location,
      end_location: t.end_location,
      kilometres: t.kilometres,
      category: t.category,
      company: t.company ?? null,
      notes: t.notes ?? null,
    }));
    const totalKm = trips.reduce((sum, t) => sum + (t.kilometres ?? 0), 0);

    return {
      content: [{ type: "text", text: `${trips.length} trips, ${totalKm.toFixed(1)} km total.` }],
      structuredContent: { trips, total_km: Number(totalKm.toFixed(1)) },
    };
  },
});
