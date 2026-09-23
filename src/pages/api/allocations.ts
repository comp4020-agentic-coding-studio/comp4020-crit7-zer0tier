import type { APIRoute } from "astro";
import { allocate, getCourse } from "../../lib/db";
import { bus } from "../../lib/events";

// A plain HTML form POSTs here. On success the 303 lands on the timetable
// with the new class highlighted, so the form works with no JavaScript and
// a reload shows what SQLite holds. A refused request gets its status code
// and a page saying why, with a link back.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const groupId = String(form.get("group") ?? "");
  const activityId = String(form.get("activity") ?? "");
  const result = allocate(groupId, activityId);
  const course = getCourse(groupId.split("-")[0] ?? "");

  if (!result.ok) {
    const back = course
      ? `/courses/${course.code}/?error=${encodeURIComponent(result.reason)}#${groupId}`
      : "/allocate/";
    const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not saved</title></head><body><nav aria-label="Main"><a href="/">My timetable</a></nav><main><h1>Not saved</h1><p>${result.reason}</p><p><a href="${back}">Back to choosing</a></p></main></body></html>`;
    return new Response(html, {
      status: result.code,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (result.outcome !== "unchanged") {
    bus.emit("change", { groupId, activityId, outcome: result.outcome });
  }
  const param = result.outcome === "waitlisted" ? "waitlisted" : "done";
  return redirect(`/?view=week&${param}=${encodeURIComponent(activityId)}`, 303);
};
