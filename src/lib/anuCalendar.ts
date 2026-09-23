// ANU's official University Calendar 2026, Semester 2 and around it:
// https://www.anu.edu.au/directories/university-calendar?year=2026
// (read 23 Sep 2026). Titles are ANU's own wording. Where the calendar
// gives a start and an end as separate entries (teaching break, exams),
// they're joined into one range; the teaching break's last day is the
// Friday before "Return from teaching break" (Mon 21 Sep).
export const CALENDAR_SOURCE = "https://www.anu.edu.au/directories/university-calendar?year=2026";

export type DateKind = "term" | "deadline" | "holiday" | "exam";
export interface KeyDate {
  date: string; // ISO, Canberra
  end?: string; // inclusive, for ranges
  title: string;
  kind: DateKind;
}

export const KEY_DATES: KeyDate[] = [
  { date: "2026-07-20", end: "2026-07-24", title: "ANU Orientation Week", kind: "term" },
  { date: "2026-07-27", title: "Semester 2 begins", kind: "term" },
  { date: "2026-08-03", title: "Last day to add Semester 2 courses", kind: "deadline" },
  { date: "2026-08-14", title: "Due date for payment of tuition fees and up-front HECS for Semester 2", kind: "deadline" },
  { date: "2026-08-31", title: "Semester 2 census date", kind: "deadline" },
  { date: "2026-09-07", end: "2026-09-18", title: "Teaching break", kind: "term" },
  { date: "2026-09-21", title: "Return from teaching break", kind: "term" },
  { date: "2026-10-05", title: "Labour Day public holiday", kind: "holiday" },
  { date: "2026-10-09", title: "Last day to drop Semester 2 courses without failure", kind: "deadline" },
  { date: "2026-10-30", title: "Semester 2 ends", kind: "term" },
  { date: "2026-10-30", title: "Last day to drop Semester 2 courses with failure", kind: "deadline" },
  { date: "2026-11-05", end: "2026-11-21", title: "Semester 2 examination period", kind: "exam" },
  { date: "2026-11-23", end: "2026-12-04", title: "Semester 2 deferred examination period", kind: "exam" },
  { date: "2026-12-09", title: "Results from Semester 2 published", kind: "term" },
];

/** ACT public holidays in Semester 2, from the same calendar. */
export const PUBLIC_HOLIDAYS = KEY_DATES.filter((d) => d.kind === "holiday").map((d) => d.date);

export function isPublicHoliday(date: string): boolean {
  return PUBLIC_HOLIDAYS.includes(date);
}

export function holidayOn(date: string): KeyDate | undefined {
  return KEY_DATES.find((d) => d.kind === "holiday" && d.date === date);
}

/** Dates that haven't finished yet (a range counts until its last day), in order. */
export function upcoming(today: string): KeyDate[] {
  return KEY_DATES.filter((d) => (d.end ?? d.date) >= today);
}
