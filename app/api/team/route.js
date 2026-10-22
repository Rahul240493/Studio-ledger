import { requirePartner, handle, clearTeamCache } from "@/lib/access";
import { appendRows, readTab } from "@/lib/google";

export const POST = handle(async (req) => {
  const me = await requirePartner();
  const { email, name } = await req.json();
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return Response.json({ error: "Enter a valid Google email address." }, { status: 400 });
  const partners = (process.env.PARTNER_EMAILS || "").toLowerCase();
  if (partners.split(/[,\s]+/).includes(e)) return Response.json({ error: "That person is already a partner." }, { status: 409 });
  if ((await readTab("Team")).some((t) => t.email.toLowerCase() === e)) return Response.json({ error: "Already on the team." }, { status: 409 });
  await appendRows("Team", [{ email: e, name: String(name || "").slice(0, 80), role: "Employee", addedBy: me.name, addedAt: new Date().toISOString() }]);
  clearTeamCache();
  return { ok: true };
});
