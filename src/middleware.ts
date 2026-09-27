import { defineMiddleware } from "astro:middleware";

// README screenshots go through /_image, and the passthrough image service
// (astro.config.ts) reports no format for anything but SVG, so Astro sent
// them as "image/undefined". Browsers sniff past it; a stricter client, or
// nosniff, wouldn't. Name the type from the source file's extension.
const TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const onRequest = defineMiddleware(async ({ url }, next) => {
  const res = await next();
  if (url.pathname !== "/_image" || res.headers.get("content-type") !== "image/undefined") return res;
  const ext = url.searchParams.get("href")?.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (type) res.headers.set("content-type", type);
  return res;
});
