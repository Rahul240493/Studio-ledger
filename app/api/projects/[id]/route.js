import { currentUser, requirePartner, handle } from "@/lib/access";
import { readTab, updateRow, deleteRow } from "@/lib/google";
import { cleanProject } from "@/lib/records";

// Partners edit everything. Employees may move the stage and edit the plan and notes only.
export const PUT = handle(async (req, { params }) => {
  const me = await currentUser();
  const old = (await readTab("Projects")).find((p) => p.id === params.id);
  if (!old) return Response.json({ error: "That project no longer exists." }, { status: 404 });
  const body = await req.json();
  const allowed = me.isPartner ? body : { stage: body.stage, plan: body.plan, notes: body.notes };
  const p = cleanProject({ ...old, ...allowed });
  await updateRow("Projects", old.id, { ...old, ...p });
  return { ok: true };
});
export const DELETE = handle(async (req, { params }) => { await requirePartner(); await deleteRow("Projects", params.id); return { ok: true }; });
