import crypto from "crypto";

// Non-secret settings have built-in defaults, so only the three secrets need entering in Vercel:
// GOOGLE_CLIENT_SECRET, GOOGLE_PRIVATE_KEY and ANTHROPIC_API_KEY. Any env var still overrides.
const DEFAULTS = {
  GOOGLE_CLIENT_ID: "939721413171-74g3dfk9pivmh6d5sceqeuoa5rutm7n6.apps.googleusercontent.com",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "studio-ledger@studio-ledger-512411.iam.gserviceaccount.com",
  GOOGLE_SHEET_ID: "1jg1wfQkmXckCkLbz9Ivf1TRrebzXJwNFXSMLtTM-ZZo",
  GOOGLE_CALENDAR_ID: "fed60a675719439912b88be80181a9daa514e9a2a56a0373ee343db5ab0a1f10@group.calendar.google.com",
  PARTNER_EMAILS: "",
};
for (const [k, v] of Object.entries(DEFAULTS)) if (!process.env[k] && v) process.env[k] = v;

// Sign-in URL: the project's main Vercel address unless set explicitly.
if (!process.env.NEXTAUTH_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.NEXTAUTH_URL = "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL;
}
// Session-signing secret: derived from the Google secrets unless set explicitly.
if (!process.env.NEXTAUTH_SECRET && (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_PRIVATE_KEY)) {
  process.env.NEXTAUTH_SECRET = crypto.createHash("sha256")
    .update("studio-ledger:" + (process.env.GOOGLE_CLIENT_SECRET || "") + (process.env.GOOGLE_PRIVATE_KEY || ""))
    .digest("hex");
}
export {};
