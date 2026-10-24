import { currentUser, handle } from "@/lib/access";
import { readTab, updateRow, deleteRow } from "@/lib/google";
import { kindOf } from "@/lib/recApi";

// PUT accepts a partial change, e.g. { status: "Done" } from a dropdown in a list.
export const PUT = handle(async (req, { params }) => {
  await currentUser();
  const k = kindOf(params.kind);
  const old = (await readTab(k.tab)).find((r) => r.id === params.id);
  if (!old) return Response.json({ error: "That item no longer exists. Refresh and try again." }, { status: 404 });
  const next = { ...old, ...k.clean({ ...old, ...(await req.json()) }) };
  if (params.kind === "tickets") {
    if (next.status === "Done" && old.status !== "Done") next.doneAt = new Date().toISOString();
    if (next.status !== "Done") next.doneAt = "";
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
