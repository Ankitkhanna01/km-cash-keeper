import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "log_trip",
  title: "Log a trip",
  description: "Record a new trip for the signed-in driver with date, times, locations, distance and category.",
  inputSchema: {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Trip date, YYYY-MM-DD (Pacific time)."),
    start_time: z.string().describe("Start time, HH:MM (24-hour, Pacific time)."),
    end_time: z.string().describe("End time, HH:MM (24-hour, Pacific time)."),
    start_location: z.string().trim().min(1).describe("Where the trip started."),
    end_location: z.string().trim().min(1).describe("Where the trip ended."),
    kilometres: z.number().positive().describe("Distance driven in kilometres."),
    category: z.enum(["business", "personal", "uncategorized"]).describe("Trip category."),
    company: z.string().trim().optional().describe("Platform or company, e.g. Uber, DoorDash, Skip."),
    notes: z.string().trim().optional().describe("Free-form notes about the trip."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id: ctx.getUserId(),
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        start_location: input.start_location,
        end_location: input.end_location,
        kilometres: input.kilometres,
        category: input.category,
        company: input.company ?? null,
        notes: input.notes ?? null,
      })
      .select("id, date, kilometres, category")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Logged ${data.kilometres} km ${data.category} trip on ${data.date}.` }],
      structuredContent: { trip: { id: data.id, date: data.date, kilometres: data.kilometres, category: data.category } },
    };
  },
});
