import { currentUser, handle, uid } from "@/lib/access";
import { appendRows, readTab } from "@/lib/google";
import { cleanProject } from "@/lib/records";
import { PALETTE } from "@/lib/config";

// Anyone on the team can add a project. Only partners can set its budget.
export const POST = handle(async (req) => {
  const me = await currentUser();
  const body = await req.json();
  if (!me.isPartner) body.budget = 0;
  const p = cleanProject(body);
  const existing = await readTab("Projects");
  if (existing.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) return Response.json({ error: "A project with that name already exists." }, { status: 409 });
  if (!p.color) {
    const used = new Set(existing.map((x) => x.color));
    p.color = PALETTE.find((c) => !used.has(c)) || PALETTE[existing.length % PALETTE.length];
  }
  const id = uid("P");
  await appendRows("Projects", [{ ...p, id, createdBy: me.name, createdAt: new Date().toISOString() }]);
  return { ok: true, id };
});
