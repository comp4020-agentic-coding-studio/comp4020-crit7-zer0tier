// Pure timetable logic, no database: the clash rule, the semester calendar,
// "what's next", and the .ics feed. Kept apart from db.ts so spec/ can test
// it against literal expected answers.

import { KEY_DATES, isPublicHoliday } from "./anuCalendar";

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

// Semester 2, 2026, from ANU's official University Calendar 2026 (see
// anuCalendar.ts): begins 27 Jul, teaching break from 7 Sep with return
// 21 Sep, ends 30 Oct. The calendar doesn't number weeks; numbering the
// weeks either side of the break 1-6 and 7-12 is ANU's usual convention
// (the CBE Student Engagement Planner 2026 calls 21 Sep Week 7). Dates are
// ISO local (Canberra) calendar dates.
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

/** A weekday inside the semester, outside the break, and not a public holiday. */
export function isTeachingDay(date: string): boolean {
  return (
    date >= SEMESTER.firstDay &&
    date <= SEMESTER.lastDay &&
    !(date >= SEMESTER.breakFirst && date <= SEMESTER.breakLast) &&
    weekdayOf(date) <= 5 &&
    !isPublicHoliday(date)
  );
}

/** What part of ANU's year a date falls in, in the calendar's own terms. */
export function periodOn(date: string): string {
  const inRange = (title: string) => {
    const d = KEY_DATES.find((k) => k.title === title);
    return d ? date >= d.date && date <= (d.end ?? d.date) : false;
  };
  if (inRange("ANU Orientation Week")) return "Orientation Week";
  if (inRange("Teaching break")) return "Teaching break";
  const week = teachingWeek(date);
  if (week) return `Teaching week ${week}`;
  if (inRange("Semester 2 examination period")) return "Examination period";
  if (inRange("Semester 2 deferred examination period")) return "Deferred examination period";
  if (date > SEMESTER.lastDay && date < "2026-11-05") return "Semester 2 has ended · exams begin 5 November";
  return date < SEMESTER.firstDay ? "Before Semester 2" : "After Semester 2";
}

/** Teaching week number for a date, or null outside teaching weeks. */
export function teachingWeek(date: string): number | null {
  if (date < SEMESTER.firstDay || date > SEMESTER.lastDay) return null;
  if (date >= SEMESTER.breakFirst && date <= SEMESTER.breakLast) return null;
  const days = (Date.parse(date) - Date.parse(SEMESTER.firstDay)) / 86_400_000;
  const week = Math.floor(days / 7) + 1;
  return date > SEMESTER.breakLast ? week - 2 : week;
}

// --- MyTimetable's date ranges ------------------------------------------

export interface Dated extends Slot {
  dates: string; // "27/7-31/8, 21/9-28/9, 12/10-26/10" (d/m, this semester's year)
}

const YEAR = SEMESTER.firstDay.slice(0, 4);
const iso = (dm: string) => {
  const [d, m] = dm.trim().split("/");
  return `${YEAR}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

/** "27/7-31/8, 21/9-28/9" -> [{from:"2026-07-27",to:"2026-08-31"}, ...]; a lone "5/10" is one day. */
export function parseDates(dates: string): { from: string; to: string }[] {
  return dates
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [a, b] = r.split("-");
      return { from: iso(a), to: iso(b ?? a) };
    });
}

/** Whether a session runs on a date: its weekday, inside one of its ranges, not a public holiday. */
export function occursOn(s: Dated, date: string): boolean {
  return (
    weekdayOf(date) === s.day &&
    !isPublicHoliday(date) &&
    parseDates(s.dates).some((r) => date >= r.from && date <= r.to)
  );
}

/** Every date a session runs, in order. */
export function occurrences(s: Dated): string[] {
  const out: string[] = [];
  for (const r of parseDates(s.dates)) {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) if (weekdayOf(d) === s.day && !isPublicHoliday(d)) out.push(d);
  }
  return out;
}

/** 90 -> "1.5 hrs", 60 -> "1 hr", 30 -> "0.5 hr" — MyTT's own wording. */
export function fmtDuration(minutes: number): string {
  const h = minutes / 60;
  return `${h} ${h > 1 ? "hrs" : "hr"}`;
}

/** 930 -> "15:30", as MyTT prints times. */
export function fmt24(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export interface Upcoming<T extends Dated> {
  item: T;
  date: string; // Canberra local date of the occurrence
  inProgress: boolean;
}

/** The next class that hasn't finished yet, from `now`, on the dates it actually runs. */
export function nextClass<T extends Dated>(items: T[], now: Date): Upcoming<T> | null {
  const here = canberraNow(now);
  for (let offset = 0; offset < 120; offset++) {
    const date = addDays(here.date, offset);
    if (date > SEMESTER.lastDay) return null;
    const todays = items
      .filter((i) => occursOn(i, date) && (offset > 0 || i.end > here.minutes))
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

export interface CalendarEntry extends Dated {
  uid: string;
  summary: string;
  location: string;
  description?: string;
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

/** Public holidays that would otherwise fall inside a weekly range. */
function exdates(e: Dated, r: { from: string; to: string }): string[] {
  const hit = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) if (weekdayOf(d) === e.day && isPublicHoliday(d)) hit.push(d);
  return hit.length ? [`EXDATE;TZID=${TZ}:${hit.map((d) => `${compact(d)}T${hhmm(e.start)}`).join(",")}`] : [];
}

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
    // one weekly event per MyTT date range, so breaks and holidays that
    // MyTT leaves out stay out
    parseDates(e.dates).forEach((r, i) => {
      let first = r.from;
      while (weekdayOf(first) !== e.day && first < r.to) first = addDays(first, 1);
      if (weekdayOf(first) !== e.day) return;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${i}-${e.uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${TZ}:${compact(first)}T${hhmm(e.start)}`,
        `DTEND;TZID=${TZ}:${compact(first)}T${hhmm(e.end)}`,
        // UNTIL is UTC; 23:59:59Z on the last day is still before the
        // following week's class, so the last day is included and no more
        `RRULE:FREQ=WEEKLY;UNTIL=${compact(r.to)}T235959Z`,
        ...exdates(e, r),
        `SUMMARY:${escapeText(e.summary)}`,
        `LOCATION:${escapeText(e.location)}`,
        ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
        "END:VEVENT",
      );
    });
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** An activity's parts in one line: "Fri 9am–10:30am + Fri 10:30am–11am". */
export function fmtSlots(slots: Slot[]): string {
  return slots.map(fmtSlot).join(" + ");
}

/** Two sessions really clash only if they overlap in time on a date both run. */
export function clashesOnADate(a: Dated, b: Dated): boolean {
  if (!clashes(a, b)) return false;
  return parseDates(a.dates).some((x) => parseDates(b.dates).some((y) => x.from <= y.to && y.from <= x.to));
}

/**
 * MyTT locations are "<room>_<building> Bldg <n>". The grid only has room
 * for enough to find it; the details page shows it all. A bare room number
 * keeps its building number ("Rm G39_Copland Bldg 24" -> "Rm G39, Bldg 24");
 * a named room is distinctive alone ("Cinema Rm 1.02_..." -> "Cinema Rm 1.02").
 */
export function shortLocation(location: string): string {
  const [room, building] = location.split("_");
  const n = building?.match(/Bldg (\w+)/)?.[1];
  return n && /^Rm\b/.test(room) ? `${room}, Bldg ${n}` : room;
}
