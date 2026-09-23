import { describe, expect, inject, it } from "vitest";
import {
  clashes,
  isTeachingDay,
  nextClass,
  teachingWeek,
  toICS,
} from "../src/lib/timetable";

// This week's own contract (crit 07, "Build the ANU system you wish
// existed"): a rebuilt MyTimetable. The published spec's one mechanically
// checkable line is "the core flow persists across a reload: create
// something, and it's still there". Here the core flow is choosing a
// tutorial time, and the quick-access option is the home page's saved view.
// Both are driven over HTTP against the built server with a fresh database
// (spec/global-setup.ts); nothing is carried between the POST and the GET
// but the database.
//
// Not asserted here: layout. jsdom computes none, so a test of the week
// grid would pass on a visibly broken page. Layout, contrast and target
// sizes are checked in a real browser at 1920 and 390 instead.
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

describe("core flow: choosing a tutorial time persists", () => {
  const group = "COMP3900-TutA";
  const activity = "COMP3900-TutA-02";
  const onGrid = `data-activity="${activity}"`;

  it("starts with COMP3900 TutA still to choose, and not on the timetable", async () => {
    const html = await page("/?view=week");
    expect(html).toContain(`data-group="${group}" data-status="unallocated"`);
    expect(html).not.toContain(onGrid);
  });

  it("accepts the choice and sends the browser back to the timetable", async () => {
    const res = await post("/api/allocations", { group, activity });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`done=${activity}`);
  });

  it("shows it after a fresh, independent page load", async () => {
    const html = await page("/?view=week");
    expect(html).toContain(onGrid);
    expect(html).not.toContain(`data-group="${group}" data-status="unallocated"`);
    // and on the allocation overview, as allocated
    expect(await page("/allocate/")).toContain(`data-group="${group}" data-status="allocated"`);
  });

  it("puts it in the calendar feed", async () => {
    const res = await fetch(new URL("/calendar.ics", baseUrl));
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(await res.text()).toContain(`UID:${activity}@timetable-sorted`);
  });

  it("wait-lists a full activity without dropping the seat already held", async () => {
    // COMP4020-TutA-03 is seeded full; the student holds TutA-02
    const res = await post("/api/allocations", { group: "COMP4020-TutA", activity: "COMP4020-TutA-03" });
    expect(res.headers.get("location")).toContain("waitlisted=COMP4020-TutA-03");
    const html = await page("/?view=week");
    expect(html).toContain('data-activity="COMP4020-TutA-02"');
    expect(html).toMatch(/class="event[^"]*wait[^"]*"[^>]*data-activity="COMP4020-TutA-03"/);
    expect(html).toMatch(/data-count="pending"><strong>1<\/strong>/);
  });

  it("refuses a read-only group and an activity from another group", async () => {
    expect((await post("/api/allocations", { group: "COMP3900-LecA", activity: "COMP3900-LecA-01" })).status).toBe(403);
    expect((await post("/api/allocations", { group: "PHIL1005-TutA", activity: "COMP3900-TutA-01" })).status).toBe(400);
    expect(await page("/allocate/")).toContain('data-group="PHIL1005-TutA" data-status="unallocated"');
  });

  it("names a clash in words, not only by position on the grid", async () => {
    // PHIL1005 TutA/03 (Thu 1-2pm) overlaps the held COMP4020 TutA/02 (Thu 12-2pm)
    expect(await page("/?view=week")).not.toContain('class="clash-list"');
    await post("/api/allocations", { group: "PHIL1005-TutA", activity: "PHIL1005-TutA-03" });
    const html = await page("/?view=week");
    expect(html).toContain('class="clash-list"');
    expect(html).toMatch(/Clash:.*COMP4020 TutA\/02.*PHIL1005 TutA\/03/s);
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
  const h = (hours: number) => hours * 60;

  it("clashes are half-open: back-to-back is fine, one minute of overlap is not", () => {
    expect(clashes({ day: 1, start: h(9), end: h(10) }, { day: 1, start: h(10), end: h(11) })).toBe(false);
    expect(clashes({ day: 1, start: h(9), end: h(10) + 1 }, { day: 1, start: h(10), end: h(11) })).toBe(true);
    expect(clashes({ day: 1, start: h(9), end: h(12) }, { day: 1, start: h(10), end: h(11) })).toBe(true);
    expect(clashes({ day: 1, start: h(9), end: h(10) }, { day: 2, start: h(9), end: h(10) })).toBe(false);
  });

  it("numbers teaching weeks around the two-week break", () => {
    expect(teachingWeek("2026-07-27")).toBe(1);
    expect(teachingWeek("2026-09-04")).toBe(6);
    expect(teachingWeek("2026-09-10")).toBe(null);
    expect(teachingWeek("2026-09-21")).toBe(7);
    expect(teachingWeek("2026-09-28")).toBe(8);
    expect(teachingWeek("2026-10-30")).toBe(12);
    expect(isTeachingDay("2026-09-26")).toBe(false); // a Saturday
  });

  it("finds the next class in Canberra time, skipping the break", () => {
    const items = [
      { id: "mon", day: 1, start: h(10), end: h(12) },
      { id: "wed", day: 3, start: h(13), end: h(14) },
    ];
    // Wed 23 Sep 2026, 12:30 AEST is 02:30 UTC
    expect(nextClass(items, new Date("2026-09-23T02:30:00Z"))).toEqual({
      item: items[1],
      date: "2026-09-23",
      inProgress: false,
    });
    // Wed 23 Sep, 13:30: in progress
    expect(nextClass(items, new Date("2026-09-23T03:30:00Z"))?.inProgress).toBe(true);
    // Fri 4 Sep, after classes: the break is skipped, next is Mon 21 Sep
    expect(nextClass(items, new Date("2026-09-04T08:00:00Z"))?.date).toBe("2026-09-21");
  });

  it("writes a weekly event that skips the break, in Canberra time", () => {
    const ics = toICS(
      [{ uid: "x@y", summary: "COMP4020 TutA", location: "Studio, 3.02", day: 4, start: h(12), end: h(14) }],
      new Date("2026-09-23T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20260730T120000");
    expect(ics).toContain("DTEND;TZID=Australia/Sydney:20260730T140000");
    expect(ics).toContain("EXDATE;TZID=Australia/Sydney:20260910T120000,20260917T120000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261030T125900Z");
    expect(ics).toContain("LOCATION:Studio\\, 3.02");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });
});
