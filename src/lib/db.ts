import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type Activity,
  type ActivityGroup,
  type Allocation,
  type Course,
  activities,
  activityGroups,
  allocations,
  courses,
  preferences,
  waitlist,
  type WaitlistEntry,
} from "./schema";
import { SEED } from "./seed";
import { type Slot, clashes } from "./timetable";

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

// Seed the enrolment once, on an empty database. Never re-seeds over state
// a student has changed.
if (db.select().from(courses).all().length === 0) {
  db.transaction((tx) => {
    for (const c of SEED) {
      tx.insert(courses).values(c.course).run();
      for (const g of c.groups) {
        tx.insert(activityGroups).values(g.group).run();
        for (const a of g.activities) tx.insert(activities).values(a).run();
        if (g.allocated) {
          tx.insert(allocations).values({ groupId: g.group.id, activityId: g.allocated }).run();
        }
      }
    }
  });
}

export type { Activity, ActivityGroup, Allocation, Course, WaitlistEntry };

export type Status = "allocated" | "pending" | "unallocated";

export interface GroupView {
  group: ActivityGroup;
  course: Course;
  options: Activity[];
  chosen: Activity | undefined; // allocated activity
  waiting: Activity | undefined; // wait-listed activity
  status: Status;
}

/** Every group with its options and current allocation, in course order. */
export function listGroups(): GroupView[] {
  const byCode = new Map(listCourses().map((c) => [c.code, c]));
  const groups = db.select().from(activityGroups).orderBy(asc(activityGroups.id)).all();
  const acts = db
    .select()
    .from(activities)
    .orderBy(asc(activities.day), asc(activities.start))
    .all();
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

/** Seats left, counting the student's own seat when they hold it. */
export function seatsLeft(a: Activity, mine: boolean): number {
  return a.capacity - a.taken - (mine ? 1 : 0);
}

/** The other groups whose allocated activity clashes with `a`. */
export function clashesFor(a: Slot & { groupId: string }, views: GroupView[]): GroupView[] {
  return views.filter((v) => v.group.id !== a.groupId && v.chosen && clashes(v.chosen, a));
}

export type AllocateResult =
  | { ok: true; outcome: "allocated" | "waitlisted" | "unchanged"; activity: Activity }
  | { ok: false; code: 400 | 403 | 404; reason: string };

/**
 * Allocate the student to `activityId` in `groupId`. A full activity puts
 * them on its wait list instead, keeping any seat they already hold.
 * Read-only groups refuse, as MyTT does. Clashes are warned about on the
 * page, not refused: MyTT lets clashing activities be allocated too.
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

  return db.transaction((tx) => {
    tx.delete(waitlist).where(eq(waitlist.groupId, groupId)).run();
    if (seatsLeft(activity, false) <= 0) {
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
