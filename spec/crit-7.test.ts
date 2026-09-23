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
