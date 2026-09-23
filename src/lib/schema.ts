import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
//
// The slice modelled is MyTimetable's: a student's enrolled courses, each
// course's activity groups (LecA, TutA...), the concrete activities (a day,
// a time, a room) in each group, and which one the student is allocated to.
// One allocation per group is the rule MyTT itself states: "Each activity
// group will contain a number of activities, of which you must attend one."

export const courses = sqliteTable("courses", {
  code: text().primaryKey(), // COMP4020
  title: text().notNull(),
  classNumber: text("class_number").notNull(), // 9056, as MyTT shows it
  hue: int().notNull(), // colour slot 0-5 for the grid
});

export const activityGroups = sqliteTable("activity_groups", {
  id: text().primaryKey(), // COMP4020-TutA
  courseCode: text("course_code")
    .notNull()
    .references(() => courses.code),
  label: text().notNull(), // TutA
  kind: text().notNull(), // Lecture | Tutorial | Workshop
  // MyTT's READ ONLY: visible, not choosable (allocated by the school)
  readOnly: int("read_only", { mode: "boolean" }).notNull().default(false),
});

export const activities = sqliteTable("activities", {
  id: text().primaryKey(), // COMP4020-TutA-02
  groupId: text("group_id")
    .notNull()
    .references(() => activityGroups.id),
  number: text().notNull(), // 02
  day: int().notNull(), // 1 = Monday ... 5 = Friday
  start: int().notNull(), // minutes after midnight, Canberra time
  end: int().notNull(), // exclusive: a 9:00-10:00 class and a 10:00 one don't clash
  location: text().notNull(),
  capacity: int().notNull(),
  taken: int().notNull(), // seats held by other students
});

// The activity the student holds a seat in, one per group.
export const allocations = sqliteTable("allocations", {
  groupId: text("group_id")
    .primaryKey()
    .references(() => activityGroups.id),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// A request for a seat in a full activity. Kept apart from allocations so
// joining a wait list never costs the seat already held — MyTT's "be put on
// a wait list" option. A group with a wait list entry and no allocation is
// what MyTT counts as Pending.
export const waitlist = sqliteTable("waitlist", {
  groupId: text("group_id")
    .primaryKey()
    .references(() => activityGroups.id),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Single-row settings, e.g. which view the home page opens to.
export const preferences = sqliteTable("preferences", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export type Course = typeof courses.$inferSelect;
export type ActivityGroup = typeof activityGroups.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Allocation = typeof allocations.$inferSelect;
export type WaitlistEntry = typeof waitlist.$inferSelect;
