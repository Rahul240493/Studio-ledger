import "./settings";
import { google } from "googleapis";
import { TABS, NUMERIC } from "./config";

let _sheetIds = null;

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

// --- Quota protection -------------------------------------------------------------------------
// Google allows a service account about 60 Sheets reads a minute, shared by the whole team.
// So: retry briefly when Google says "quota exceeded", and keep a short-lived copy of each tab
// in memory so repeated reads (page reloads, Claude tool calls) don't each hit Google.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryable = (e) => {
  const code = e?.code || e?.response?.status || e?.status;
  return code === 429 || code === 500 || code === 502 || code === 503 || /quota|rate limit|ECONNRESET|ETIMEDOUT|socket hang up/i.test(String(e?.message || ""));
};
export async function withRetry(fn, tries = 5) {
  let wait = 700;
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries - 1 || !retryable(e)) {
        if (/quota/i.test(String(e?.message || ""))) { const x = new Error("Google Sheets is busy (too many requests this minute). Wait a few seconds and try again."); x.status = 503; throw x; }
        throw e;
      }
      await sleep(wait + Math.random() * 300); wait *= 2;
    }
  }
}
const TTL = 20_000; // a tab read is reused for up to 20 seconds
const cache = {}; // tab -> { at, rows }
let metaCache = { at: 0, titles: null };
const copyRows = (rows) => rows.map((o) => ({ ...o }));
export function invalidate(tab) { if (tab) delete cache[tab]; else for (const k of Object.keys(cache)) delete cache[k]; }
async function tabTitles() {
  if (metaCache.titles && Date.now() - metaCache.at < 10 * 60_000) return metaCache.titles;
  const meta = await withRetry(() => sheetsApi().spreadsheets.get({ spreadsheetId: SHEET(), fields: "sheets.properties(sheetId,title)" }));
  metaCache = { at: Date.now(), titles: new Set(meta.data.sheets.map((s) => s.properties.title)) };
  _sheetIds = Object.fromEntries(meta.data.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  return metaCache.titles;
}

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
    else if (k === "date" || k === "endDate" || k === "deadline" || k === "postedAt" || k === "requestedOn" || (tab === "Projects" && DATE_COLS.has(k))) o[k] = normDate(o[k]);
    else if (o[k] === null || o[k] === undefined) o[k] = "";
    else o[k] = typeof o[k] === "number" && (k === "start" || k === "end" || k === "callTime" || k === "postTime") ? serialToTime(o[k]) : String(o[k]);
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

// Reads several tabs in one request (only the ones not already cached). Tabs missing from the Sheet come back as null.
export async function readTabs(tabs) {
  const have = await tabTitles();
  const out = Object.fromEntries(tabs.map((t) => [t, null]));
  const now = Date.now();
  const stale = [];
  for (const t of tabs) {
    if (!have.has(t)) continue;
    if (cache[t] && now - cache[t].at < TTL) out[t] = copyRows(cache[t].rows); else stale.push(t);
  }
  if (!stale.length) return out;
  const res = await withRetry(() => sheetsApi().spreadsheets.values.batchGet({
    spreadsheetId: SHEET(),
    ranges: stale.map((t) => `${t}!A2:${colLetter(TABS[t].cols.length - 1)}`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  }));
  (res.data.valueRanges || []).forEach((vr, i) => {
    const rows = toObjects(stale[i], vr.values);
    cache[stale[i]] = { at: Date.now(), rows };
    out[stale[i]] = copyRows(rows);
  });
  return out;
}

export async function readTab(tab) {
  const t = await readTabs([tab]);
  if (!t[tab]) { const e = new Error(`The "${tab}" tab is missing from the Google Sheet.`); e.status = 500; throw e; }
  return t[tab];
}

const toRow = (tab, obj) => TABS[tab].cols.map((c) => { const v = obj[c]; if (v === undefined || v === null) return ""; return v; });

export async function appendRows(tab, objs) {
  if (!objs.length) return;
  invalidate(tab);
  await withRetry(() => sheetsApi().spreadsheets.values.append({
    spreadsheetId: SHEET(),
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objs.map((o) => toRow(tab, o)) },
  }));
  invalidate(tab);
}

// Row numbers always come from a fresh read of column A, never the cache, so a write can't land on the wrong row.
async function keyColumn(tab) {
  const res = await withRetry(() => sheetsApi().spreadsheets.values.get({ spreadsheetId: SHEET(), range: `${tab}!A2:A` }));
  return (res.data.values || []).map((r) => String(r[0] ?? "").toLowerCase());
}
async function findRow(tab, keyVal) {
  const res = { data: { values: (await keyColumn(tab)).map((k) => [k]) } };
  const i = (res.data.values || []).findIndex((r) => String(r[0]).toLowerCase() === String(keyVal).toLowerCase());
  if (i < 0) { const e = new Error("That record no longer exists. Refresh and try again."); e.status = 404; throw e; }
  return i + 2;
}

export async function updateRow(tab, keyVal, obj) {
  const r = await findRow(tab, keyVal);
  const last = colLetter(TABS[tab].cols.length - 1);
  invalidate(tab);
  await withRetry(() => sheetsApi().spreadsheets.values.update({
    spreadsheetId: SHEET(),
    range: `${tab}!A${r}:${last}${r}`,
    valueInputOption: "RAW",
    requestBody: { values: [toRow(tab, obj)] },
  }));
  invalidate(tab);
}

// Updates many rows in two requests (one read of the ID column, one batch write). objs need their key field.
export async function updateRows(tab, objs) {
  if (!objs.length) return 0;
  const key = tab === "Team" ? "email" : "id";
  const keys = await keyColumn(tab);
  const last = colLetter(TABS[tab].cols.length - 1);
  const data = objs.map((o) => { const i = keys.indexOf(String(o[key]).toLowerCase()); return i < 0 ? null : { range: `${tab}!A${i + 2}:${last}${i + 2}`, values: [toRow(tab, o)] }; }).filter(Boolean);
  if (!data.length) return 0;
  invalidate(tab);
  await withRetry(() => sheetsApi().spreadsheets.values.batchUpdate({ spreadsheetId: SHEET(), requestBody: { valueInputOption: "RAW", data } }));
  invalidate(tab);
  return data.length;
}

async function sheetIdOf(tab) {
  if (!_sheetIds || _sheetIds[tab] === undefined) { metaCache.at = 0; await tabTitles(); }
  return _sheetIds[tab];
}

export async function deleteRow(tab, keyVal) {
  const r = await findRow(tab, keyVal);
  const sheetId = await sheetIdOf(tab);
  invalidate(tab);
  await withRetry(() => sheetsApi().spreadsheets.batchUpdate({
    spreadsheetId: SHEET(),
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } }] },
  }));
  invalidate(tab);
}

// Deletes many rows at once (bottom-up so row numbers stay valid). Unknown ids are skipped.
export async function deleteRows(tab, ids) {
  if (!ids.length) return;
  const keys = await keyColumn(tab);
  const want = new Set(ids.map((x) => String(x).toLowerCase()));
  const rows = keys.map((k, i) => (want.has(k) ? i + 2 : 0)).filter(Boolean).sort((a, b) => b - a);
  if (!rows.length) return;
  const sheetId = await sheetIdOf(tab);
  invalidate(tab);
  await withRetry(() => sheetsApi().spreadsheets.batchUpdate({
    spreadsheetId: SHEET(),
    requestBody: { requests: rows.map((r) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } } })) },
  }));
  invalidate(tab);
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
  _sheetIds = null; metaCache.at = 0; invalidate();
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET(),
    requestBody: {
      valueInputOption: "RAW",
      data: Object.entries(TABS).map(([t, d]) => ({ range: `${t}!A1:${colLetter(d.cols.length - 1)}1`, values: [d.head] })),
    },
  });
  return { created: add.map((a) => a.addSheet.properties.title) };
}
