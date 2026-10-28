// Each person's private "Connect Claude" link. Only a hash of the key is stored; the full link is shown once.
import { randomBytes } from "crypto";
import { currentUser, handle, clearTeamCache } from "@/lib/access";
import { readTab, updateRow, appendRows } from "@/lib/google";
import { hashKey } from "@/lib/mcp";

async function myRow(me) { return (await readTab("Team")).find((r) => String(r.email).toLowerCase() === me.email); }

export const GET = handle(async () => {
  const me = await currentUser();
  const row = await myRow(me);
  return { connected: !!row?.mcpKey, since: row?.mcpKeyAt || "" };
});

export const POST = handle(async (req) => {
  const me = await currentUser();
  const key = randomBytes(24).toString("base64url");
  const patch = { mcpKey: hashKey(key), mcpKeyAt: new Date().toISOString() };
  const row = await myRow(me);
  if (row) await updateRow("Team", row.email, { ...row, ...patch });
  else await appendRows("Team", [{ email: me.email, name: me.name, role: me.isPartner ? "Partner" : "Employee", addedBy: me.name, addedAt: patch.mcpKeyAt, ...patch }]);
  clearTeamCache();
  const origin = req.headers.get("x-forwarded-host") ? `https://${req.headers.get("x-forwarded-host")}` : new URL(req.url).origin;
  return { url: `${origin}/api/mcp/${key}` };
});

export const DELETE = handle(async () => {
  const me = await currentUser();
  const row = await myRow(me);
  if (row?.mcpKey) await updateRow("Team", row.email, { ...row, mcpKey: "", mcpKeyAt: "" });
  return { ok: true };
});
