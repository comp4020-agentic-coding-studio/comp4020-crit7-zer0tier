// Pure timetable logic, no database: the clash rule, the semester calendar,
// "what's next", and the .ics feed. Kept apart from db.ts so spec/ can test
// it against literal expected answers.

export interface Slot {
  day: number; // 1 = Monday ... 5 = Friday
  start: number; // minutes after midnight, Canberra time
  end: number; // exclusive
}

/** Half-open [start, end): back-to-back classes (9-10, 10-11) do not clash. */
export function clashes(a: Slot, b: Slot): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function fmtSlot(s: Slot): string {
  return `${DAYS[s.day - 1]} ${fmtTime(s.start)}–${fmtTime(s.end)}`;
}

// Semester 2, 2026. Class dates are from Programs and Courses (27 Jul - 30
// Oct 2026 for all four courses modelled); the two-week teaching break,
// 7-18 Sep, is from the ANU CBE Student Engagement Planner 2026, which
// numbers 21 Sep as Week 7. Dates are ISO local (Canberra) calendar dates.
export const SEMESTER = {
  name: "Semester 2, 2026",
  firstDay: "2026-07-27",
  lastDay: "2026-10-30",
  breakFirst: "2026-09-07",
  breakLast: "2026-09-18",
} as const;

export const TZ = "Australia/Sydney"; // Canberra keeps Sydney time

/** Canberra local date (YYYY-MM-DD), weekday (1=Mon..7=Sun) and minutes for an instant. */
export function canberraNow(now: Date): { date: string; weekday: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    weekday: weekdayOf(date),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return d === 0 ? 7 : d;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A weekday inside the semester and outside the break. */
export function isTeachingDay(date: string): boolean {
  return (
    date >= SEMESTER.firstDay &&
    date <= SEMESTER.lastDay &&
    !(date >= SEMESTER.breakFirst && date <= SEMESTER.breakLast) &&
    weekdayOf(date) <= 5
  );
}

/** Teaching week number for a date, or null outside teaching weeks. */
export function teachingWeek(date: string): number | null {
  if (date < SEMESTER.firstDay || date > SEMESTER.lastDay) return null;
  if (date >= SEMESTER.breakFirst && date <= SEMESTER.breakLast) return null;
  const days = (Date.parse(date) - Date.parse(SEMESTER.firstDay)) / 86_400_000;
  const week = Math.floor(days / 7) + 1;
  return date > SEMESTER.breakLast ? week - 2 : week;
}

export interface Upcoming<T extends Slot> {
  item: T;
  date: string; // Canberra local date of the occurrence
  inProgress: boolean;
}

/** The next class that hasn't finished yet, from `now`, within the semester. */
export function nextClass<T extends Slot>(items: T[], now: Date): Upcoming<T> | null {
  const here = canberraNow(now);
  for (let offset = 0; offset < 120; offset++) {
    const date = addDays(here.date, offset);
    if (date > SEMESTER.lastDay) return null;
    if (!isTeachingDay(date)) continue;
    const day = weekdayOf(date);
    const todays = items
      .filter((i) => i.day === day && (offset > 0 || i.end > here.minutes))
      .sort((a, b) => a.start - b.start);
    if (todays[0]) {
      return {
        item: todays[0],
        date,
        inProgress: offset === 0 && todays[0].start <= here.minutes,
      };
    }
  }
  return null;
}

// --- iCalendar feed ------------------------------------------------------

export interface CalendarEntry extends Slot {
  uid: string;
  summary: string;
  location: string;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:STANDARD",
  "DTSTART:19700405T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
  "TZOFFSETFROM:+1100",
  "TZOFFSETTO:+1000",
  "TZNAME:AEST",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19701004T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
  "TZOFFSETFROM:+1000",
  "TZOFFSETTO:+1100",
  "TZNAME:AEDT",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

const escapeText = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** RFC 5545 folding: lines over 75 octets continue on a line starting with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > (out.length ? 74 : 75)) cut--;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n ");
}

const compact = (date: string) => date.replaceAll("-", "");
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;

export function toICS(entries: CalendarEntry[], stamp: Date): string {
  const dtstamp = `${stamp.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mytt-rebuilt//timetable//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:My timetable",
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE,
  ];
  for (const e of entries) {
    const first = addDays(SEMESTER.firstDay, e.day - 1);
    const breakDates = [0, 7].map((w) =>
      compact(addDays(SEMESTER.breakFirst, w + e.day - 1)),
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${TZ}:${compact(first)}T${hhmm(e.start)}`,
      `DTEND;TZID=${TZ}:${compact(first)}T${hhmm(e.end)}`,
      // last day 30 Oct, 23:59 AEDT (+11) is 12:59 UTC
      `RRULE:FREQ=WEEKLY;UNTIL=${compact(SEMESTER.lastDay)}T125900Z`,
      `EXDATE;TZID=${TZ}:${breakDates.map((d) => `${d}T${hhmm(e.start)}`).join(",")}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `LOCATION:${escapeText(e.location)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
