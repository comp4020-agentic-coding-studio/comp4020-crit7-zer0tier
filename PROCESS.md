# Process overview

## What I built

A rebuilt slice of ANU MyTimetable. The home page is the timetable itself,
tutorial times are chosen with seats and clashes in view, and three
quick-access routes get you back to it. `README.md` has the argument.

## How I got here

I directed it with a screenshot of my real MyTT home page and one line:

> the current timetabling is not user-friendly. Make the current UI more
> optimised and give it an option to make the user have the quick access to
> it (finding it currently is quite hard)

**Grounding, then a correction to the contract.** The spec test I'd committed
earlier, [`47f0bc4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-zer0tier/commit/47f0bc4), guessed a room-booking app. The
agent rewrote it for the timetable flow rather than building to the wrong
contract. It checked the course titles, class numbers and semester dates
against Programs and Courses. It labelled times and rooms as illustrative,
because the real ones need a login. Each new test was made to fail first, by
breaking the clash rule and then the database write
([`8c963e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-zer0tier/commit/8c963e3)).

**The browser found what the spec couldn't.** With every test green, driving
the flow in Chromium showed a clashing tutorial stacked on top of the class it
clashed with. The fix gave clashes side-by-side lanes and a sentence naming
them. A new clipped-content check then went red at 1920, where rows were 3px
too short. That audit is now a committed sensor
([`6a1e332`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-zer0tier/commit/6a1e332)), verified red before it was trusted.

| check | result |
| --- | --- |
| `pnpm check` | 70 tests green |
| `pnpm audit:browser` | 54 renders, 9 widths, 0 failures |
