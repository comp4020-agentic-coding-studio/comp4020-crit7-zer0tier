import type { APIRoute } from "astro";
import { applyPlan } from "../../lib/db";
import { bus } from "../../lib/events";

// "Use this plan": every activity in it is allocated together, or none is.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const ids = form.getAll("activity").map(String).filter(Boolean);
  const result = applyPlan(ids);
  if (!result.ok) {
    return new Response(null, { status: 303, headers: { location: "/planner/?error=1", "x-reason": result.reason } });
  }
  if (result.changed > 0) bus.emit("change", { outcome: "plan", changed: result.changed });
  return redirect(`/?view=week&planned=${result.changed}`, 303);
};
