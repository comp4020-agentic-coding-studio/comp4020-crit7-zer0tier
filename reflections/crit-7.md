# Crit 7 reflection

**What was the breakthrough that moved the work forward?**

Reconstruction turned out to be the hard part, not redesign. My first
requests were about making MyTimetable *better* in the abstract, before the
agent had seen the real system. Once I gave it the actual site, the rebuild
looked complete but wasn't: clash detection between overlapping classes,
showing every enrolled class rather than a subset, and flagging ANU's public
holidays were all missing. A description of "better" and the working system
aren't the same input, and a plausible-looking rebuild can pass a glance
while quietly dropping real behaviour. Each gap had to be named and asked
for by hand, one function at a time, rather than assumed present because
the layout looked right.

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
