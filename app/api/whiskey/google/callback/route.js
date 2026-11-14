// Google sends the partner back here after they allow access for the company account.
import { google } from "googleapis";
import { requirePartner } from "@/lib/access";
import { oauthClient, verify, saveAccount } from "@/lib/whiskey/gaccount";

export const dynamic = "force-dynamic";
const originOf = (req) => { const h = req.headers.get("x-forwarded-host") || req.headers.get("host"); const proto = req.headers.get("x-forwarded-proto") || (h?.startsWith("localhost") ? "http" : "https"); return `${proto}://${h}`; };
const back = (origin, status, msg) => Response.redirect(`${origin}/?whiskey=${status}${msg ? "&msg=" + encodeURIComponent(msg) : ""}`, 302);

export async function GET(req) {
  const origin = originOf(req);
  const u = new URL(req.url);
  try {
    const me = await requirePartner();
    const st = verify(u.searchParams.get("state"));
    if (!st || st.by !== me.email) return back(origin, "error", "That sign-in link expired. Try connecting again.");
    if (u.searchParams.get("error")) return back(origin, "error", "Google sign-in was cancelled.");
    const oc = oauthClient(origin);
    const { tokens } = await oc.getToken(u.searchParams.get("code"));
    if (!tokens.refresh_token) return back(origin, "error", "Google didn't give long-term access. Remove Studio Ledger at myaccount.google.com/permissions for that account, then connect again.");
    oc.setCredentials(tokens);
    const info = (await google.oauth2({ version: "v2", auth: oc }).userinfo.get()).data;
    const granted = String(tokens.scope || "");
    const missing = ["gmail.readonly", "gmail.send", "calendar", "drive.readonly"].filter((s) => !granted.includes(s));
    await saveAccount({ refresh_token: tokens.refresh_token, email: info.email, connectedBy: me.name, connectedAt: new Date().toISOString(), scope: granted });
    return back(origin, missing.length ? "partial" : "connected", missing.length ? `Connected, but these weren't allowed: ${missing.join(", ")}. Reconnect and tick every box.` : "");
  } catch (e) {
    console.error("Whiskey Google connect failed", e);
    return back(origin, "error", /redirect_uri_mismatch/.test(String(e)) ? "Google needs this app's callback address added to the OAuth client (see setup)." : "Couldn't connect the Google account: " + (e.message || "unknown error"));
  }
}
