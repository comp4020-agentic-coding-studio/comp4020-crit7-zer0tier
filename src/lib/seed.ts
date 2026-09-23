// The enrolment the app starts from. Course codes, titles and class numbers
// are real: they match the student's MyTimetable enrolment and ANU Programs
// and Courses for Semester 2, 2026 (checked 23 Sep 2026). Activity labels
// (LecA, TutA...) are the groups MyTT shows for each course.
//
// Days, times, rooms and seat counts are ILLUSTRATIVE. MyTT's real class
// times sit behind a login, and inventing them as if they were real would be
// plausible-looking invention, so the app says so on every page that shows
// them. Two tutorial groups start unallocated so the core flow has work to do.
import type { Activity, ActivityGroup, Course } from "./schema";

interface SeedGroup {
  group: ActivityGroup;
  activities: Activity[];
  allocated?: string;
}

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

function group(
  courseCode: string,
  label: string,
  kind: string,
  readOnly: boolean,
  slots: [day: number, start: number, end: number, location: string, capacity: number, taken: number][],
  allocatedNumber?: string,
): SeedGroup {
  const id = `${courseCode}-${label}`;
  const acts = slots.map(([day, start, end, location, capacity, taken], i) => {
    const number = String(i + 1).padStart(2, "0");
    return { id: `${id}-${number}`, groupId: id, number, day, start, end, location, capacity, taken };
  });
  return {
    group: { id, courseCode, label, kind, readOnly },
    activities: acts,
    allocated: allocatedNumber ? `${id}-${allocatedNumber}` : undefined,
  };
}

export const SEED: { course: Course; groups: SeedGroup[] }[] = [
  {
    course: { code: "COMP3500", title: "Software Engineering Project", classNumber: "8685", hue: 0 },
    groups: [
      group("COMP3500", "LecA", "Lecture", true, [[1, h(10), h(12), "Lecture theatre 1", 220, 160]], "01"),
    ],
  },
  {
    course: { code: "COMP3900", title: "Human-Computer Interaction", classNumber: "8692", hue: 1 },
    groups: [
      group("COMP3900", "LecA", "Lecture", true, [[2, h(9), h(11), "Lecture theatre 2", 180, 120]], "01"),
      group("COMP3900", "TutA", "Tutorial", false, [
        [2, h(11), h(12), "Tutorial room 1.04", 25, 19],
        [3, h(13), h(14), "Tutorial room 1.04", 25, 12],
        [4, h(15), h(16), "Tutorial room 2.10", 25, 25],
        [5, h(10), h(11), "Tutorial room 2.10", 25, 21],
      ]),
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
      group("COMP4020", "LecA", "Lecture", true, [[1, h(14), h(16), "Lecture theatre 3", 120, 90]], "01"),
      group(
        "COMP4020",
        "TutA",
        "Tutorial",
        false,
        [
          [3, h(9), h(11), "Studio 3.02", 30, 28],
          [4, h(12), h(14), "Studio 3.02", 30, 22],
          [5, h(14), h(16), "Studio 3.02", 30, 30],
        ],
        "02",
      ),
    ],
  },
  {
    course: { code: "PHIL1005", title: "Logic and Critical Thinking", classNumber: "7179", hue: 3 },
    groups: [
      group("PHIL1005", "LecA", "Lecture", true, [[2, h(14), h(15), "Lecture theatre 4", 300, 240]], "01"),
      group("PHIL1005", "LecB", "Lecture", true, [[4, h(10), h(11), "Lecture theatre 4", 300, 240]], "01"),
      group("PHIL1005", "TutA", "Tutorial", false, [
        [1, h(11), h(12), "Seminar room 5", 20, 14],
        [3, h(15), h(16), "Seminar room 5", 20, 20],
        [4, h(13), h(14), "Seminar room 6", 20, 9],
        [5, h(9), h(10), "Seminar room 6", 20, 17],
      ]),
    ],
  },
];
