import type { APIRoute } from "astro";
import { setHomeView } from "../../lib/db";

// The quick-access option: which view the home page opens to. Stored in
// SQLite, so it holds across reloads, devices and redeploys.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const view = form.get("homeView");
  if (view !== "week" && view !== "today") {
    return new Response("homeView must be week or today", { status: 400 });
  }
  setHomeView(view);
  return redirect("/?saved=1", 303);
};
