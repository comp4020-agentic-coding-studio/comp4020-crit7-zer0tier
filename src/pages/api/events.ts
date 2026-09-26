import type { APIRoute } from "astro";
import { timetableVersion } from "../../lib/db";
import { bus } from "../../lib/events";

// Server-sent events: every open timetable tab hears when an allocation
// changes, so a second tab or device knows it's out of date. SSE is
// one-directional (server → browser) and plain HTTP. A client receiving an
// event only shows a banner; it never writes, so an event can't cause one.
//
// Every event, the first included, carries timetableVersion(). The home page
// closes its stream while hidden or idle (an open stream keeps the Fly
// machine from ever stopping) and compares the version on reconnect, so a
// change made while it wasn't listening isn't missed.
export const GET: APIRoute = () => {
  let onChange: (change: unknown) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      controller.enqueue(`data: ${JSON.stringify({ version: timetableVersion() })}\n\n`);
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = (change) => {
        controller.enqueue(`data: ${JSON.stringify({ ...(change as object), version: timetableVersion() })}\n\n`);
      };
      bus.on("change", onChange);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("change", onChange);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
