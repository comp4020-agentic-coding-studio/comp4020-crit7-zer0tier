// Each course's official summary on ANU Programs and Courses (checked
// 23 Sep 2026: all four resolve, and their page titles match the course
// titles in seed.ts). The path is the course code, so no table is needed.
export function courseSummaryUrl(code: string): string {
  return `https://programsandcourses.anu.edu.au/course/${encodeURIComponent(code)}`;
}
