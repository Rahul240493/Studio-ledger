// Starts Google sign-in for the company account (Gmail, Calendar, Drive).
import { requirePartner, handle } from "@/lib/access";
import { oauthClient, SCOPES, sign } from "@/lib/whiskey/gaccount";

export const dynamic = "force-dynamic";
const originOf = (req) => { const h = req.headers.get("x-forwarded-host") || req.headers.get("host"); const proto = req.headers.get("x-forwarded-proto") || (h?.startsWith("localhost") ? "http" : "https"); return `${proto}://${h}`; };
export const GET = handle(async (req) => {
  const me = await requirePartner();
  const url = oauthClient(originOf(req)).generateAuthUrl({ access_type: "offline", prompt: "consent select_account", include_granted_scopes: true, scope: SCOPES, state: sign({ by: me.email }, 15) });
  return Response.redirect(url, 302);
});
