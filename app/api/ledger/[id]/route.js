import { requirePartner, handle } from "@/lib/access";
import { readTab, updateRow, deleteRow } from "@/lib/google";
import { cleanEntry } from "@/lib/entries";

export const PUT = handle(async (req, { params }) => {
  await requirePartner();
  const old = (await readTab("Ledger")).find((e) => e.id === params.id);
  if (!old) return Response.json({ error: "That entry no longer exists." }, { status: 404 });
  const body = await req.json();
  const e = { ...cleanEntry({ ...old, ...body, file: old.file, note: old.note }), id: old.id, loggedBy: old.loggedBy, loggedAt: old.loggedAt };
  await updateRow("Ledger", old.id, e);
  return { ok: true };
});
export const DELETE = handle(async (req, { params }) => { await requirePartner(); await deleteRow("Ledger", params.id); return { ok: true }; });
