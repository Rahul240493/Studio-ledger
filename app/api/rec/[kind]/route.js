import { currentUser, handle, uid } from "@/lib/access";
import { appendRows, readTab, updateRows } from "@/lib/google";
import { postedDefaults, slotUpdates } from "@/lib/contentRules";
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
    if (params.kind === "content") postedDefaults(r, null);
    if (params.kind === "updates") { r.date = istToday(); r.by = me.name; r.at = new Date(now).toISOString(); }
    return r;
  });
  let slots = [];
  if (params.kind === "content" && rows.some((r) => r.linkedTo)) slots = slotUpdates(rows, await readTab("Content"));
  await appendRows(k.tab, rows);
  if (slots.length) await updateRows("Content", slots);
  return { ok: true, ids: rows.map((r) => r.id) };
});
