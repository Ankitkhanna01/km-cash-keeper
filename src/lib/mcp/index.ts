import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTripsTool from "./tools/list-trips";
import logTripTool from "./tools/log-trip";
import listExpensesTool from "./tools/list-expenses";
import logExpenseTool from "./tools/log-expense";
import taxYearSummaryTool from "./tools/tax-year-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "drive-deduct",
  title: "Drive & Deduct",
  version: "0.1.0",
  instructions:
    "Mileage and expense tracking for a Canadian self-employed driver (CRA Form T2125). Use `list_trips` and `log_trip` for kilometres, `list_expenses` and `log_expense` for spending, and `tax_year_summary` for yearly business-use percentage and totals. All dates are Pacific time in YYYY-MM-DD format.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTripsTool, logTripTool, listExpensesTool, logExpenseTool, taxYearSummaryTool],
});
