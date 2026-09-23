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
