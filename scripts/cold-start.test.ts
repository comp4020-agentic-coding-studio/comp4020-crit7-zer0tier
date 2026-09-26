import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Fly stops the machine when idle, so the first visitor after a quiet spell
// waits for a cold boot. Most of the app's own share of that was Node
// resolving drizzle-orm's ~450 small files on the first request (~450 ms of
// ~650 ms locally, worse on a cold Fly disk). astro.config.ts bundles it
// into the server build instead. This asserts the build (which `pnpm test`
// runs first) only reaches node_modules for what can't be bundled: the
// native better-sqlite3 binding. A new runtime dependency lands here on
// purpose; bundle it (`vite.ssr.noExternal`) or add it with a reason.
const ALLOWED = new Set(["better-sqlite3"]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".mjs") ? [join(dir, e.name)] : [],
  );
}

/** Bare package specifiers a module imports at runtime ("pkg" or "@scope/pkg"). */
export function packageImports(source: string): string[] {
  const specs = [
    ...source.matchAll(/(?:^|[\n;])\s*(?:import|export)\b[^'"]*?\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/(?:^|[\n;])\s*import\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]!);
  return specs
    .filter((s) => !s.startsWith(".") && !s.startsWith("/") && !s.startsWith("node:"))
    .map((s) => s.split("/").slice(0, s.startsWith("@") ? 2 : 1).join("/"));
}

describe("packageImports", () => {
  it("finds single-line, multi-line, side-effect and dynamic imports", () => {
    const src = [
      'import { a } from "drizzle-orm/sqlite-core";',
      "import {\n  b,\n  c\n} from 'better-sqlite3';",
      'import "@scope/pkg/side";',
      'const m = await import("late-pkg");',
      'import { d } from "./local.mjs";',
      'import fs from "node:fs";',
      "throw new Error(\"import it from 'drizzle-orm/sqlite-core' instead\");",
    ].join("\n");
    expect(packageImports(src)).toEqual(["drizzle-orm", "better-sqlite3", "@scope/pkg", "late-pkg"]);
  });
});

describe("cold start", () => {
  it("the built server loads no package from node_modules except better-sqlite3", () => {
    const found = new Set(files("dist/server").flatMap((f) => packageImports(readFileSync(f, "utf8"))));
    expect([...found].filter((p) => !ALLOWED.has(p))).toEqual([]);
  });
});
