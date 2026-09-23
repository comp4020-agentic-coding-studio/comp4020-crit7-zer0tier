# Timetable, sorted

A rebuilt slice of ANU MyTimetable for one student's Semester 2, 2026
enrolment. MyTT's home page opens on a wall of notices. Your actual
timetable sits behind a tab, and the calendar link sits at the bottom of the
page. Here the home page *is* the timetable: your next class, what you still
have to choose, and the week at a glance. Choosing a tutorial time is one
page per course, with seats left and clashes shown before you commit.
Everything is stored in SQLite, so it survives a reload and a redeploy.

![The home page at desktop width: next class, allocation status, the still-to-do list and the week grid, with the quick-access panel on the right](public/after-week.png)

## What good looks like here

**Quick to reach.** The one thing asked for was quicker access to the
timetable, so the app offers three routes, all on the home page:

- a saved **"opens to"** option (This week or Today), stored in the
  database so it holds on every device
- a web manifest, so **Add to Home Screen** opens it like an app
- a **calendar feed** (`/calendar.ics`) of every allocated class, weekly
  through the semester, skipping the 7–18 September teaching break

**Optimised, measured.** From the home page, choosing a tutorial is two
clicks and a save. Clashes are named in words rather than implied by
position, and a full class offers the wait list without costing you your
current seat. At phone width the grid becomes a per-day list rather than a
table that scrolls sideways.

![The same page at 390px: the week becomes a per-day list](public/after-phone.png)

**True where it claims to be.** These details are real: the course codes,
titles and class numbers, the semester dates (27 July to 30 October 2026, from
ANU Programs and Courses), and the teaching break (from ANU's CBE Student
Engagement Planner 2026). Class **times, rooms and seat counts are
illustrative**, because MyTT's real ones sit behind a login. Every page
showing them says so. COMP3500 appears in MyTT as "Computing Team Project",
but Programs and Courses 2026 calls it "Software Engineering Project". The
app uses the Programs and Courses title.

| What | How it's held |
| --- | --- |
| Choosing a time survives a reload; wait list keeps your seat; read-only groups refuse | `spec/crit-7.test.ts`, over HTTP against the built server |
| Clash rule is half-open (9–10 and 10–11 don't clash); week numbers; next class; `.ics` output | literal fixtures in `spec/crit-7.test.ts` |
| No sideways scroll, nothing clipped, 24px targets, 12px text, axe incl. contrast | `pnpm audit:browser`, in Chromium at nine widths |
| Whether it's actually easier than MyTT | judgement: the crit |

**ANU's own web style.** Colours and type follow the
[ANU Web Style Guide](https://webpublishing.anu.edu.au/web-style-guide/colours).
Everything is black and white, with ANU Gold `#BE830E` as a sparing highlight
and Gold tint `#F5EDDE` for panels. Text is black, with Unigrey `#333333` for
muted lines. The typeface is Public Sans, self-hosted. The guide has no
status or secondary colours, so courses are told apart by their codes and
state is carried by words and weight. An event's left edge marks a lecture
(black) or a tutorial (gold). The header follows ANU's own sites: the
official ANU logo (taken unmodified from `webstyle.anu.edu.au`) on a white
masthead, above a black navigation bar. Beside the logo, the header says
this is a student prototype and not an ANU service. The footer repeats it.

**Not built:** sign-in and more than one student, swapping with another
student, sessional (X1–X4) courses, and any connection to the real MyTT.
