import node from "@astrojs/node";
import { defineConfig, passthroughImageService } from "astro/config";

// Server-rendered output: pages render per request so they can read the
// database, and `astro build` emits the Node server the Dockerfile runs.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // README screenshots go through Astro's image endpoint; the default
  // service needs the native `sharp` package, which isn't installed, so it
  // 500'd every image on /readme/. Passthrough serves the files as they are.
  image: { service: passthroughImageService() },
  security: {
    // Fly's proxy terminates TLS, so naming the deploy domain is what lets
    // Astro trust x-forwarded-proto and accept same-origin form POSTs.
    allowedDomains: [{ hostname: "**.fly.dev", protocol: "https" }],
  },
});
