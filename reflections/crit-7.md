# Crit 7 reflection

**What was the breakthrough that moved the work forward?**

Deciding that the home page should *be* the timetable. My complaint about
MyTimetable was never that a feature was missing. The complaint was that
the thing I open it for sits behind a tab, under a wall of notices, with the
calendar link at the very bottom. Once "quick access" meant "the first screen
answers where am I next", the rest followed: the saved view, the calendar
feed and the home-screen install are three routes to that same screen.

The second breakthrough came from driving the flow in a real browser rather
than trusting the green spec. Choosing a clashing tutorial made two classes
stack on the grid, one hiding the other. That is exactly the failure the
redesign exists to prevent, and no HTTP test could see it. The fix put them
side by side and named the clash in a sentence. The audit that found it now
lives in the repo.

**What did this work change about who I want to be as a software developer?**

I want to be the developer who says which parts are real. The course codes,
class numbers and semester dates are checked against ANU's own pages. The
times and rooms are not, and the app says so on every page. Leaving those as
quiet, plausible invention would have been easy, and nobody at a crit would
have noticed. A timetable that looks right and isn't is worse than MyTT,
because people act on it.
