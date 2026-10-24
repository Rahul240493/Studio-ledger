import { requirePartner, handle, clearTeamCache } from "@/lib/access";
import { appendRows, readTab, updateRow } from "@/lib/google";
import { GROUPS } from "@/lib/config";
import { partnerEmails } from "@/lib/members";

const okEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export const POST = handle(async (req) => {
  const me = await requirePartner();
  const { email, name, title, group } = await req.json();
  const e = String(email || "").trim().toLowerCase();
  if (!okEmail(e)) return Response.json({ error: "Enter a valid Google email address." }, { status: 400 });
  if (partnerEmails().includes(e)) return Response.json({ error: "That person is already a partner." }, { status: 409 });
  if ((await readTab("Team")).some((t) => t.email.toLowerCase() === e)) return Response.json({ error: "Already on the team." }, { status: 409 });
  await appendRows("Team", [{ email: e, name: String(name || "").slice(0, 80), role: "Employee", addedBy: me.name, addedAt: new Date().toISOString(),
    title: String(title || "").slice(0, 80), group: GROUPS.includes(group) ? group : "Creative and production" }]);
  clearTeamCache();
  return { ok: true };
});

// Edit a person's name, job title and group. Works for employees already on the team and for partners;
// it never grants anyone new access.
export const PUT = handle(async (req) => {
  const me = await requirePartner();
  const { email, name, title, group } = await req.json();
  const e = String(email || "").trim().toLowerCase();
  const rows = await readTab("Team");
  const row = rows.find((t) => t.email.toLowerCase() === e);
  const patch = { name: String(name || "").slice(0, 80), title: String(title || "").slice(0, 80), group: GROUPS.includes(group) ? group : "Creative and production" };
  if (row) await updateRow("Team", row.email, { ...row, ...patch });
  else if (partnerEmails().includes(e)) await appendRows("Team", [{ email: e, role: "Partner", addedBy: me.name, addedAt: new Date().toISOString(), ...patch }]);
  else return Response.json({ error: "Add this person under Team access first." }, { status: 404 });
  clearTeamCache();
  return { ok: true };
});
