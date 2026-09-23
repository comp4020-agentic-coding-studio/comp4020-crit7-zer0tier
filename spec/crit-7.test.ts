import { describe, expect, inject, it } from "vitest";
import {
  clashes,
  clashesOnADate,
  fmtDuration,
  nextClass,
  occurrences,
  occursOn,
  parseDates,
  teachingWeek,
  toICS,
} from "../src/lib/timetable";
import { type PlanGroup, plan, scorePlan } from "../src/lib/planner";
import { KEY_DATES, isPublicHoliday } from "../src/lib/anuCalendar";
import { isTeachingDay, periodOn, semesterWeeks, weekToShow } from "../src/lib/timetable";

// This week's own contract (crit 07, "Build the ANU system you wish
// existed"): a rebuilt MyTimetable. The published spec's one mechanically
// checkable line is "the core flow persists across a reload: create
// something, and it's still there". Here the core flow is choosing a
// tutorial time; the quick-access option is the home page's saved view; and
// every class opens a details page carrying MyTimetable's own record.
// Everything is driven over HTTP against the built server with a fresh
// database (spec/global-setup.ts); nothing is carried between the POST and
// the GET but the database.
//
// Assertions avoid the week grid's contents where they'd depend on
// today's date (it shows only what runs this week). Layout isn't asserted
// at all: jsdom computes none. `pnpm audit:browser` checks that.
const baseUrl = inject("baseUrl");

const post = (path: string, body: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    // Astro's CSRF check requires a same-origin Origin header; a browser
    // sends this automatically, a bare fetch doesn't.
    headers: { origin: baseUrl },
    body: new URLSearchParams(body),
    redirect: "manual",
  });
const page = async (path: string) => (await fetch(new URL(path, baseUrl))).text();

// The student's MyTimetable records, transcribed here from what they pasted
// (23 Sep 2026), independently of src/lib/seed.ts, so a typo in the seed
// fails this rather than agreeing with itself. "O?Donoghue" in the paste is
// a lost apostrophe; ANU's map spells it O’Donoghue.
const CC = "Lowitja O’Donoghue Cultural Centre Bldg 153";
const MYTT = [
  { id: "PHIL1005-LecA-01", type: "Lecture", activity: "01", description: "- PHIL1005_S2_(01)-LecA/01", day: "Mon", time: "12:00", location: `Manning Clark Hall Rm 1.04_${CC}`, staff: "Colin Klein", duration: "1 hr", dates: "27/7-31/8, 21/9-28/9, 12/10-26/10", seats: "33" },
  { id: "COMP3900-LecA-01", type: "Lecture", activity: "01", description: "on campus - COMP3900_S2_(01)-LecA/01 + COMP6390_S2_(01)-LecA/01", day: "Mon", time: "13:00", location: `Cinema Rm 1.02_${CC}`, staff: "Charles Martin", duration: "2 hrs", dates: "27/7-31/8, 21/9-28/9, 12/10-26/10", seats: "121" },
  { id: "COMP4020-TutA-02", type: "Tutorial", activity: "02-P1", description: "on campus - COMP4020_S2_(01)-TutA/02 + COMP8020_S2_(01)-TutA/02", day: "Mon", time: "15:30", location: "Rm 4.03_Marie Reay Bldg 155", staff: "-", duration: "1.5 hrs", dates: "3/8-31/8, 21/9-28/9, 12/10-26/10", seats: "0" },
  { id: "PHIL1005-LecB-01", type: "Lecture", activity: "01", description: "- PHIL1005_S2_(01)-LecB/01", day: "Wed", time: "13:00", location: `Manning Clark Hall Rm 1.04_${CC}`, staff: "Colin Klein", duration: "1 hr", dates: "29/7-2/9, 23/9-28/10", seats: "33" },
  { id: "PHIL1005-TutA-07", type: "Tutorial", activity: "07", description: "- PHIL1005_S2_(01)-TutA/07", day: "Thu", time: "08:00", location: "Rm G39_Copland Bldg 24", staff: "-", duration: "1 hr", dates: "30/7-3/9, 24/9-29/10", seats: "5" },
  { id: "COMP4020-LecA-01", type: "Lecture", activity: "01", description: "on campus - COMP4020_S2_(01)-LecA/01 + COMP8020_S2_(01)-LecA/01", day: "Thu", time: "11:00", location: "Rm 2.02_Fulton Muir Bldg 95", staff: "Benjamin John Swift", duration: "2 hrs", dates: "30/7-3/9, 24/9-29/10", seats: "0" },
  { id: "COMP3900-TutA-07", type: "Tutorial", activity: "07-P1", description: "on campus - COMP3900_S2_(01)-TutA/07 + COMP6390_S2_(01)-TutA/07", day: "Fri", time: "09:00", location: "Rm 2.03_Fulton Muir Bldg 95", staff: "-", duration: "1.5 hrs", dates: "7/8-4/9, 25/9-30/10", seats: "1" },
  { id: "COMP3900-TutA-07", type: "Drop-In Class", activity: "07-P2", description: "on campus - COMP3900_S2_(01)-DroA/07 + COMP6390_S2_(01)-DroA/07", day: "Fri", time: "10:30", location: "Rm 2.03_Fulton Muir Bldg 95", staff: "-", duration: "0.5 hr", dates: "7/8-4/9, 25/9-30/10", seats: "1" },
];

// "<dt>Location</dt><dd>X</dd>", allowing Astro's whitespace and wrappers
const field = (name: string, value: string) =>
  new RegExp(`<dt[^>]*>${name}</dt>\\s*<dd[^>]*>\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

describe("details: every MyTimetable record has a page with all its fields", () => {
  for (const r of MYTT) {
    it(`${r.id} ${r.activity}`, async () => {
      const res = await fetch(new URL(`/activities/${r.id}/`, baseUrl));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('data-source="mytt"');
      expect(html).toMatch(field("Activity Type", r.type));
      expect(html).toMatch(field("Activity", r.activity));
      expect(html).toMatch(field("Description", r.description));
      expect(html).toMatch(field("Day", r.day));
      expect(html).toMatch(field("Time", r.time));
      expect(html).toMatch(field("Campus", "ACTON"));
      expect(html).toMatch(field("Location", r.location));
      expect(html).toMatch(field("Duration", r.duration));
      expect(html).toMatch(field("Dates", r.dates));
      expect(html).toMatch(field("Seats", r.seats));
      expect(html).toMatch(field("Semester", "Second Semester, 2026"));
      if (r.staff !== "-") expect(html).toMatch(field("Staff", r.staff));
    });
  }

  it("marks sample data as sample, and 404s an unknown activity", async () => {
    expect(await page("/activities/COMP3500-LecA-01/")).toContain('data-source="illustrative"');
    expect((await fetch(new URL("/activities/NOPE-LecA-01/", baseUrl))).status).toBe(404);
  });

  it("is linked from the timetable and the allocation overview", async () => {
    expect(await page("/?view=week")).toMatch(/href="\/activities\/[A-Z0-9]+-[A-Za-z]+-\d+\/"/);
    const overview = await page("/allocate/");
    for (const id of new Set(MYTT.map((r) => r.id))) expect(overview).toContain(`href="/activities/${id}/"`);
  });
});

describe("every week of the semester, first to last, on ANU's calendar", () => {
  // runs before anything changes the seeded (real) allocations
  const week = (monday: string) => page(`/?view=week&week=${monday}`);
  const on = (html: string, id: string) => html.includes(`data-activity="${id}"`);

  it("offers all 14 weeks: 1-6, the two break weeks, 7-12", async () => {
    const html = await week("2026-07-27");
    const chips = [...html.matchAll(/data-week="([^"]+)"/g)].map((m) => m[1]);
    expect(chips).toEqual([
      "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31",
      "2026-09-07", "2026-09-14",
      "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26",
    ]);
  });

  it("week 1 has the lectures but no tutorials that start later", async () => {
    const html = await week("2026-07-27");
    expect(html).toMatch(/<h2 id="week-h"[^>]*>\s*Week 1/);
    expect(on(html, "PHIL1005-LecA-01")).toBe(true); // Mon 27 Jul
    expect(on(html, "PHIL1005-TutA-07")).toBe(true); // starts Thu 30 Jul
    expect(on(html, "COMP4020-TutA-02")).toBe(false); // starts Mon 3 Aug
    expect(on(html, "COMP3900-TutA-07")).toBe(false); // starts Fri 7 Aug
    expect(html).toContain('data-step="prev" data-edge'); // nothing before week 1
    expect(html).toContain('href="/?view=week&amp;week=2026-08-03#week-h" data-step="next"'); // next is week 2
    expect(html).toMatch(/aria-current="true"[^>]*data-week="2026-07-27"/);
  });

  it("steps both ways from the middle", async () => {
    const html = await week("2026-09-21"); // week 7: previous is the second break week
    expect(html).toContain('href="/?view=week&amp;week=2026-09-14#week-h" data-step="prev"');
    expect(html).toContain('href="/?view=week&amp;week=2026-09-28#week-h" data-step="next"');
    expect(html).toMatch(/aria-current="true"[^>]*data-week="2026-09-21"/);
  });

  it("week 2 adds COMP4020 TutA (Mon 3 Aug) and COMP3900 TutA (Fri 7 Aug)", async () => {
    expect(on(await week("2026-08-03"), "COMP4020-TutA-02")).toBe(true);
    expect(on(await week("2026-08-03"), "COMP3900-TutA-07")).toBe(true); // Fri 7 Aug is still week 2
  });

  it("the break weeks are empty and say so", async () => {
    for (const monday of ["2026-09-07", "2026-09-14"]) {
      const html = await week(monday);
      expect(html).toMatch(/<h2 id="week-h"[^>]*>\s*Teaching break/);
      expect(html).not.toMatch(/class="event[^"]*"[^>]*data-activity=/);
    }
  });

  it("week 9 marks Labour Day and drops that Monday's classes only", async () => {
    const html = await week("2026-10-05");
    expect(html).toMatch(/<h2 id="week-h"[^>]*>\s*Week 9/);
    expect(html).toContain('data-holiday="2026-10-05"');
    expect(on(html, "PHIL1005-LecA-01")).toBe(false); // Mon
    expect(on(html, "COMP3900-LecA-01")).toBe(false); // Mon
    expect(on(html, "PHIL1005-LecB-01")).toBe(true); // Wed 7 Oct
  });

  it("week 12 is the last, and has Friday 30 October's tutorial", async () => {
    const html = await week("2026-10-26");
    expect(html).toMatch(/<h2 id="week-h"[^>]*>\s*Week 12/);
    expect(on(html, "COMP3900-TutA-07")).toBe(true);
    expect(html).toContain('data-step="next" data-edge'); // nothing after week 12
  });

  it("ignores a week that isn't a semester Monday", async () => {
    const res = await fetch(new URL("/?view=week&week=2027-01-04", baseUrl));
    expect(res.status).toBe(200);
  });
});

describe("core flow: choosing a tutorial time persists", () => {
  const group = "PHIL1005-TutA";

  it("starts on the real allocations, nothing left to choose", async () => {
    const html = await page("/allocate/");
    expect(html).toContain(`data-group="${group}" data-status="allocated"`);
    expect(html).not.toContain('data-status="unallocated"');
    expect(await page("/activities/PHIL1005-TutA-07/")).toContain("Your allocated time");
  });

  it("accepts a change and sends the browser back to the timetable", async () => {
    const res = await post("/api/allocations", { group, activity: "PHIL1005-TutA-05" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("done=PHIL1005-TutA-05");
  });

  it("shows it after a fresh, independent page load", async () => {
    expect(await page("/activities/PHIL1005-TutA-05/")).toContain("Your allocated time");
    expect(await page("/activities/PHIL1005-TutA-07/")).toContain("Another option in this group");
    expect(await page("/allocate/")).toContain('href="/activities/PHIL1005-TutA-05/"');
  });

  it("puts it in the calendar feed, and the real Monday dates skip 5 October", async () => {
    const res = await fetch(new URL("/calendar.ics", baseUrl));
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain("PHIL1005-TutA-05-1@timetable-sorted");
    // PHIL1005 LecA's third range starts Mon 12 Oct; the second ends 28 Sep
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20261012T120000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260928T235959Z");
  });

  it("wait-lists a full activity without dropping the seat already held", async () => {
    // COMP4020-TutA-03 is sample data with no seats; the student holds TutA-02
    const res = await post("/api/allocations", { group: "COMP4020-TutA", activity: "COMP4020-TutA-03" });
    expect(res.headers.get("location")).toContain("waitlisted=COMP4020-TutA-03");
    expect(await page("/activities/COMP4020-TutA-02/")).toContain("Your allocated time");
    expect(await page("/activities/COMP4020-TutA-03/")).toContain("on the wait list");
    expect(await page("/?view=week")).toMatch(/data-count="pending"><strong>1<\/strong>/);
  });

  it("refuses a read-only group and an activity from another group", async () => {
    expect((await post("/api/allocations", { group: "COMP3900-LecA", activity: "COMP3900-LecA-01" })).status).toBe(403);
    expect((await post("/api/allocations", { group: "PHIL1005-TutA", activity: "COMP3900-TutA-07" })).status).toBe(400);
    expect(await page("/activities/PHIL1005-TutA-05/")).toContain("Your allocated time");
  });

  it("warns of a clash before you choose it", async () => {
    // PHIL1005 TutA/02 (sample, Mon 2-3pm) overlaps the real COMP3900 LecA (Mon 1-3pm)
    const html = await page("/courses/PHIL1005/");
    expect(html).toMatch(/data-activity="PHIL1005-TutA-02"[\s\S]*?Clashes with[\s\S]*?COMP3900 LecA/);
  });
});

describe("course summaries: one click to Programs and Courses", () => {
  // the four URLs the student gave, as literals
  const SUMMARY = {
    PHIL1005: "https://programsandcourses.anu.edu.au/course/PHIL1005",
    COMP4020: "https://programsandcourses.anu.edu.au/course/COMP4020",
    COMP3900: "https://programsandcourses.anu.edu.au/course/COMP3900",
    COMP3500: "https://programsandcourses.anu.edu.au/course/COMP3500",
  };
  const link = (url: string) => new RegExp(`href="${url}"[^>]*target="_blank"[^>]*rel="noopener"`);

  it("lists all four in the quick-access panel", async () => {
    const home = await page("/");
    for (const url of Object.values(SUMMARY)) expect(home).toMatch(link(url));
  });

  it("links each details page and course page to its own course's summary", async () => {
    const details = { PHIL1005: "PHIL1005-LecA-01", COMP4020: "COMP4020-LecA-01", COMP3900: "COMP3900-TutA-07", COMP3500: "COMP3500-LecA-01" };
    for (const [code, url] of Object.entries(SUMMARY)) {
      const d = await page(`/activities/${details[code as keyof typeof details]}/`);
      expect(d).toMatch(link(url));
      for (const other of Object.values(SUMMARY)) if (other !== url) expect(d).not.toContain(`href="${other}"`);
      expect(await page(`/courses/${code}/`)).toMatch(link(url));
    }
    const overview = await page("/allocate/");
    for (const url of Object.values(SUMMARY)) expect(overview).toMatch(link(url));
  });

  it("says it opens a new tab, in the link text", async () => {
    expect(await page("/activities/PHIL1005-LecA-01/")).toContain("opens in a new tab");
  });
});

describe("where: each real class shows its building on a map", () => {
  // lat/long and room pages as ANU's campus map gives them (23 Sep 2026)
  const WHERE = [
    { id: "PHIL1005-LecA-01", building: "153", marker: "-35.276928,149.121926", anu: "https://www.anu.edu.au/maps/lowitja-odonoghue-cultural-centre/cultural-centre-manning-clark-hall-104" },
    { id: "COMP3900-LecA-01", building: "153", marker: "-35.276928,149.121926", anu: "https://www.anu.edu.au/maps/lowitja-odonoghue-cultural-centre/cultural-centre-cinema-102" },
    { id: "COMP4020-TutA-02", building: "155", marker: "-35.277786,149.120685", anu: "https://www.anu.edu.au/maps/marie-reay-teaching-centre/marie-reay-403" },
    { id: "PHIL1005-TutA-07", building: "24", marker: "-35.277985,149.123419", anu: "https://www.anu.edu.au/maps/copland-building/copland-g39" },
    { id: "COMP4020-LecA-01", building: "95", marker: "-35.273661,149.120763", anu: "https://www.anu.edu.au/maps/fulton-muir-building" },
    { id: "COMP3900-TutA-07", building: "95", marker: "-35.273661,149.120763", anu: "https://www.anu.edu.au/maps/fulton-muir-building" },
  ];
  for (const w of WHERE) {
    it(`${w.id}: building ${w.building}`, async () => {
      const html = await page(`/activities/${w.id}/`);
      expect(html).toContain(`data-building="${w.building}"`);
      expect(html).toMatch(new RegExp(`<iframe[^>]*title="Map: [^"]+"[^>]*src="https://www\\.openstreetmap\\.org/export/embed\\.html\\?[^"]*marker=${w.marker}"`));
      expect(html).toContain(`href="${w.anu}"`);
      expect(html).toContain(`destination=${w.marker}`);
    });
  }

  it("shows one map for a tutorial and its drop-in in the same room", async () => {
    expect((await page("/activities/COMP3900-TutA-07/")).match(/<iframe/g)).toHaveLength(1);
  });

  it("shows no map for sample data", async () => {
    const html = await page("/activities/COMP3500-LecA-01/");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("no real room");
  });
});

describe("the real ANU calendar: Semester 2, 2026", () => {
  it("lists every official Semester 2 date, with its source", async () => {
    const html = await page("/dates/");
    for (const title of [
      "Semester 2 begins",
      "Last day to add Semester 2 courses",
      "Semester 2 census date",
      "Teaching break",
      "Labour Day public holiday",
      "Last day to drop Semester 2 courses without failure",
      "Semester 2 ends",
      "Semester 2 examination period",
      "Results from Semester 2 published",
    ]) expect(html).toContain(title);
    expect(html).toContain('href="https://www.anu.edu.au/directories/university-calendar?year=2026"');
  });

  it("names the current period on the timetable, and shows upcoming ANU dates", async () => {
    const html = await page("/");
    expect(html).toMatch(/data-period>[^<]+</);
    expect(html).toContain('href="/dates/"');
  });

  it("leaves Labour Day out of a Monday sample class and the calendar feed", async () => {
    // COMP3500 LecA is sample data on Mondays 10-12 across every teaching week
    const details = await page("/activities/COMP3500-LecA-01/");
    expect(details).not.toContain("Mon, 5 Oct");
    expect(details).toContain("Mon, 12 Oct");
    expect(await page("/calendar.ics")).toContain("EXDATE;TZID=Australia/Sydney:20261005T100000");
  });
});

describe("quick access: the saved home view persists", () => {
  it("opens to the week by default, and to Today once saved", async () => {
    expect(await page("/")).toContain('data-view="week"');
    const res = await post("/api/preferences", { homeView: "today" });
    expect(res.status).toBe(303);
    expect(await page("/")).toContain('data-view="today"');
    await post("/api/preferences", { homeView: "week" });
    expect(await page("/")).toContain('data-view="week"');
  });

  it("serves an installable manifest", async () => {
    const res = await fetch(new URL("/manifest.webmanifest", baseUrl));
    const manifest = await res.json();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(await page("/")).toContain('rel="manifest"');
  });
});

describe("planner: generates a fair schedule, and applying it persists", () => {
  const firstPlanIds = (html: string) => {
    const form = html.match(/<section[^>]*data-plan="0"[\s\S]*?<\/section>/)?.[0] ?? "";
    return [...form.matchAll(/name="activity" value="([^"]+)"/g)].map((m) => m[1]);
  };

  it("offers plans that name every group once", async () => {
    const html = await page("/planner/");
    expect(html).toContain('data-plan="0"');
    expect(html).toContain("How plans are ranked");
  });

  it("saves preferences so a reload still has them", async () => {
    expect((await post("/api/planner-prefs", { notBefore: "540", notAfter: "", freeDay: "5" })).status).toBe(303);
    const html = await page("/planner/");
    expect(html).toMatch(/<option value="540" selected/);
    expect(html).toMatch(/<option value="5" selected/);
  });

  it("applies a plan in one go, and a reload shows every choice", async () => {
    await post("/api/planner-prefs", { notBefore: "", notAfter: "", freeDay: "5" }); // keep Friday free
    const html = await page("/planner/");
    const ids = firstPlanIds(html);
    if (ids.length === 0) {
      // the fairest plan is already what's held: nothing to apply, and the page says so
      expect(html).toMatch(/data-plan="0"[\s\S]*?Your current times/);
      return;
    }
    const res = await post("/api/plan", Object.fromEntries([]) as Record<string, string>);
    expect(res.headers.get("location")).toContain("error=1"); // an empty plan is refused
    const body = new URLSearchParams(ids.map((id) => ["activity", id]));
    const applied = await fetch(new URL("/api/plan", baseUrl), { method: "POST", headers: { origin: baseUrl }, body, redirect: "manual" });
    expect(applied.status).toBe(303);
    expect(applied.headers.get("location")).toContain("planned=");
    for (const id of ids) expect(await page(`/activities/${id}/`)).toContain("Your allocated time");
  });

  it("is all or nothing: a plan with one impossible change changes nothing", async () => {
    const before = await page("/allocate/");
    // the current allocation for every group, read off the overview
    const held = Object.fromEntries(
      [...before.matchAll(/data-group="([^"]+)" data-status="allocated">[\s\S]*?href="\/activities\/([^"/]+)\/"/g)].map((m) => [m[1], m[2]]),
    );
    expect(Object.keys(held)).toHaveLength(8); // COMP3500 LecA; COMP3900 LecA, TutA; COMP4020 LecA, TutA; PHIL1005 LecA, LecB, TutA
    // one change that would work, one into a full class: must be refused whole
    held["PHIL1005-TutA"] = held["PHIL1005-TutA"] === "PHIL1005-TutA-05" ? "PHIL1005-TutA-07" : "PHIL1005-TutA-05";
    delete held["COMP4020-TutA"];
    // the impossible change goes LAST, after the good one has been written,
    // so only a real rollback leaves the page unchanged
    const ids = [...Object.values(held), "COMP4020-TutA-03"];
    expect(ids.indexOf("COMP4020-TutA-03")).toBeGreaterThan(ids.findIndex((id) => id.startsWith("PHIL1005-TutA")));
    const body = new URLSearchParams(ids.map((id) => ["activity", id]));
    const res = await fetch(new URL("/api/plan", baseUrl), { method: "POST", headers: { origin: baseUrl }, body, redirect: "manual" });
    expect(res.headers.get("location")).toContain("error=1");
    expect(await page("/allocate/")).toBe(before);
  });

  it("refuses an incomplete plan", async () => {
    const before = await page("/allocate/");
    const body = new URLSearchParams([["activity", "PHIL1005-TutA-05"]]);
    const res = await fetch(new URL("/api/plan", baseUrl), { method: "POST", headers: { origin: baseUrl }, body, redirect: "manual" });
    expect(res.headers.get("location")).toContain("error=1");
    expect(await page("/allocate/")).toBe(before);
  });
});

// Fixtures: literal expected answers, stated from outside the
// implementation, for the conventions everything else rests on.
describe("fixtures", () => {
  const h = (hours: number, minutes = 0) => hours * 60 + minutes;
  const MONDAYS = "27/7-31/8, 21/9-28/9, 12/10-26/10";

  it("clashes are half-open: back-to-back is fine, one minute of overlap is not", () => {
    expect(clashes({ day: 1, start: h(9), end: h(10) }, { day: 1, start: h(10), end: h(11) })).toBe(false);
    expect(clashes({ day: 1, start: h(9), end: h(10) + 1 }, { day: 1, start: h(10), end: h(11) })).toBe(true);
    expect(clashes({ day: 1, start: h(9), end: h(12) }, { day: 1, start: h(10), end: h(11) })).toBe(true);
    expect(clashes({ day: 1, start: h(9), end: h(10) }, { day: 2, start: h(9), end: h(10) })).toBe(false);
  });

  it("a clash needs a date both sessions run", () => {
    const a = { day: 1, start: h(9), end: h(10), dates: "27/7-31/8" };
    expect(clashesOnADate(a, { ...a, dates: "21/9-26/10" })).toBe(false);
    expect(clashesOnADate(a, { ...a, dates: "31/8-26/10" })).toBe(true);
  });

  it("reads MyTimetable's date ranges", () => {
    expect(parseDates(MONDAYS)).toEqual([
      { from: "2026-07-27", to: "2026-08-31" },
      { from: "2026-09-21", to: "2026-09-28" },
      { from: "2026-10-12", to: "2026-10-26" },
    ]);
    const lecture = { day: 1, start: h(12), end: h(13), dates: MONDAYS };
    expect(occursOn(lecture, "2026-09-28")).toBe(true);
    expect(occursOn(lecture, "2026-10-05")).toBe(false); // not in MyTT's dates
    expect(occursOn(lecture, "2026-09-07")).toBe(false); // teaching break
    expect(occursOn(lecture, "2026-09-29")).toBe(false); // a Tuesday
    expect(occurrences(lecture)).toHaveLength(11); // 6 + 2 + 3 Mondays
  });

  it("prints durations as MyTimetable does", () => {
    expect([30, 60, 90, 120].map(fmtDuration)).toEqual(["0.5 hr", "1 hr", "1.5 hrs", "2 hrs"]);
  });

  it("follows ANU's University Calendar 2026 (literal dates from its page)", () => {
    const on = (title: string) => KEY_DATES.find((d) => d.title === title);
    expect(on("Semester 2 begins")?.date).toBe("2026-07-27");
    expect(on("Semester 2 census date")?.date).toBe("2026-08-31");
    expect(on("Teaching break")).toMatchObject({ date: "2026-09-07", end: "2026-09-18" });
    expect(on("Last day to drop Semester 2 courses without failure")?.date).toBe("2026-10-09");
    expect(on("Semester 2 ends")?.date).toBe("2026-10-30");
    expect(on("Semester 2 examination period")).toMatchObject({ date: "2026-11-05", end: "2026-11-21" });
    expect(isPublicHoliday("2026-10-05")).toBe(true); // Labour Day
    expect(isTeachingDay("2026-10-05")).toBe(false);
    expect(isTeachingDay("2026-10-06")).toBe(true);
  });

  it("names the period a date falls in", () => {
    expect(periodOn("2026-07-21")).toBe("Orientation Week");
    expect(periodOn("2026-07-27")).toBe("Teaching week 1");
    expect(periodOn("2026-09-10")).toBe("Teaching break");
    expect(periodOn("2026-09-23")).toBe("Teaching week 7");
    expect(periodOn("2026-11-02")).toBe("Semester 2 has ended · exams begin 5 November");
    expect(periodOn("2026-11-10")).toBe("Examination period");
    expect(periodOn("2026-11-30")).toBe("Deferred examination period");
    expect(periodOn("2026-12-20")).toBe("After Semester 2");
  });

  it("never runs a class on a public holiday, even inside its date range", () => {
    const sample = { day: 1, start: h(10), end: h(12), dates: "27/7-4/9, 21/9-30/10" };
    expect(occursOn(sample, "2026-10-05")).toBe(false);
    expect(occursOn(sample, "2026-10-12")).toBe(true);
    expect(occurrences(sample)).toHaveLength(11); // 6 Mondays, then 6 less Labour Day
    const ics = toICS([{ ...sample, uid: "s@y", summary: "S", location: "L" }], new Date("2026-09-23T00:00:00Z"));
    expect(ics).toContain("EXDATE;TZID=Australia/Sydney:20261005T100000");
  });

  it("picks the week to show: asked for, else this week, clamped to the semester", () => {
    expect(semesterWeeks()).toHaveLength(14);
    expect(weekToShow("2026-09-23", null).monday).toBe("2026-09-21"); // a Wednesday
    expect(weekToShow("2026-09-26", null).monday).toBe("2026-09-28"); // a Saturday: next week
    expect(weekToShow("2026-07-01", null).monday).toBe("2026-07-27"); // before: week 1
    expect(weekToShow("2026-11-10", null).monday).toBe("2026-10-26"); // exams: week 12
    expect(weekToShow("2026-09-23", "2026-08-10").title).toBe("Week 3");
    expect(weekToShow("2026-09-23", "2026-09-14").title).toBe("Teaching break");
    expect(weekToShow("2026-09-23", "2026-08-11").monday).toBe("2026-09-21"); // not a Monday: ignored
  });

  it("numbers teaching weeks around the two-week break", () => {
    expect(teachingWeek("2026-07-27")).toBe(1);
    expect(teachingWeek("2026-09-04")).toBe(6);
    expect(teachingWeek("2026-09-10")).toBe(null);
    expect(teachingWeek("2026-09-21")).toBe(7);
    expect(teachingWeek("2026-09-28")).toBe(8);
    expect(teachingWeek("2026-10-30")).toBe(12);
  });

  it("finds the next class on the dates it actually runs", () => {
    const items = [
      { id: "mon", day: 1, start: h(12), end: h(13), dates: MONDAYS },
      { id: "wed", day: 3, start: h(13), end: h(14), dates: "29/7-2/9, 23/9-28/10" },
    ];
    // Wed 23 Sep 2026, 12:30 AEST is 02:30 UTC
    expect(nextClass(items, new Date("2026-09-23T02:30:00Z"))).toEqual({
      item: items[1],
      date: "2026-09-23",
      inProgress: false,
    });
    // Wed 23 Sep, 13:30: in progress
    expect(nextClass(items, new Date("2026-09-23T03:30:00Z"))?.inProgress).toBe(true);
    // Fri 4 Sep evening: the break is skipped, next is Mon 21 Sep
    expect(nextClass(items, new Date("2026-09-04T08:00:00Z"))?.date).toBe("2026-09-21");
    // Sat 3 Oct: Mon 5 Oct isn't in the Monday dates, so next is Wed 7 Oct
    expect(nextClass(items, new Date("2026-10-03T00:00:00Z"))?.date).toBe("2026-10-07");
  });

  describe("planner scoring, worked by hand", () => {
    const D = "27/7-30/10";
    const fixed = (id: string, day: number, start: number, end: number) => ({
      groupId: id, readOnly: true,
      options: [{ id, label: id, sessions: [{ day, start, end, dates: D }], seats: 10, held: true, sample: false }],
    });
    const opt = (id: string, day: number, start: number, end: number, seats = 10, held = false) =>
      ({ id, label: id, sessions: [{ day, start, end, dates: D }], seats, held, sample: false });
    // lectures Mon 9-11 and Tue 9-11; one tutorial to choose
    const groups = (options: ReturnType<typeof opt>[]): PlanGroup[] => [
      fixed("LecA", 1, h(9), h(11)),
      fixed("LecB", 2, h(9), h(11)),
      { groupId: "Tut", readOnly: false, options },
    ];
    const T1 = opt("T1", 1, h(11), h(12)); // Mon, straight after the lecture
    const T2 = opt("T2", 3, h(9), h(10)); // Wed
    const T3 = opt("T3", 1, h(10), h(11)); // clashes with Mon's lecture
    const T4 = opt("T4", 4, h(9), h(10), 0); // full

    it("prefers the evener week: Wed beats Mon (spread 54 vs 76 min, scores 2.04 vs 2.78)", () => {
      const [best, second] = plan(groups([T1, T2]));
      expect(best.choice.map((o) => o.id)).toEqual(["LecA", "LecB", "T2"]);
      expect([best.spreadMinutes, best.score]).toEqual([54, 2.04]);
      expect([second.spreadMinutes, second.score]).toEqual([76, 2.78]);
    });

    it("never offers a clash or a full class", () => {
      const ids = plan(groups([T1, T2, T3, T4]), undefined, 10).map((p) => p.choice[2].id);
      expect(ids.sort()).toEqual(["T1", "T2"]);
    });

    it("keeps a full class the student already holds", () => {
      const held = opt("T4", 4, h(9), h(10), 0, true);
      expect(plan(groups([held]), undefined, 10).map((p) => p.choice[2].id)).toEqual(["T4"]);
    });

    it("lets preferences outrank spread: no classes before 10am picks Mon (8.78 vs 11.04)", () => {
      const prefs = { notBefore: h(10), notAfter: null, freeDay: null };
      const [best, second] = plan(groups([T1, T2]), prefs);
      expect([best.choice[2].id, best.score, best.early]).toEqual(["T1", 8.78, 2]);
      expect([second.choice[2].id, second.score, second.early]).toEqual(["T2", 11.04, 3]);
    });

    it("keeps a free day free: Wednesday off picks Mon (2.85 vs 6.25)", () => {
      const [best, second] = plan(groups([T1, T2]), { notBefore: null, notAfter: null, freeDay: 3 });
      expect([best.choice[2].id, best.score]).toEqual(["T1", 2.85]);
      expect([second.choice[2].id, second.score, second.onFreeDay]).toEqual(["T2", 6.25, 1]);
    });

    it("counts gaps: Mon 9-10 then 12-1 is two hours of dead time", () => {
      const p = scorePlan([opt("a", 1, h(9), h(10)), opt("b", 1, h(12), h(13))], { notBefore: null, notAfter: null, freeDay: null });
      expect(p.gapMinutes).toBe(120);
    });

    it("returns no plan when every choice is impossible", () => {
      expect(plan(groups([T3, T4]))).toEqual([]);
    });
  });

  it("writes one weekly event per date range, in Canberra time", () => {
    const ics = toICS(
      [{ uid: "x@y", summary: "COMP4020 LecA", location: "Rm 2.02, Fulton Muir", day: 4, start: h(11), end: h(13), dates: "30/7-3/9, 24/9-29/10" }],
      new Date("2026-09-23T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20260730T110000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260903T235959Z");
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20260924T110000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261029T235959Z");
    expect(ics).toContain("LOCATION:Rm 2.02\\, Fulton Muir");
    expect(ics.split("BEGIN:VEVENT")).toHaveLength(3);
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });
});
