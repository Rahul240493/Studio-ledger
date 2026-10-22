import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";
import { readTab } from "./google";

const partners = () =>
  (process.env.PARTNER_EMAILS || "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

let teamCache = { at: 0, rows: [] };
async function team() {
  if (Date.now() - teamCache.at < 60_000) return teamCache.rows;
  try { teamCache = { at: Date.now(), rows: await readTab("Team") }; } catch { /* tab may not exist yet */ }
  return teamCache.rows;
}
export function clearTeamCache() { teamCache.at = 0; }

// "partner" | "employee" | null
export async function roleFor(email) {
  if (!email) return null;
  const e = email.toLowerCase();
  if (partners().includes(e)) return "partner";
  const t = (await team()).find((r) => String(r.email).toLowerCase() === e);
  if (!t) return null;
  return "employee"; // partners come only from PARTNER_EMAILS, never from the sheet
}

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export async function currentUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new HttpError(401, "Please sign in.");
  const role = await roleFor(email);
  if (!role) throw new HttpError(403, "This Google account doesn't have access. Ask a partner to add you.");
  return { email: email.toLowerCase(), name: session.user.name || email, role, isPartner: role === "partner" };
}
export async function requirePartner() {
  const u = await currentUser();
  if (!u.isPartner) throw new HttpError(403, "Only partners can see financial information.");
  return u;
}

// Wraps a route handler with JSON error handling.
export function handle(fn) {
  return async (req, ctx) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e) {
      let status = e.status || 500, msg = e.message || "Something went wrong.";
      if (!e.status && (e.code === 403 || e.code === 404) && e.config) {
        status = 502;
        msg = "The app can't open the Google Sheet or Calendar. Check they're shared with the app's service account (see setup guide).";
      }
      if (status >= 500) console.error(e);
      return Response.json({ error: msg }, { status });
    }
  };
}
export const uid = (p) => p + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
