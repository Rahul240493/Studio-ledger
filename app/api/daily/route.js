import { currentUser, handle } from "@/lib/access";
import { readTab, appendRows, updateRow } from "@/lib/google";
import { LATE_AFTER_DEFAULT } from "@/lib/config";
import { istParts } from "@/lib/ist";

const s = (v, n) => String(v ?? "").trim().slice(0, n);

// POST { action: "in", plan, projects } or { action: "out", done, pending } or { action: "edit", plan, done, pending }
export const POST = handle(async (req) => {
  const me = await currentUser();
  const body = await req.json();
  const now = new Date();
  const { date, time } = istParts(now);
  const id = `${date}|${me.email}`;
  const rows = await readTab("Daily");
  const mine = rows.find((r) => r.id.toLowerCase() === id.toLowerCase());

  if (body.action === "in") {
    if (mine) return Response.json({ error: "You've already checked in today." }, { status: 409 });
    const plan = s(body.plan, 3000);
    if (!plan) return Response.json({ error: "Write what you'll work on today." }, { status: 400 });
    const lateAfter = process.env.LATE_AFTER || LATE_AFTER_DEFAULT;
    await appendRows("Daily", [{
      id, date, email: me.email, name: me.name, checkIn: now.toISOString(), plan,
      projects: (Array.isArray(body.projects) ? body.projects : []).map((p) => s(p, 120)).filter(Boolean).join(", "),
      checkOut: "", done: "", pending: "", hours: "", late: time > lateAfter ? "Yes" : "",
    }]);
    return { ok: true };
  }
  if (!mine) return Response.json({ error: "Check in first." }, { status: 400 });
  if (body.action === "out") {
    if (mine.checkOut) return Response.json({ error: "You've already checked out today." }, { status: 409 });
    const done = s(body.done, 3000);
    if (!done) return Response.json({ error: "Write what got finished today." }, { status: 400 });
    const hours = Math.round(((now - new Date(mine.checkIn)) / 36e5) * 10) / 10;
    await updateRow("Daily", mine.id, { ...mine, checkOut: now.toISOString(), done, pending: s(body.pending, 3000), hours });
    return { ok: true };
  }
  if (body.action === "edit") {
    await updateRow("Daily", mine.id, {
      ...mine,
      plan: body.plan !== undefined ? s(body.plan, 3000) || mine.plan : mine.plan,
      done: mine.checkOut && body.done !== undefined ? s(body.done, 3000) : mine.done,
      pending: mine.checkOut && body.pending !== undefined ? s(body.pending, 3000) : mine.pending,
    });
    return { ok: true };
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
});
