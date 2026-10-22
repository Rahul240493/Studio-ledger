import { currentUser, handle, uid } from "@/lib/access";
import { appendRows } from "@/lib/google";
import { cleanPerson } from "@/lib/records";

export const POST = handle(async (req) => {
  const me = await currentUser();
  const p = cleanPerson(await req.json());
  if (!me.isPartner) { p.rate = 0; p.rateUnit = ""; }
  await appendRows("People", [{ ...p, id: uid("C"), createdBy: me.name, createdAt: new Date().toISOString() }]);
  return { ok: true };
});
