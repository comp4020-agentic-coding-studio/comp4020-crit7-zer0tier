import type { APIRoute } from "astro";
import { leaveWaitlist } from "../../lib/db";
import { bus } from "../../lib/events";

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const groupId = String(form.get("group") ?? "");
  leaveWaitlist(groupId);
  bus.emit("change", { groupId, outcome: "left-waitlist" });
  return redirect(`/courses/${groupId.split("-")[0]}/#${groupId}`, 303);
};
