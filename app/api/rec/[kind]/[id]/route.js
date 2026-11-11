import { currentUser, handle } from "@/lib/access";
import { readTab, updateRow, updateRows, deleteRow } from "@/lib/google";
import { postedDefaults, slotUpdates } from "@/lib/contentRules";
import { kindOf } from "@/lib/recApi";
import { istToday } from "@/lib/ist";

// PUT accepts a partial change, e.g. { status: "Done" } from a dropdown in a list.
export const PUT = handle(async (req, { params }) => {
  await currentUser();
  const k = kindOf(params.kind);
  const all = await readTab(k.tab);
  const old = all.find((r) => r.id === params.id);
  if (!old) return Response.json({ error: "That item no longer exists. Refresh and try again." }, { status: 404 });
  const next = { ...old, ...k.clean({ ...old, ...(await req.json()) }) };
  if (params.kind === "tickets") {
    if (next.status === "Done" && old.status !== "Done") next.doneAt = new Date().toISOString();
    if (next.status !== "Done") next.doneAt = "";
  }
  if (params.kind === "content") {
    postedDefaults(next, old);
    const slots = next.linkedTo && next.linkedTo !== old.linkedTo ? slotUpdates([next], all) : [];
    await updateRows("Content", [next, ...slots]);
    return { ok: true };
  }
  await updateRow(k.tab, old.id, next);
  return { ok: true };
});

export const DELETE = handle(async (req, { params }) => {
  await currentUser();
  const k = kindOf(params.kind);
  await deleteRow(k.tab, params.id);
  return { ok: true };
});
