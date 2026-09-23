// The planner: given the student's groups, find the fairest week.
//
// "Fair" here means fair to the student's week, stated as rules they can
// read on the page:
//   hard: no two classes clash on a date both run; no full activity
//         (unless it's the seat already held); read-only groups don't move
//   soft: an even spread of class time across Mon-Fri, little dead time
//         between classes on the same day, and the student's own
//         preferences (no classes before/after a time, a day kept free)
// Every combination of choosable options is scored; lower is better.
import { type Dated, clashesOnADate } from "./timetable";

export interface PlanOption {
  id: string;
  label: string; // "PHIL1005 TutA/07"
  sessions: Dated[];
  seats: number;
  held: boolean;
  sample: boolean;
}
export interface PlanGroup {
  groupId: string;
  readOnly: boolean;
  options: PlanOption[]; // for a read-only group: just the held one
}
export interface Prefs {
  notBefore: number | null; // minutes after midnight, e.g. 540 = 9am
  notAfter: number | null; // no class ending after this
  freeDay: number | null; // 1 = Monday ... 5 = Friday
}
export const NO_PREFS: Prefs = { notBefore: null, notAfter: null, freeDay: null };

// Weights, shown on the page so the ranking isn't a black box.
export const WEIGHTS = {
  spreadPerHour: 2, // per hour of standard deviation in daily class time
  gapPerHour: 1, // per hour of dead time between classes on a day
  early: 3, // per class starting before notBefore
  late: 3, // per class ending after notAfter
  freeDay: 4, // per class on the day kept free
  change: 0.25, // per group moved from its current time: a tie-breaker
};

export interface Plan {
  choice: PlanOption[]; // one per group, in group order
  score: number;
  dayMinutes: number[]; // Mon..Fri
  gapMinutes: number;
  spreadMinutes: number; // standard deviation of dayMinutes
  early: number;
  late: number;
  onFreeDay: number;
  changes: number;
  usesSample: boolean;
}

export function scorePlan(choice: PlanOption[], prefs: Prefs): Plan {
  const sessions = choice.flatMap((o) => o.sessions);
  const dayMinutes = [1, 2, 3, 4, 5].map((d) =>
    sessions.filter((s) => s.day === d).reduce((t, s) => t + s.end - s.start, 0),
  );
  let gapMinutes = 0;
  for (let d = 1; d <= 5; d++) {
    const day = sessions.filter((s) => s.day === d).sort((a, b) => a.start - b.start);
    let end = day[0]?.end ?? 0;
    for (const s of day.slice(1)) {
      if (s.start > end) gapMinutes += s.start - end;
      end = Math.max(end, s.end);
    }
  }
  // the spread is over the days the student means to attend
  const days = dayMinutes.filter((_, i) => i + 1 !== prefs.freeDay);
  const mean = days.reduce((a, b) => a + b, 0) / days.length;
  const spreadMinutes = Math.sqrt(days.reduce((a, m) => a + (m - mean) ** 2, 0) / days.length);
  const early = prefs.notBefore === null ? 0 : sessions.filter((s) => s.start < (prefs.notBefore as number)).length;
  const late = prefs.notAfter === null ? 0 : sessions.filter((s) => s.end > (prefs.notAfter as number)).length;
  const onFreeDay = prefs.freeDay === null ? 0 : sessions.filter((s) => s.day === prefs.freeDay).length;
  const changes = choice.filter((o) => !o.held).length;
  const score =
    (spreadMinutes / 60) * WEIGHTS.spreadPerHour +
    (gapMinutes / 60) * WEIGHTS.gapPerHour +
    early * WEIGHTS.early +
    late * WEIGHTS.late +
    onFreeDay * WEIGHTS.freeDay +
    changes * WEIGHTS.change;
  return {
    choice,
    score: Math.round(score * 100) / 100,
    dayMinutes,
    gapMinutes,
    spreadMinutes: Math.round(spreadMinutes),
    early,
    late,
    onFreeDay,
    changes,
    usesSample: choice.some((o) => o.sample),
  };
}

/** A usable option: has a seat (or is the one already held). */
const usable = (o: PlanOption) => o.held || o.seats > 0;

function clashFree(choice: PlanOption[]): boolean {
  const s = choice.flatMap((o) => o.sessions);
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (clashesOnADate(s[i], s[j])) return false;
  return true;
}

/** Every clash-free, seat-respecting plan, best first (ties: fewer changes, then option order). */
export function plan(groups: PlanGroup[], prefs: Prefs = NO_PREFS, limit = 3): Plan[] {
  const choices = groups.map((g) => (g.readOnly ? g.options.filter((o) => o.held) : g.options.filter(usable)));
  if (choices.some((c) => c.length === 0)) return [];
  const out: Plan[] = [];
  const walk = (i: number, picked: PlanOption[]) => {
    if (i === choices.length) {
      if (clashFree(picked)) out.push(scorePlan([...picked], prefs));
      return;
    }
    for (const o of choices[i]) walk(i + 1, [...picked, o]);
  };
  walk(0, []);
  return out.sort((a, b) => a.score - b.score || a.changes - b.changes).slice(0, limit);
}

/** The plan in words, so a reader can check the ranking. */
export function explain(p: Plan, prefs: Prefs): string[] {
  const hrs = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;
  const busiest = Math.max(...p.dayMinutes);
  const lines = [
    `${hrs(p.gapMinutes)} of gaps between classes`,
    `busiest day ${hrs(busiest)}; days vary by ${hrs(p.spreadMinutes)} (standard deviation)`,
  ];
  if (prefs.notBefore !== null) lines.push(p.early ? `${p.early} class${p.early > 1 ? "es" : ""} start too early` : "nothing starts too early");
  if (prefs.notAfter !== null) lines.push(p.late ? `${p.late} class${p.late > 1 ? "es" : ""} end too late` : "nothing ends too late");
  if (prefs.freeDay !== null) lines.push(p.onFreeDay ? `${p.onFreeDay} class${p.onFreeDay > 1 ? "es" : ""} on your free day` : "your free day stays free");
  lines.push(p.changes ? `${p.changes} change${p.changes > 1 ? "s" : ""} from your current times` : "no changes from your current times");
  return lines;
}
