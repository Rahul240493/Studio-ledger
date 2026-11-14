// Signed, short-lived confirm-action tickets for Whiskey's cards.
import "../settings";
import crypto from "crypto";

const key = () => crypto.createHash("sha256").update("whiskey-ticket:" + (process.env.NEXTAUTH_SECRET || "")).digest();

export function sign(payload, minutes = 15) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + minutes * 60_000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
export function verify(token) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const want = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return p.exp > Date.now() ? p : null;
}
