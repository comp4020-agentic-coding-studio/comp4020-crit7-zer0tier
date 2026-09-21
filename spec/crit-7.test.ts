import { beforeAll, describe, expect, inject, it } from "vitest";

// This week's own contract (crit 07 — "Build the ANU system you wish
// existed"): a room/space booking system. The published spec's one
// mechanically-checkable line is "the core flow persists across a reload —
// create something, and it's still there." This test drives that flow over
// HTTP against the running app, the same way spec/guestbook.test.ts checks
// the starter's plumbing.
//
// Route and field names below (`POST /api/bookings`, `room`/`start`) are a
// starting guess, not the contract — rename them to match whatever the
// booking form actually posts once it's built. What must stay true: a
// booking made through the real form is still visible after an independent
// page load, with no id or cookie carried between the POST and the GET.
const baseUrl = inject("baseUrl");

describe("room booking", () => {
  let room: string;
  let start: string;

  beforeAll(() => {
    room = `spec-room-${process.hrtime.bigint()}`;
    start = "2026-10-06T09:00";
  });

  const post = (path: string, body: URLSearchParams) =>
    fetch(new URL(path, baseUrl), {
      method: "POST",
      // Astro's CSRF check requires a same-origin Origin header; a browser
      // sends this automatically, a bare fetch doesn't.
      headers: { origin: baseUrl },
      body,
      redirect: "manual",
    });

  it("accepts a booking", async () => {
    const res = await post("/api/bookings", new URLSearchParams({ room, start }));
    expect([200, 303]).toContain(res.status);
  });

  it("persists the booking: a fresh, independent page load still shows it", async () => {
    const res = await fetch(baseUrl);
    expect(await res.text()).toContain(room);
  });
});
