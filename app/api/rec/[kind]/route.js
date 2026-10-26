import { currentUser, handle, uid } from "@/lib/access";
import { appendRows } from "@/lib/google";
import { kindOf } from "@/lib/recApi";
import { istToday } from "@/lib/ist";

// POST { item } or { items: [...] } — items are added in one write (used by standard ticket sets).
export const POST = handle(async (req, { params }) => {
  const me = await currentUser();
  const k = kindOf(params.kind);
  const body = await req.json();
  const list = Array.isArray(body.items) ? body.items.slice(0, 60) : [body.item || body];
  const now = Date.now();
  const rows = list.map((x, i) => {
    const r = { ...k.clean(x), id: uid(k.prefix) + i, createdBy: me.name, createdAt: new Date(now + i).toISOString() };
    if (params.kind === "tickets" && r.status === "Done") r.doneAt = new Date(now).toISOString();
    // Logged as already posted (often back-filled later): unless a "Posted on" day is given, count it as posted on its date.
    if (params.kind === "content" && r.status === "Posted" && !r.postedAt) { const t = istToday(); r.postedAt = r.date < t ? r.date : t; }
    if (params.kind === "updates") { r.date = istToday(); r.by = me.name; r.at = new Date(now).toISOString(); }
    return r;
  });
  await appendRows(k.tab, rows);
  return { ok: true, ids: rows.map((r) => r.id) };
});
