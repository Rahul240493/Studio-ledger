import "./settings";
import { google } from "googleapis";
import { TABS, NUMERIC } from "./config";

let _auth;

// Accepts the private key however it was pasted into Vercel: the bare key, the key with
// literal "\n"s or quotes, the whole "private_key": "..." line, or the entire JSON key file.
function serviceAccount() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_PRIVATE_KEY || "").trim();
  if (raw.startsWith("{")) {
    try { const j = JSON.parse(raw); raw = j.private_key || raw; if (j.client_email) email = j.client_email; } catch {}
  }
  const m = raw.match(/"?private_key"?\s*:\s*"([\s\S]*?)"/);
  if (m) raw = m[1];
  raw = raw.replace(/^["']+|["',]+$/g, "").replace(/\\n/g, "\n").replace(/\\r/g, "");
  const body = raw.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  let key = raw;
  if (body) {
    const b64 = body[1].replace(/[^A-Za-z0-9+/=]/g, "");
    key = "-----BEGIN PRIVATE KEY-----\n" + (b64.match(/.{1,64}/g) || []).join("\n") + "\n-----END PRIVATE KEY-----\n";
  }
  return { email, key };
}
function auth() {
  if (_auth) return _auth;
  const { email, key } = serviceAccount();
  if (!email || !key) throw new Error("Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).");
  _auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/calendar"],
  });
  return _auth;
}
export const sheetsApi = () => google.sheets({ version: "v4", auth: auth() });
export const calendarApi = () => google.calendar({ version: "v3", auth: auth() });
const SHEET = () => {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set.");
  return id;
};
const colLetter = (n) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function normDate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}
const DATE_COLS = new Set(["date", "endDate", "start", "end"]);
const num = (v) => { if (v === "" || v === null || v === undefined) return 0; if (typeof v === "number") return v; const n = parseFloat(String(v).replace(/[₹,\s%]/g, "")); return isFinite(n) ? n : 0; };

// Schedule start/end are times, not dates; only treat Projects' start/end as dates.
function clean(tab, o) {
  for (const k of Object.keys(o)) {
    if (NUMERIC.has(k)) o[k] = num(o[k]);
    else if (k === "date" || k === "endDate" || k === "deadline" || (tab === "Projects" && DATE_COLS.has(k))) o[k] = normDate(o[k]);
    else if (o[k] === null || o[k] === undefined) o[k] = "";
    else o[k] = typeof o[k] === "number" && (k === "start" || k === "end" || k === "callTime") ? serialToTime(o[k]) : String(o[k]);
  }
  return o;
}
function serialToTime(f) { const mins = Math.round((f % 1) * 1440); return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`; }

function toObjects(tab, rows) {
  const { cols } = TABS[tab];
  const key = tab === "Team" ? "email" : "id";
  return (rows || [])
    .map((r, i) => { const o = { _row: i + 2 }; cols.forEach((c, j) => (o[c] = r[j] ?? "")); return clean(tab, o); })
    .filter((o) => o[key]);
}

// Reads several tabs in one request. Tabs missing from the Sheet come back as null.
export async function readTabs(tabs) {
  const meta = await sheetsApi().spreadsheets.get({ spreadsheetId: SHEET(), fields: "sheets.properties(title)" });
  const have = new Set(meta.data.sheets.map((s) => s.properties.title));
  const present = tabs.filter((t) => have.has(t));
  const out = Object.fromEntries(tabs.map((t) => [t, null]));
  if (!present.length) return out;
  const res = await sheetsApi().spreadsheets.values.batchGet({
    spreadsheetId: SHEET(),
    ranges: present.map((t) => `${t}!A2:${colLetter(TABS[t].cols.length - 1)}`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  (res.data.valueRanges || []).forEach((vr, i) => { out[present[i]] = toObjects(present[i], vr.values); });
  return out;
}

export async function readTab(tab) {
  const { cols } = TABS[tab];
  const res = await sheetsApi().spreadsheets.values.get({
    spreadsheetId: SHEET(),
    range: `${tab}!A2:${colLetter(cols.length - 1)}`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const rows = res.data.values || [];
  const key = tab === "Team" ? "email" : "id";
  return rows
    .map((r, i) => { const o = { _row: i + 2 }; cols.forEach((c, j) => (o[c] = r[j] ?? "")); return clean(tab, o); })
    .filter((o) => o[key]);
}

const toRow = (tab, obj) => TABS[tab].cols.map((c) => { const v = obj[c]; if (v === undefined || v === null) return ""; return v; });

export async function appendRows(tab, objs) {
  await sheetsApi().spreadsheets.values.append({
    spreadsheetId: SHEET(),
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objs.map((o) => toRow(tab, o)) },
  });
}

async function findRow(tab, keyVal) {
  const res = await sheetsApi().spreadsheets.values.get({ spreadsheetId: SHEET(), range: `${tab}!A2:A` });
  const i = (res.data.values || []).findIndex((r) => String(r[0]).toLowerCase() === String(keyVal).toLowerCase());
  if (i < 0) { const e = new Error("That record no longer exists. Refresh and try again."); e.status = 404; throw e; }
  return i + 2;
}

export async function updateRow(tab, keyVal, obj) {
  const r = await findRow(tab, keyVal);
  const last = colLetter(TABS[tab].cols.length - 1);
  await sheetsApi().spreadsheets.values.update({
    spreadsheetId: SHEET(),
    range: `${tab}!A${r}:${last}${r}`,
    valueInputOption: "RAW",
    requestBody: { values: [toRow(tab, obj)] },
  });
}

let _sheetIds = null;
async function sheetIdOf(tab) {
  if (!_sheetIds || _sheetIds[tab] === undefined) {
    const meta = await sheetsApi().spreadsheets.get({ spreadsheetId: SHEET(), fields: "sheets.properties(sheetId,title)" });
    _sheetIds = Object.fromEntries(meta.data.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  }
  return _sheetIds[tab];
}

export async function deleteRow(tab, keyVal) {
  const r = await findRow(tab, keyVal);
  const sheetId = await sheetIdOf(tab);
  await sheetsApi().spreadsheets.batchUpdate({
    spreadsheetId: SHEET(),
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } }] },
  });
}

// Deletes many rows at once (bottom-up so row numbers stay valid). Unknown ids are skipped.
export async function deleteRows(tab, ids) {
  if (!ids.length) return;
  const res = await sheetsApi().spreadsheets.values.get({ spreadsheetId: SHEET(), range: `${tab}!A2:A` });
  const want = new Set(ids.map((x) => String(x).toLowerCase()));
  const rows = (res.data.values || []).map((r, i) => (want.has(String(r[0]).toLowerCase()) ? i + 2 : 0)).filter(Boolean).sort((a, b) => b - a);
  if (!rows.length) return;
  const sheetId = await sheetIdOf(tab);
  await sheetsApi().spreadsheets.batchUpdate({
    spreadsheetId: SHEET(),
    requestBody: { requests: rows.map((r) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } })) },
  });
}

// Creates any missing tabs and (re)writes every tab's header row. Safe to run repeatedly.
export async function ensureTabs() {
  const api = sheetsApi();
  const meta = await api.spreadsheets.get({ spreadsheetId: SHEET(), fields: "sheets.properties(sheetId,title,gridProperties)" });
  const have = meta.data.sheets.map((s) => s.properties.title);
  const add = Object.keys(TABS).filter((t) => !have.includes(t)).map((title) => ({
    addSheet: { properties: { title, gridProperties: { frozenRowCount: 1, columnCount: Math.max(TABS[title].cols.length, 10) } } },
  }));
  // Existing tabs may be narrower than the columns we now write (e.g. a new "Plan" column).
  const widen = meta.data.sheets
    .filter((s) => TABS[s.properties.title] && (s.properties.gridProperties?.columnCount || 0) < TABS[s.properties.title].cols.length)
    .map((s) => ({ appendDimension: { sheetId: s.properties.sheetId, dimension: "COLUMNS", length: TABS[s.properties.title].cols.length - s.properties.gridProperties.columnCount } }));
  if (add.length || widen.length) await api.spreadsheets.batchUpdate({ spreadsheetId: SHEET(), requestBody: { requests: [...add, ...widen] } });
  _sheetIds = null;
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET(),
    requestBody: {
      valueInputOption: "RAW",
      data: Object.entries(TABS).map(([t, d]) => ({ range: `${t}!A1:${colLetter(d.cols.length - 1)}1`, values: [d.head] })),
    },
  });
  return { created: add.map((a) => a.addSheet.properties.title) };
}
