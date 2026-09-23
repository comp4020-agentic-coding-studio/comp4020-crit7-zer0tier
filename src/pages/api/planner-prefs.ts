import type { APIRoute } from "astro";
import { setPlannerPrefs } from "../../lib/db";

// Planner preferences, saved in SQLite so they hold across reloads.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const num = (name: string, lo: number, hi: number) => {
    const v = Number(form.get(name));
    return form.get(name) && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  };
  setPlannerPrefs({ notBefore: num("notBefore", 0, 1440), notAfter: num("notAfter", 0, 1440), freeDay: num("freeDay", 1, 5) });
  return redirect("/planner/?saved=1", 303);
};
