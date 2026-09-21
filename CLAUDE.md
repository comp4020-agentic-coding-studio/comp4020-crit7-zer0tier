# Your harness

Read this file before each task. Read `README.md`, `spec/README.md` and the
published crit brief and spec before planning or building.

## Platform facts for this stack

This week's template is server-rendered (Astro `output: "server"` + the Node
adapter), backed by SQLite via Drizzle, and deploys to Fly.io via the
`Dockerfile` and `fly.toml`. Facts worth not re-discovering:

- The SQLite file lives on a Fly volume at `/data/app.db` (see `fly.toml`), so
  state survives reloads, restarts and redeploys — not an in-memory toy.
- `astro.config.ts` lists the deploy domain in `security.allowedDomains`
  (`**.fly.dev`) so Astro trusts Fly's proxy and accepts same-origin form
  POSTs. Changing the deploy domain means updating this too, or every form
  breaks in production with a 403.
- CI (`.github/workflows/checks.yml`) verifies, after deploy: the site
  returns 200, the SSE stream at `/api/events` actually streams, same-origin
  POSTs are accepted (https detection didn't break), cross-site POSTs are
  still refused (CSRF protection is on), and internal links resolve. Those
  are the platform's own claims, not the week's spec — read the workflow
  before assuming what it covers.
- The repo stays private until `/ship` flips it; the `deploy` job is a no-op
  until then, and `pnpm check` locally runs the same sensors CI does.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make
  them.
- Run `pnpm check` before you push.
- After each requested change is complete and verified, commit the work before
  ending the task. The student explicitly requires commits after changes.
- Push when requested; include all completed local commits when the student
  asks to push everything so far.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## The checks

`pnpm check` runs types, the build, and the spec (`spec/*.test.ts`): the
shipped invariants (any good web app — nav landmark, one `h1`, lang, viewport,
alt text, an axe pass under jsdom), the README promise (`/readme/` serves
`README.md` in full), the starter's own plumbing check while it's still
present, and this week's own contract once written.

`pnpm check:evidence` is the extra gate before shipping: `PROCESS.md`'s
template boilerplate is gone, every cited commit hash resolves in this repo,
`CLAUDE.md` exists, and (crit weeks) a `reflections/crit-N.md` entry exists
for this repo's own number. CI adds the secret scan and the deploy checks
listed above.

## This file is yours

What you add here is the harness, and the harness is assessed. This file and
the sensors you wire into `check` carry across the course — both come with
you into next week's repo. The prototype source, and the tests answering
this deliverable's own published spec, stay behind.

## What I've learned to hold the agent to

Carried forward from earlier weeks. Kept short on purpose — a rule I won't
reread is a rule that doesn't work.

### Read the spec's own tests before writing any code

`spec/*.test.ts` for the week is the contract in executable form, and it
holds requirements a summary of the brief will drop. In C2 my own brief
covered the link to the original but never mentioned the organisation's
**contact** details --- which `spec/crit-2.test.ts` asserts outright. Read
those files and the published spec first, then build. Cheaper than
discovering it at the crit.

### Word counts: a crit week is 150--300 words, not an essay

Indicative, not penalised --- but badly overshooting loses marks under the
response criterion, and "badly" is easy to hit by accident. I wrote a
1,182-word `PROCESS.md` for a 150--300-word slot before checking.

| file | words | shape |
| --- | --- | --- |
| crit-week `PROCESS.md` | 150--300 | **one or two** moments, not four |
| assignment `PROCESS.md` | 400--600 | |
| final-project `PROCESS.md` | 600--900 | folds in stack + workflow |
| any `reflections/*.md` | 150--300 | every week, crit or assignment |

Images and screenshots don't count towards any of these, and are encouraged
where one carries the verification better than a sentence. Tables are a
cheap way to say a lot inside the budget.

### Content that asserts something about the world gets verified against the world

C4's songbook's obvious picks were unplayable on that week's instrument ---
written out anyway they'd have looked completely plausible and sounded
wrong. The same rule applies to anything a site *claims*: a policy, a
prerequisite, a citation, a fact about a real tool or technique. Don't
transcribe or invent from memory when a checkable source exists, and check
the arithmetic of anything fetched rather than trusting it looks right. Never
let real information be plausible-looking invention.

### The rendered page is the only source of truth for layout

`pnpm check` cannot see the page. It was fully green in C2 while all 24 card
thumbnails rendered as empty tofu boxes (emoji, no emoji font) and three
links had shipped welded to the previous word. Render the built site and
measure it at **both** graded viewports before believing it, across
non-adjacent pages, not just the home page:

- `document.documentElement.scrollWidth === window.innerWidth` at 1920 and
  at 390 --- this is the no-horizontal-scroll contract, and the one thing
  most worth checking
- elements crossing the right edge at 390 should only ever be the contents
  of a deliberate horizontal scroller
- don't assert layout in `spec/` --- jsdom computes none, so the test would
  pass on a visibly broken page. Say so in the test file rather than faking
  the coverage.

Emoji are not safe as load-bearing visuals. Text and CSS need no font that
might be missing.

Run axe-core in that same browser session while it's open --- injecting it
from a CDN and calling `axe.run(document)` at both viewports takes seconds.
In C2 it caught one serious `color-contrast` failure I would not have seen:
labels sat at ~3.4:1 because I'd dimmed a pill's own colour with
`opacity: 0.65`. axe under jsdom cannot evaluate `color-contrast` at all ---
no layout, no computed colours --- so this stays a manual pass to repeat
whenever colours change, across every distinct page template on the site,
not just once.

### `hidden` loses to any author `display` rule

The UA implements the `hidden` attribute as `display: none` in *its*
stylesheet, so any author rule that sets `display` on the same element
outranks it. In C2 an empty search bar (`display: flex`) rendered 71px tall
on every first visit while carrying `hidden`. Ship
`[hidden] { display: none !important; }` once, globally.

And measure the right thing: my probe read `el.hidden`, which was `true` the
whole time. The attribute is not the question --- `getComputedStyle(el).display`
and `el.offsetParent !== null` are. Assert what a visitor sees, not what the
DOM property says.

### Make a check fail before trusting it

A test that has never been red is not evidence. Break the thing on purpose,
watch it fail, restore, watch it pass. And any injection or edit used to do
that must **assert it actually matched** --- in C2 a find-and-replace
silently hit nothing, so the test never ran and still read as green. A
silently-skipped verification is worse than none, because it manufactures
confidence.

**A test that checks a rule by applying that same rule cannot catch the
rule being wrong.** In A1 I inverted `overlaps()` from half-open to closed
--- the classic off-by-one --- and a structural test stayed green because it
asked `overlaps()` whether the packing `overlaps()` produced was right.
Only a fixture test with a literal expected answer went red. So: for any
convention the whole design rests on, write at least one test that states
the expected answer as a **literal**, from outside the implementation.
Structural tests check consistency; only fixtures check correctness.

### "Never commit a red state" has one exception, and only one

The week's own `spec/*.test.ts` encodes the published contract *before* the
thing exists --- red is its correct starting state, and turning each one
green is the commit trail the marker reads. So the rule is: never commit a
**regression**, and never commit with typecheck, build or lint red. A spec
test that has never yet been green is a different thing from a test that
just broke. Say which is which in the commit message, so the distinction is
legible rather than something a reader has to reconstruct.

### Test above `--shell`, not just at the two marking viewports

`--shell` is 1440px, so anything full-bleed looks correctly aligned at every
width up to 1440 and wrong above it. A release timeline bar sat in a
different column from the header directly above it --- invisible at 1280 and
at 390, plainly wrong at **1920, which is a marking viewport**. When a
layout bug depends on a breakpoint, put the breakpoint's far side in the
test --- walk a spread of widths around any breakpoint you introduce, because
the bug lives entirely in the range a two-viewport test never visits.

### A listener on an ancestor is not the same as a listener that fires

A relearning test was silently dead on nine of twelve runs because a
descendant called `stopPropagation()` and a bubble-phase listener on an
ancestor never saw the click that mattered. `addEventListener(..., true)` ---
capture runs ancestor-first, before the target's own handlers. **When adding
an interaction on top of an existing one, assume the existing one already
stops the event, and prove the new one fires.** Nothing in `spec/` can catch
this --- jsdom dispatches no real click, so only driving it in a browser
found it.

### Don't dim text with `opacity` --- I did it again

A contrast failure was `opacity: 0.65` on a nav pill; reaching for
`opacity: 0.78` elsewhere landed at roughly 2.6:1 on a different background.
There is no colour that opacity is safe to dim against every possible
background. Carry hierarchy with size and weight; if a muted colour is
genuinely needed, set the colour and measure it.

Related: a colour token is named for the job it does. A background token
used as a text colour can land two near-identical colours on top of each
other at ~1:1 contrast. Give a background token its own paired ink token,
and look for it before reusing the background token anywhere else.

### Run axe on the built pages, at both viewports

`pnpm check` cannot see contrast and neither can jsdom. With the preview
server running, inject `node_modules/axe-core/axe.min.js` and call
`axe.run(document)` at 1920 and 390. Doing this once turned up serious
violations I hadn't caught by eye.

### "Supports the claim" is a measurement, not an opinion

Whatever the brief claims the app is *for*, check it by measurement, not by
eye component-at-a-time --- each piece felt defensible on its own while the
whole thing drifted off the claim.

### An effect that can cause itself will cause itself

Whenever a generated event can generate more of the same event, the
generated ones must be marked inert at birth, not merely rate-limited. This
now runs a live server with real event loops (SSE, DB writes triggering
broadcasts) rather than a static site, so this is directly relevant, not just
a general form to remember: a rate limit bounds the symptom, inertness
removes the loop.

### `animation-fill-mode: both` outranks your normal declarations

`both` retains an animation's final value, which outranks a normal
declaration in the cascade, so a rule setting the same property never
applies. Use `backwards`, not `both`, for a pure entrance: it gives the
pre-animation state and then hands control back to the stylesheet. Read the
computed value, don't trust the rule you wrote ---
`getComputedStyle(el).opacity` can say `0.998` while the stylesheet plainly
says `0`.

### When a request contradicts the spec, say so once and let the student decide

Naming a conflict between what's asked and what the brief forbids gets a
better answer than either silently building it or refusing outright. Name
the conflict once, then let the design find the version that respects both.

### Compare siblings, not ancestors, when checking for overlap

An overlap check can go red for a trivially-true reason: a parent's box
always contains its child's, so `overlaps(child, parent)` is trivially true
once one is nested in the other. A geometric assertion is only as good as
its idea of what should not touch what --- compare things actually laid out
side by side.

### A constraint taken too literally makes a worse thing than the constraint wanted

Enforcing the *letter* of a constraint can produce something obviously worse
than what the constraint's *purpose* wanted. When a rule starts producing
something obviously worse, check whether you are serving the rule or the
reason for it --- the fixed parts of a platform (branding, content model,
generated API, in this template the guestbook plumbing) are not to be worked
around, but there's usually a design that gets the same effect within them.

### If a mapping doesn't actually hold, don't pretend it does

Inventing a precise correspondence the source doesn't actually supply is
content-shaped invention, the same failure as an invented address. Say
what's actually known rather than manufacturing the correspondence.

### `top` without `position` is a no-op that desktop will hide from you

Static elements ignore `top`, so a banner styled with `top: 4.4rem` and no
`position` can lay out fine in normal flow at one width and land on top of a
fixed header at another. Every offset property needs its `position` checked
in the same breath, and overlap should be asserted by comparing bounding
boxes pairwise, not by eyeballing a screenshot.

### `fullPage` screenshots lie about `position: fixed`

A `fullPage: true` capture can show a fixed bar floating mid-page when it's
actually pinned correctly --- fixed elements composite once at their viewport
position and a fixed vignette stretches over the whole capture. Use
`fullPage` to read content and layout order; to judge anything fixed,
sticky, or viewport-sized, scroll a real viewport and measure boxes.

### An audit that hardcodes what it measures against stops being an audit

A check that compares against a literal baked-in value (a hex colour, say)
stops being a check the moment the thing it's comparing against changes,
and will keep reporting green having seen nothing real. A check whose
expected value is baked in only tests the past --- take the measurement from
the running page, not from a constant written next to it.

### Measure target size and contrast; don't eyeball either

A browser-level audit that prints every interactive element's rendered box,
font size and contrast ratio finds defects that get looked straight at and
not seen: a link under the WCAG 2.2 AA minimum of **24x24 CSS px** for a
pointer target (the web figure is 24, not the 44pt/48dp native numbers), or
body-adjacent text under the 12px floor. Two traps: sampling only what's
visible in one viewport screenshot silently skips anything below the fold
(scroll each target into view and re-read its box after scrolling), and
`fullPage` doesn't fix this for `position: fixed` elements either. Anything
that cannot be measured should say NOT MEASURED and fail the run, rather
than being silently skipped.

### A font stack whose first entry is platform-specific ships two designs

If a font stack's first entry only exists on one platform (e.g.
`ui-rounded`), different visitors see different typefaces without anyone
noticing on their own machine. Either commit to a webfont or start from
`system-ui`.

### A design-system generator can return a confidently wrong answer

Asked for a visual direction, a UI dataset can return a pattern that's
reasonable for a different kind of page (e.g. a marketing landing page)
and wrong for this one. Its own contract says to verify the returned
category actually fits before using it --- check what a recommender thinks
you are building before taking its advice. The parts worth keeping from a
mismatched result are the measurable ones (contrast thresholds, target
sizes, reduced-motion), not the aesthetic direction.

### Audit every interactive element, not the ones you remember

Teaching an audit script to assert against a threshold, rather than just
print the value, finds defects sitting there since a nearly identical one
was already fixed elsewhere on the page. If a script measures something,
make it assert against the threshold, not just report the value.

### A browser audit needs a real build and a visible-state measurement

An interrupted build left `dist/` empty; a browser loop then reported zero pages
inspected. Fail immediately if the expected built app is missing. Measure a
skip link after focusing it: its intentional 1px hidden box says nothing about
the keyboard target. Keep browser reports even if a later interaction fails,
so a search selector error cannot hide the page measurements already collected.
