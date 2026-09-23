#!/usr/bin/env node
// The checks `pnpm check` can't make: it boots the BUILT server on a
// throwaway database, drives the core flow in a real Chromium (so the grid
// has a chosen tutorial, a wait-listed one and a clash to lay out), then
// visits every page at a spread of widths and FAILS on:
//   - horizontal scroll (scrollWidth !== innerWidth) or anything crossing
//     the right edge
//   - clipped content in events, cards and options
//   - [hidden] elements that still display
//   - text under 12px, pointer targets under 24x24 CSS px (a radio inside a
//     label is measured by its label, the real hit area)
//   - any axe-core violation, colour-contrast included
//   - a skip link whose focused box is off-screen or tiny
//   - Public Sans (ANU's web typeface) not actually loaded
//   - any image (the ANU logo included) that fails to load
// Usage: pnpm build && pnpm audit:browser   (WIDTHS=390,1920 to narrow it)
// Needs a Chromium: `pnpm exec playwright install chromium-headless-shell`.
// On WSL without libasound, put an extracted libasound2 on LD_LIBRARY_PATH.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const entry = "./dist/server/entry.mjs";
if (!existsSync(entry)) {
  console.error(`NOT MEASURED: ${entry} missing. Run pnpm build first.`);
  process.exit(1);
}
const port = 4500 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const server = spawn("node", [entry], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    DATABASE_PATH: join(mkdtempSync(join(tmpdir(), "audit-db-")), "a.db"),
  },
  stdio: "ignore",
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  if (i > 50) {
    server.kill();
    console.error("NOT MEASURED: server did not start");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}

const axeSrc = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const routes = ["/?view=week", "/?view=today", "/allocate/", "/courses/COMP3900/", "/courses/PHIL1005/", "/activities/COMP3900-TutA-07/", "/activities/PHIL1005-LecA-01/", "/readme/"];
const widths = (process.env.WIDTHS ?? "320,390,767,961,1279,1281,1440,1920,2560").split(",").map(Number);
let failures = 0;
let pages = 0;
const fail = (m) => {
  failures++;
  console.log(`FAIL ${m}`);
};

const browser = await chromium.launch();
try {
  // populate: one allocation, one wait list, one clash — through the UI
  const p = await browser.newPage();
  const choose = async (course, activity) => {
    await p.goto(`${base}/courses/${course}/`);
    const option = p.locator(`label[data-activity="${activity}"]`);
    if ((await option.count()) !== 1) throw new Error(`flow: no option ${activity}`);
    await option.click();
    await option.locator("xpath=ancestor::form").getByRole("button").click();
    await p.waitForURL(/\/\?view=week/);
  };
  await choose("COMP3900", "COMP3900-TutA-03"); // sample alternative, two parts
  await choose("COMP4020", "COMP4020-TutA-03"); // full: wait list
  await choose("PHIL1005", "PHIL1005-TutA-02"); // clashes with the real COMP3900 LecA
  await p.goto(`${base}/courses/PHIL1005/`);
  if ((await p.locator('label[data-activity="PHIL1005-TutA-02"] .note.clash').count()) !== 1)
    fail("flow: clash not warned on the course page");
  // a real click on a grid event must land on its details page
  await p.goto(`${base}/?view=week`);
  const event = p.locator("a.event").first();
  if ((await event.count()) === 0) fail("flow: no clickable event on the week grid");
  else {
    const activity = await event.getAttribute("data-activity");
    await event.click();
    await p.waitForURL(new RegExp(`/activities/${activity}/`), { timeout: 5000 }).catch(() => {});
    if (!p.url().includes(`/activities/${activity}/`)) fail(`flow: clicking ${activity} went to ${p.url()}`);
    else if ((await p.locator("dl.fields").count()) === 0) fail("flow: details page has no fields");
  }
  await p.close();

  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
    const page = await ctx.newPage();
    for (const r of routes) {
      await page.goto(base + r, { waitUntil: "load" });
      pages++;
      const m = await page.evaluate(() => {
        const iw = window.innerWidth;
        const shown = (el) => getComputedStyle(el).display !== "none" && el.offsetParent !== null;
        const name = (el) => `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent || el.value || "").trim().slice(0, 30)}"`;
        const over = [...document.querySelectorAll("body *")]
          .filter((el) => shown(el) && !el.closest(".visually-hidden,.skip"))
          .filter((el) => el.getBoundingClientRect().right > iw + 0.5)
          .map(name);
        const clipped = [...document.querySelectorAll(".event, .card, .option, .agenda li")]
          .filter((el) => shown(el) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1))
          .map(name);
        const small = [...document.querySelectorAll("a[href],button,input,summary,label.option,label.choice")]
          .filter((el) => !(el.tagName === "INPUT" && el.closest("label.option,label.choice")))
          // WCAG 2.5.8's inline exception: a link inside a sentence of prose
          .filter((el) => !(el.tagName === "A" && el.closest(".prose p, .prose li") && getComputedStyle(el).display === "inline"))
          .filter((el) => shown(el) && !el.closest(".visually-hidden") && !el.classList.contains("skip"))
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width < 24 || b.height < 24;
          })
          .map(name);
        const tiny = [...document.querySelectorAll("body *")]
          .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((el) => shown(el) && !el.closest(".visually-hidden") && parseFloat(getComputedStyle(el).fontSize) < 12)
          .map(name);
        const hiddenShown = [...document.querySelectorAll("[hidden]")].filter((el) => getComputedStyle(el).display !== "none").length;
        return { sw: document.documentElement.scrollWidth, iw, over, clipped, small, tiny, hiddenShown };
      });
      const at = `${w} ${r}`;
      // the brand typeface must be the one actually rendering, not a fallback
      const font = await page.evaluate(async () => {
        await document.fonts.ready;
        const loaded = [...document.fonts].some((f) => f.family.includes("Public Sans") && f.status === "loaded");
        return { loaded, family: getComputedStyle(document.body).fontFamily };
      });
      // lazy images only load near the viewport: scroll each in, then wait
      const broken = await page.evaluate(async () => {
        const out = [];
        for (const img of document.images) {
          img.scrollIntoView();
          if (!img.complete) {
            await new Promise((done) => {
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              setTimeout(done, 5000);
            });
          }
          if (img.naturalWidth === 0) out.push(img.getAttribute("src"));
        }
        window.scrollTo(0, 0);
        return out;
      });
      if (broken.length) fail(`${at} images not loading: ${broken.join(", ")}`);
      if (!font.loaded || !font.family.includes("Public Sans")) fail(`${at} Public Sans not rendering (${font.family})`);
      if (m.sw !== m.iw) fail(`${at} scrollWidth ${m.sw} != innerWidth ${m.iw}`);
      if (m.over.length) fail(`${at} crosses the right edge: ${m.over.slice(0, 4).join("; ")}`);
      if (m.clipped.length) fail(`${at} clipped: ${m.clipped.slice(0, 4).join("; ")}`);
      if (m.small.length) fail(`${at} targets under 24px: ${m.small.slice(0, 4).join("; ")}`);
      if (m.tiny.length) fail(`${at} text under 12px: ${m.tiny.slice(0, 4).join("; ")}`);
      if (m.hiddenShown) fail(`${at} ${m.hiddenShown} [hidden] element(s) displayed`);
      await page.addScriptTag({ content: axeSrc });
      const violations = await page.evaluate(async () =>
        (await window.axe.run(document)).violations.map(
          (v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`,
        ),
      );
      for (const v of violations) fail(`${at} axe ${v}`);
    }
    await page.goto(`${base}/`);
    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => {
      const el = document.activeElement;
      const b = el.getBoundingClientRect();
      return { cls: el.className, h: b.height, top: b.top };
    });
    if (skip.cls !== "skip" || skip.h < 24 || skip.top < 0) fail(`${w} skip link focused box ${JSON.stringify(skip)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (pages === 0) {
  console.log("NOT MEASURED: no pages inspected");
  process.exit(1);
}
console.log(`${pages} page renders inspected at ${widths.length} widths: ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
