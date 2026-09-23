// The catalogue the app runs on, synced into SQLite at every boot (see
// db.ts); the student's choices are state and live only in the database.
//
// REAL (source: "mytt"): the eight activity records the student copied out
// of their own MyTimetable on 23 Sep 2026, field for field, plus course
// codes, titles and class numbers checked against ANU Programs and Courses.
// One correction: MyTT's export printed "O?Donoghue" — the apostrophe lost
// in encoding; ANU's own map names the building Lowitja O’Donoghue
// Cultural Centre.
//
// ILLUSTRATIVE (source: "illustrative"): COMP3500's lecture, whose details
// weren't provided, and the alternative tutorial times, which MyTT only
// shows behind its login. Every page that shows one of these says so.
import type { Activity, ActivityGroup, Course, Session } from "./schema";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

const CULTURAL_CENTRE = "Lowitja O’Donoghue Cultural Centre Bldg 153";
const MONDAYS = "27/7-31/8, 21/9-28/9, 12/10-26/10"; // as MyTT lists Monday classes
const SAMPLE_DATES = "27/7-4/9, 21/9-30/10"; // every teaching week

type Part = Omit<Session, "id" | "activityId">;
interface SeedActivity {
  number: string;
  source: "mytt" | "illustrative";
  parts: Part[];
}
interface SeedGroup {
  group: Omit<ActivityGroup, "id" | "courseCode">;
  activities: SeedActivity[];
  allocated: string; // the activity number the student holds
}
export interface SeedCourse {
  course: Course;
  groups: SeedGroup[];
}

function part(
  activityType: string,
  description: string,
  day: number,
  start: number,
  minutes: number,
  location: string,
  staff: string,
  dates: string,
  seats: number,
  p = "",
): Part {
  return { part: p, activityType, description, day, start, end: start + minutes, campus: "ACTON", location, staff, dates, seats };
}

const sample = (type: string, day: number, start: number, minutes: number, seats: number, p = "") =>
  part(type, "Illustrative sample time, not from MyTimetable", day, start, minutes, "Sample room (illustrative)", "-", SAMPLE_DATES, seats, p);

export const SEED: SeedCourse[] = [
  {
    course: { code: "COMP3500", title: "Software Engineering Project", classNumber: "8685", hue: 0 },
    groups: [
      {
        group: { label: "LecA", kind: "Lecture", readOnly: true },
        allocated: "01",
        activities: [{ number: "01", source: "illustrative", parts: [sample("Lecture", MON, h(10), 120, 50)] }],
      },
    ],
  },
  {
    course: { code: "COMP3900", title: "Human-Computer Interaction", classNumber: "8692", hue: 1 },
    groups: [
      {
        group: { label: "LecA", kind: "Lecture", readOnly: true },
        allocated: "01",
        activities: [
          {
            number: "01",
            source: "mytt",
            parts: [
              part(
                "Lecture",
                "on campus - COMP3900_S2_(01)-LecA/01 + COMP6390_S2_(01)-LecA/01",
                MON, h(13), 120,
                `Cinema Rm 1.02_${CULTURAL_CENTRE}`,
                "Charles Martin",
                MONDAYS,
                121,
              ),
            ],
          },
        ],
      },
      {
        group: { label: "TutA", kind: "Tutorial", readOnly: false },
        allocated: "07",
        activities: [
          {
            number: "03",
            source: "illustrative",
            parts: [sample("Tutorial", TUE, h(14), 90, 6, "P1"), sample("Drop-In Class", TUE, h(15, 30), 30, 6, "P2")],
          },
          {
            number: "05",
            source: "illustrative",
            parts: [sample("Tutorial", WED, h(10), 90, 0, "P1"), sample("Drop-In Class", WED, h(11, 30), 30, 0, "P2")],
          },
          {
            number: "07",
            source: "mytt",
            parts: [
              part(
                "Tutorial",
                "on campus - COMP3900_S2_(01)-TutA/07 + COMP6390_S2_(01)-TutA/07",
                FRI, h(9), 90,
                "Rm 2.03_Fulton Muir Bldg 95",
                "-",
                "7/8-4/9, 25/9-30/10",
                1,
                "P1",
              ),
              part(
                "Drop-In Class",
                "on campus - COMP3900_S2_(01)-DroA/07 + COMP6390_S2_(01)-DroA/07",
                FRI, h(10, 30), 30,
                "Rm 2.03_Fulton Muir Bldg 95",
                "-",
                "7/8-4/9, 25/9-30/10",
                1,
                "P2",
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    course: {
      code: "COMP4020",
      title: "Advanced Topics in Human-Centred and Creative Computing",
      classNumber: "9056",
      hue: 2,
    },
    groups: [
      {
        group: { label: "LecA", kind: "Lecture", readOnly: true },
        allocated: "01",
        activities: [
          {
            number: "01",
            source: "mytt",
            parts: [
              part(
                "Lecture",
                "on campus - COMP4020_S2_(01)-LecA/01 + COMP8020_S2_(01)-LecA/01",
                THU, h(11), 120,
                "Rm 2.02_Fulton Muir Bldg 95",
                "Benjamin John Swift",
                "30/7-3/9, 24/9-29/10",
                0,
              ),
            ],
          },
        ],
      },
      {
        group: { label: "TutA", kind: "Tutorial", readOnly: false },
        allocated: "02",
        activities: [
          { number: "01", source: "illustrative", parts: [sample("Tutorial", TUE, h(12), 90, 3, "P1")] },
          {
            number: "02",
            source: "mytt",
            parts: [
              part(
                "Tutorial",
                "on campus - COMP4020_S2_(01)-TutA/02 + COMP8020_S2_(01)-TutA/02",
                MON, h(15, 30), 90,
                "Rm 4.03_Marie Reay Bldg 155",
                "-",
                "3/8-31/8, 21/9-28/9, 12/10-26/10",
                0,
                "P1",
              ),
            ],
          },
          { number: "03", source: "illustrative", parts: [sample("Tutorial", WED, h(15), 90, 0, "P1")] },
        ],
      },
    ],
  },
  {
    course: { code: "PHIL1005", title: "Logic and Critical Thinking", classNumber: "7179", hue: 3 },
    groups: [
      {
        group: { label: "LecA", kind: "Lecture", readOnly: true },
        allocated: "01",
        activities: [
          {
            number: "01",
            source: "mytt",
            parts: [
              part(
                "Lecture",
                "- PHIL1005_S2_(01)-LecA/01",
                MON, h(12), 60,
                `Manning Clark Hall Rm 1.04_${CULTURAL_CENTRE}`,
                "Colin Klein",
                MONDAYS,
                33,
              ),
            ],
          },
        ],
      },
      {
        group: { label: "LecB", kind: "Lecture", readOnly: true },
        allocated: "01",
        activities: [
          {
            number: "01",
            source: "mytt",
            parts: [
              part(
                "Lecture",
                "- PHIL1005_S2_(01)-LecB/01",
                WED, h(13), 60,
                `Manning Clark Hall Rm 1.04_${CULTURAL_CENTRE}`,
                "Colin Klein",
                "29/7-2/9, 23/9-28/10",
                33,
              ),
            ],
          },
        ],
      },
      {
        group: { label: "TutA", kind: "Tutorial", readOnly: false },
        allocated: "07",
        activities: [
          { number: "02", source: "illustrative", parts: [sample("Tutorial", MON, h(14), 60, 4)] },
          { number: "04", source: "illustrative", parts: [sample("Tutorial", WED, h(9), 60, 0)] },
          { number: "05", source: "illustrative", parts: [sample("Tutorial", FRI, h(12), 60, 8)] },
          {
            number: "07",
            source: "mytt",
            parts: [
              part(
                "Tutorial",
                "- PHIL1005_S2_(01)-TutA/07",
                THU, h(8), 60,
                "Rm G39_Copland Bldg 24",
                "-",
                "30/7-3/9, 24/9-29/10",
                5,
              ),
            ],
          },
        ],
      },
    ],
  },
];

/** Flatten SEED into table rows, with the ids the app uses. */
export function seedRows() {
  const courses: Course[] = [];
  const groups: ActivityGroup[] = [];
  const activities: Activity[] = [];
  const sessions: Session[] = [];
  const allocations: { groupId: string; activityId: string }[] = [];
  for (const c of SEED) {
    courses.push(c.course);
    for (const g of c.groups) {
      const groupId = `${c.course.code}-${g.group.label}`;
      groups.push({ id: groupId, courseCode: c.course.code, ...g.group });
      allocations.push({ groupId, activityId: `${groupId}-${g.allocated}` });
      for (const a of g.activities) {
        const activityId = `${groupId}-${a.number}`;
        activities.push({ id: activityId, groupId, number: a.number, source: a.source });
        a.parts.forEach((p, i) => {
          sessions.push({ id: `${activityId}-${p.part || i + 1}`, activityId, ...p });
        });
      }
    }
  }
  return { courses, groups, activities, sessions, allocations };
}
