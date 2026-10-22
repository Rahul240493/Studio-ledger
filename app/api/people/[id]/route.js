import { currentUser, handle } from "@/lib/access";
import { readTab, updateRow, deleteRow } from "@/lib/google";
import { cleanPerson } from "@/lib/records";

export const PUT = handle(async (req, { params }) => {
  const me = await currentUser();
  const old = (await readTab("People")).find((p) => p.id === params.id);
  if (!old) return Response.json({ error: "That person is no longer in the directory." }, { status: 404 });
  const p = cleanPerson({ ...old, ...(await req.json()) });
  if (!me.isPartner) { p.rate = old.rate; p.rateUnit = old.rateUnit; } // employees never see or change rates
  await updateRow("People", old.id, { ...old, ...p });
  return { ok: true };
});
export const DELETE = handle(async (req, { params }) => { await currentUser(); await deleteRow("People", params.id); return { ok: true }; });
