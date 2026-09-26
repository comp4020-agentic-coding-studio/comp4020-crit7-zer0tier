import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { asc, eq, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type Activity,
  type ActivityGroup,
  type Course,
  type Session,
  activities,
  activityGroups,
  allocations,
  courses,
  preferences,
  sessions,
  waitlist,
} from "./schema";
import { NO_PREFS, type PlanGroup, type Prefs } from "./planner";
import { seedRows } from "./seed";
import { clashesOnADate } from "./timetable";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// The catalogue (courses, groups, activities, sessions) is code: synced
// from seed.ts on every boot, so a corrected room or time reaches the
// deployed volume with the next deploy. The student's choices
// (allocations, wait list, preferences) are state and are never
// overwritten — except once per SEED_VERSION, which moves a database
// created from older sample data onto the real allocations.
const SEED_VERSION = "2";
function syncCatalogue(): void {
  const rows = seedRows();
  db.transaction((tx) => {
    for (const c of rows.courses) {
      tx.insert(courses).values(c).onConflictDoUpdate({ target: courses.code, set: c }).run();
    }
    for (const g of rows.groups) {
      tx.insert(activityGroups).values(g).onConflictDoUpdate({ target: activityGroups.id, set: g }).run();
    }
    for (const a of rows.activities) {
      tx.insert(activities).values(a).onConflictDoUpdate({ target: activities.id, set: a }).run();
    }
    for (const s of rows.sessions) {
      tx.insert(sessions).values(s).onConflictDoUpdate({ target: sessions.id, set: s }).run();
    }
    // drop what the catalogue no longer has, and any choice that pointed at it
    const activityIds = rows.activities.map((a) => a.id);
    tx.delete(sessions).where(notInArray(sessions.id, rows.sessions.map((s) => s.id))).run();
    tx.delete(allocations).where(notInArray(allocations.activityId, activityIds)).run();
    tx.delete(waitlist).where(notInArray(waitlist.activityId, activityIds)).run();
    tx.delete(activities).where(notInArray(activities.id, activityIds)).run();

    const version = tx.select().from(preferences).where(eq(preferences.key, "seedVersion")).get();
    if (version?.value !== SEED_VERSION) {
      tx.delete(waitlist).run();
      tx.delete(allocations).run();
      for (const a of rows.allocations) tx.insert(allocations).values(a).run();
      tx.insert(preferences)
        .values({ key: "seedVersion", value: SEED_VERSION })
        .onConflictDoUpdate({ target: preferences.key, set: { value: SEED_VERSION } })
        .run();
    }
  });
}
syncCatalogue();

export type { Activity, ActivityGroup, Course, Session };

export type Status = "allocated" | "pending" | "unallocated";

/** An activity with its sessions (parts), in part order. */
export interface ActivityView extends Activity {
  sessions: Session[];
  seats: number; // the fewest seats left across its parts
}

export interface GroupView {
  group: ActivityGroup;
  course: Course;
  options: ActivityView[];
  chosen: ActivityView | undefined; // allocated activity
  waiting: ActivityView | undefined; // wait-listed activity
  status: Status;
}

/**
 * A fingerprint of the student's choices (allocations and wait list). The
 * home page renders it, and the event stream sends it on every connect, so
 * a tab that closed its stream while hidden still learns on reconnect that
 * something changed meanwhile. Read from the database, not a counter in
 * memory, so it survives the machine stopping in between.
 */
export function timetableVersion(): string {
  const allocs = db.select({ g: allocations.groupId, a: allocations.activityId }).from(allocations).orderBy(asc(allocations.groupId)).all();
  const waits = db.select({ g: waitlist.groupId, a: waitlist.activityId }).from(waitlist).orderBy(asc(waitlist.groupId)).all();
  return createHash("sha256").update(JSON.stringify([allocs, waits])).digest("hex").slice(0, 12);
}

/** Every group with its options and current allocation, in course order. */
export function listGroups(): GroupView[] {
  const byCode = new Map(listCourses().map((c) => [c.code, c]));
  const groups = db.select().from(activityGroups).orderBy(asc(activityGroups.id)).all();
  const allSessions = db.select().from(sessions).orderBy(asc(sessions.id)).all();
  const acts: ActivityView[] = db
    .select()
    .from(activities)
    .all()
    .map((a) => {
      const parts = allSessions.filter((s) => s.activityId === a.id);
      return { ...a, sessions: parts, seats: Math.min(...parts.map((s) => s.seats)) };
    })
    .sort((a, b) => a.sessions[0].day - b.sessions[0].day || a.sessions[0].start - b.sessions[0].start);
  const allocs = new Map(db.select().from(allocations).all().map((a) => [a.groupId, a.activityId]));
  const waits = new Map(db.select().from(waitlist).all().map((w) => [w.groupId, w.activityId]));
  return groups.map((group) => {
    const options = acts.filter((a) => a.groupId === group.id);
    const chosen = options.find((a) => a.id === allocs.get(group.id));
    const waiting = options.find((a) => a.id === waits.get(group.id));
    const status: Status = chosen ? "allocated" : waiting ? "pending" : "unallocated";
    return { group, course: byCode.get(group.courseCode) as Course, options, chosen, waiting, status };
  });
}

export function listCourses(): Course[] {
  return db.select().from(courses).orderBy(asc(courses.code)).all();
}

export function getCourse(code: string): Course | undefined {
  return db.select().from(courses).where(eq(courses.code, code)).get();
}

/** The group view holding an activity, for the details page. */
export function findActivity(activityId: string): { view: GroupView; activity: ActivityView } | undefined {
  for (const view of listGroups()) {
    const activity = view.options.find((a) => a.id === activityId);
    if (activity) return { view, activity };
  }
  return undefined;
}

/** The other groups whose allocated activity clashes with `a` on a date both run. */
export function clashesFor(a: ActivityView, views: GroupView[]): GroupView[] {
  return views.filter(
    (v) =>
      v.group.id !== a.groupId &&
      v.chosen?.sessions.some((mine) => a.sessions.some((theirs) => clashesOnADate(mine, theirs))),
  );
}

export type AllocateResult =
  | { ok: true; outcome: "allocated" | "waitlisted" | "unchanged"; activity: Activity }
  | { ok: false; code: 400 | 403 | 404; reason: string };

/**
 * Allocate the student to `activityId` in `groupId`. An activity with no
 * seats left (in any of its parts) puts them on its wait list instead,
 * keeping any seat they already hold. Read-only groups refuse, as MyTT
 * does. Clashes are warned about on the page, not refused: MyTT lets
 * clashing activities be allocated too.
 */
export function allocate(groupId: string, activityId: string): AllocateResult {
  const group = db.select().from(activityGroups).where(eq(activityGroups.id, groupId)).get();
  if (!group) return { ok: false, code: 404, reason: "No such activity group." };
  if (group.readOnly) return { ok: false, code: 403, reason: `${group.label} is read only.` };
  const activity = db.select().from(activities).where(eq(activities.id, activityId)).get();
  if (!activity || activity.groupId !== groupId) {
    return { ok: false, code: 400, reason: "That activity isn't in this group." };
  }
  const current = db.select().from(allocations).where(eq(allocations.groupId, groupId)).get();
  if (current?.activityId === activity.id) return { ok: true, outcome: "unchanged", activity };
  const parts = db.select().from(sessions).where(eq(sessions.activityId, activityId)).all();
  const full = parts.some((p) => p.seats <= 0);

  return db.transaction((tx) => {
    tx.delete(waitlist).where(eq(waitlist.groupId, groupId)).run();
    if (full) {
      tx.insert(waitlist).values({ groupId, activityId }).run();
      return { ok: true as const, outcome: "waitlisted" as const, activity };
    }
    tx.insert(allocations)
      .values({ groupId, activityId })
      .onConflictDoUpdate({
        target: allocations.groupId,
        set: { activityId, updatedAt: new Date().toISOString() },
      })
      .run();
    return { ok: true as const, outcome: "allocated" as const, activity };
  });
}

export function leaveWaitlist(groupId: string): void {
  db.delete(waitlist).where(eq(waitlist.groupId, groupId)).run();
}

export type HomeView = "week" | "today";
export const HOME_VIEWS: HomeView[] = ["week", "today"];

export function getHomeView(): HomeView {
  const row = db.select().from(preferences).where(eq(preferences.key, "homeView")).get();
  return row?.value === "today" ? "today" : "week";
}

export function setHomeView(view: HomeView): void {
  db.insert(preferences)
    .values({ key: "homeView", value: view })
    .onConflictDoUpdate({ target: preferences.key, set: { value: view } })
    .run();
}

// --- planner ---------------------------------------------------------------


/** The student's groups in the planner's terms. */
export function plannerGroups(): PlanGroup[] {
  return listGroups().map((g) => ({
    groupId: g.group.id,
    readOnly: g.group.readOnly,
    options: g.options.map((a) => ({
      id: a.id,
      label: `${g.course.code} ${g.group.label}/${a.number}`,
      sessions: a.sessions,
      seats: a.seats,
      held: g.chosen?.id === a.id,
      sample: a.source === "illustrative",
    })),
  }));
}

export function getPlannerPrefs(): Prefs {
  const row = db.select().from(preferences).where(eq(preferences.key, "plannerPrefs")).get();
  if (!row) return NO_PREFS;
  try {
    const p = JSON.parse(row.value);
    const num = (v: unknown, lo: number, hi: number) =>
      typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
    return { notBefore: num(p.notBefore, 0, 1440), notAfter: num(p.notAfter, 0, 1440), freeDay: num(p.freeDay, 1, 5) };
  } catch {
    return NO_PREFS;
  }
}

export function setPlannerPrefs(p: Prefs): void {
  const value = JSON.stringify(p);
  db.insert(preferences)
    .values({ key: "plannerPrefs", value })
    .onConflictDoUpdate({ target: preferences.key, set: { value } })
    .run();
}

/** Apply a plan (one activity per group, every group): all of it, or none. */
export function applyPlan(activityIds: string[]): { ok: true; changed: number } | { ok: false; reason: string } {
  const acts = activityIds.map((id) => db.select().from(activities).where(eq(activities.id, id)).get());
  if (acts.some((a) => !a)) return { ok: false, reason: "That plan names an activity that doesn't exist." };
  const groupIds = acts.map((a) => (a as Activity).groupId);
  const allGroups = db.select().from(activityGroups).all().map((g) => g.id);
  // a plan is a whole week: exactly one activity for every group, no more, no fewer
  if (new Set(groupIds).size !== groupIds.length || groupIds.length !== allGroups.length) {
    return { ok: false, reason: "A plan has exactly one activity for every group." };
  }
  let changed = 0;
  try {
    db.transaction(() => {
      for (const a of acts as Activity[]) {
        const group = db.select().from(activityGroups).where(eq(activityGroups.id, a.groupId)).get();
        const held = db.select().from(allocations).where(eq(allocations.groupId, a.groupId)).get();
        if (group?.readOnly) {
          if (held?.activityId !== a.id) throw new Error(`${group.label} is read only.`);
          continue;
        }
        const r = allocate(a.groupId, a.id);
        if (!r.ok) throw new Error(r.reason);
        if (r.outcome === "waitlisted") throw new Error(`${a.id} is full.`);
        if (r.outcome === "allocated") changed++;
      }
    });
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  return { ok: true, changed };
}
