import { describe, expect, inject, it } from "vitest";

// Every image /readme/ references loads, with the type its file actually
// is. Two real failures behind this: every screenshot once 500'd (the
// default image service needed sharp), and the passthrough service that
// fixed that sent "image/undefined" (src/middleware.ts). Expected types are
// literals, not derived from the same extension logic the middleware uses.
const baseUrl = inject("baseUrl");

const EXPECTED: Record<string, string> = {
  "after-week": "image/webp",
  "after-phone": "image/webp",
  "anu-logo": "image/svg+xml",
};

describe("readme images", () => {
  it("serves each with a 200, a body and its real content type", async () => {
    const html = await (await fetch(new URL("/readme/", baseUrl))).text();
    const srcs = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&#38;", "&").replaceAll("&amp;", "&"));
    const seen: Record<string, string> = {};
    for (const src of srcs) {
      const name = Object.keys(EXPECTED).find((n) => src.includes(n));
      if (!name) continue;
      const res = await fetch(new URL(src, baseUrl));
      expect(res.status, src).toBe(200);
      expect((await res.arrayBuffer()).byteLength, src).toBeGreaterThan(0);
      seen[name] = res.headers.get("content-type") ?? "";
    }
    expect(seen).toEqual(EXPECTED);
  });
});
