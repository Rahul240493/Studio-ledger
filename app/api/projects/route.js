import { requirePartner, handle, uid } from "@/lib/access";
import { appendRows, readTab } from "@/lib/google";
import { cleanProject } from "@/lib/records";

export const POST = handle(async (req) => {
  const me = await requirePartner();
  const p = cleanProject(await req.json());
  const existing = await readTab("Projects");
  if (existing.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) return Response.json({ error: "A project with that name already exists." }, { status: 409 });
  await appendRows("Projects", [{ ...p, id: uid("P"), createdBy: me.name, createdAt: new Date().toISOString() }]);
  return { ok: true };
});
