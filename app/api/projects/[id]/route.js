import { currentUser, requirePartner, handle } from "@/lib/access";
import { readTab, updateRow, deleteRow, deleteRows } from "@/lib/google";
import { cleanProject } from "@/lib/records";

// Everyone can edit a project's brief, stage and team. Only partners can change the budget.
export const PUT = handle(async (req, { params }) => {
  const me = await currentUser();
  const old = (await readTab("Projects")).find((p) => p.id === params.id);
  if (!old) return Response.json({ error: "That project no longer exists." }, { status: 404 });
  const body = await req.json();
  if (!me.isPartner) delete body.budget;
  const p = cleanProject({ ...old, ...body });
  await updateRow("Projects", old.id, { ...old, ...p });
  return { ok: true };
});

// Deleting a project also removes its tickets, posts and updates.
export const DELETE = handle(async (req, { params }) => {
  await requirePartner();
  for (const tab of ["Tickets", "Content", "Updates"]) {
    const rows = await readTab(tab).catch(() => []);
    await deleteRows(tab, rows.filter((r) => r.projectId === params.id).map((r) => r.id));
  }
  await deleteRow("Projects", params.id);
  return { ok: true };
});
