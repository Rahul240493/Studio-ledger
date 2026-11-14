// The company Google account Whiskey works with (Gmail, Calendar, Drive).
// A partner connects it once; the refresh token is encrypted and kept in private Blob storage,
// never in the Google Sheet (which other people can open).
import "../settings";
import crypto from "crypto";
import { google } from "googleapis";
import { put, get, del } from "@vercel/blob";

export const SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
];
const TOKEN_PATH = "whiskey/google-account.json";
const key = () => crypto.createHash("sha256").update("whiskey-google:" + (process.env.NEXTAUTH_SECRET || "")).digest();

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
}
function open(text) {
  const o = JSON.parse(text);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(o.iv, "base64"));
  d.setAuthTag(Buffer.from(o.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, "base64")), d.final()]).toString("utf8"));
}

// Signed, short-lived values (OAuth state, confirm-action tickets).
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

export const redirectUri = (origin) => `${origin}/api/whiskey/google/callback`;
export function oauthClient(origin) {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, origin ? redirectUri(origin) : undefined);
}

let cached = { at: 0, acct: null };
export async function loadAccount() {
  if (cached.acct && Date.now() - cached.at < 5 * 60_000) return cached.acct;
  let res;
  try { res = await get(TOKEN_PATH, { access: "private" }); } catch { return null; }
  if (!res) return null;
  const text = await new Response(res.stream).text();
  try { cached = { at: Date.now(), acct: open(text) }; } catch { return null; }
  return cached.acct;
}
export async function saveAccount(acct) {
  await put(TOKEN_PATH, seal(acct), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
  cached = { at: Date.now(), acct };
}
export async function removeAccount() {
  cached = { at: 0, acct: null };
  try { await del(TOKEN_PATH); } catch { /* already gone */ }
}

export class NotConnected extends Error {
  constructor() { super("The company Google account isn't connected yet. A partner can connect it from Whiskey's settings (the gear in the Whiskey panel)."); this.status = 409; }
}
async function authed() {
  const acct = await loadAccount();
  if (!acct?.refresh_token) throw new NotConnected();
  const c = oauthClient();
  c.setCredentials({ refresh_token: acct.refresh_token });
  return c;
}
export const gmail = async () => google.gmail({ version: "v1", auth: await authed() });
export const gcal = async () => google.calendar({ version: "v3", auth: await authed() });
export const gdrive = async () => google.drive({ version: "v3", auth: await authed() });

// Turns Google's "token expired or revoked" into a clear message.
export function friendlyGoogleError(e) {
  const m = String(e?.message || e);
  if (/invalid_grant/i.test(m)) return "Google disconnected the company account (its sign-in expired or was revoked). Reconnect it from Whiskey's settings.";
  if (/insufficient|scope/i.test(m)) return "The company account was connected without the needed permissions. Reconnect it from Whiskey's settings and tick every box Google shows.";
  if (/has not been used|is disabled|accessNotConfigured/i.test(m)) return "That Google API isn't switched on for the Studio Ledger project yet (Gmail API or Drive API in Google Cloud).";
  return null;
}
