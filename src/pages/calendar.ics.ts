import type { APIRoute } from "astro";
import { listGroups } from "../lib/db";
import { toICS } from "../lib/timetable";

// The subscribable feed: every session of every allocated activity, on the
// dates MyTimetable lists for it (so breaks and holidays stay out).
// Wait-listed ones stay out until they're real.
export const GET: APIRoute = () => {
  const entries = listGroups().flatMap((g) =>
    (g.chosen?.sessions ?? []).map((s) => ({
      ...s,
      uid: `${s.id}@timetable-sorted`,
      summary: `${g.course.code} ${g.group.label} ${s.activityType}`,
      description: `${s.description}${s.staff !== "-" ? ` · ${s.staff}` : ""}${g.chosen?.source === "illustrative" ? " · illustrative sample time" : ""}`,
    })),
  );
  return new Response(toICS(entries, new Date()), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="timetable.ics"',
      "cache-control": "no-cache",
    },
  });
};
