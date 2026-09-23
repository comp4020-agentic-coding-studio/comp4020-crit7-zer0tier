import type { APIRoute } from "astro";
import { listGroups } from "../lib/db";
import { toICS } from "../lib/timetable";

// The subscribable feed: every allocated class, weekly through the
// semester, with the teaching break excluded. Wait-listed ones stay out
// until they're real.
export const GET: APIRoute = () => {
  const entries = listGroups().flatMap((g) =>
    g.chosen
      ? [
          {
            ...g.chosen,
            uid: `${g.chosen.id}@timetable-sorted`,
            summary: `${g.course.code} ${g.group.label} (${g.group.kind})`,
          },
        ]
      : [],
  );
  return new Response(toICS(entries, new Date()), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="timetable.ics"',
      "cache-control": "no-cache",
    },
  });
};
