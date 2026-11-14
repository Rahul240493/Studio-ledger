// Status / disconnect of the company Google account.
import { requirePartner, handle } from "@/lib/access";
import { loadAccount, removeAccount, oauthClient } from "@/lib/whiskey/gaccount";

export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  await requirePartner();
  const a = await loadAccount().catch(() => null);
  return a ? { connected: true, email: a.email, connectedBy: a.connectedBy, connectedAt: a.connectedAt } : { connected: false };
});
export const DELETE = handle(async () => {
  await requirePartner();
  const a = await loadAccount().catch(() => null);
  if (a?.refresh_token) { try { await oauthClient().revokeToken(a.refresh_token); } catch { /* already revoked */ } }
  await removeAccount();
  return { ok: true };
});
