import { requirePartner, handle, uid } from "@/lib/access";
import { appendRows } from "@/lib/google";
import { cleanEntry } from "@/lib/entries";

export const POST = handle(async (req) => {
  const me = await requirePartner();
  const { entries } = await req.json();
  if (!Array.isArray(entries) || !entries.length) return Response.json({ error: "Nothing to save." }, { status: 400 });
  const now = new Date().toISOString();
  const rows = entries.map((x) => ({ ...cleanEntry(x), id: uid("E"), loggedBy: me.name, loggedAt: now }));
  await appendRows("Ledger", rows);
  return { saved: rows.length };
});
