// Gmail, Calendar and Drive on the company Google account.
import { gmail, gcal, gdrive } from "./gaccount";

const IST = "Asia/Kolkata";
const clip = (s, n) => (s.length > n ? s.slice(0, n) + `\n…(${s.length - n} more characters)` : s);
const b64d = (s) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const header = (m, name) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
const istTime = (ms) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(Number(ms)));
const stripHtml = (h) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();

function bodyText(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return b64d(part.body.data);
  if (part.parts) {
    const plain = part.parts.map(bodyText).find((t) => t);
    if (plain) return plain;
  }
  if (part.mimeType === "text/html" && part.body?.data) return stripHtml(b64d(part.body.data));
  return "";
}
function attachments(part, out = []) {
  if (part?.filename && part.body?.attachmentId) out.push({ name: part.filename, type: part.mimeType, size: part.body.size });
  for (const p of part?.parts || []) attachments(p, out);
  return out;
}

export async function gmailSearch({ query = "in:inbox", max = 10 }) {
  const g = await gmail();
  const res = await g.users.messages.list({ userId: "me", q: query, maxResults: Math.min(25, Math.max(1, max)) });
  const ids = (res.data.messages || []).map((m) => m.id);
  const msgs = await Promise.all(ids.map((id) => g.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"] }).then((r) => r.data)));
  return msgs.map((m) => ({ id: m.id, threadId: m.threadId, from: header(m, "From"), subject: header(m, "Subject"), date: istTime(m.internalDate), unread: (m.labelIds || []).includes("UNREAD"), snippet: m.snippet }));
}

export async function gmailRead({ id }) {
  const g = await gmail();
  const m = (await g.users.messages.get({ userId: "me", id, format: "full" })).data;
  return {
    id: m.id, threadId: m.threadId, from: header(m, "From"), to: header(m, "To"), cc: header(m, "Cc"), subject: header(m, "Subject"),
    date: istTime(m.internalDate), messageId: header(m, "Message-ID"), body: clip(bodyText(m.payload).trim(), 8000), attachments: attachments(m.payload),
  };
}

const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
export async function gmailSend({ to, cc, subject, body, replyToId }) {
  const g = await gmail();
  let threadId, inReply, refs, subj = subject || "";
  if (replyToId) {
    const orig = (await g.users.messages.get({ userId: "me", id: replyToId, format: "metadata", metadataHeaders: ["Message-ID", "References", "Subject"] })).data;
    threadId = orig.threadId; inReply = header(orig, "Message-ID"); refs = [header(orig, "References"), inReply].filter(Boolean).join(" ");
    if (!subj) subj = /^re:/i.test(header(orig, "Subject")) ? header(orig, "Subject") : "Re: " + header(orig, "Subject");
  }
  const lines = [
    `To: ${to}`, cc && `Cc: ${cc}`, `Subject: ${encHeader(subj)}`, inReply && `In-Reply-To: ${inReply}`, refs && `References: ${refs}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(body || "", "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ].filter((l) => l !== undefined && l !== null && l !== false);
  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");
  const res = await g.users.messages.send({ userId: "me", requestBody: { raw, threadId } });
  return { sent: true, id: res.data.id, to, subject: subj };
}

const dayStart = (d) => new Date(`${d}T00:00:00+05:30`).toISOString();
const plusDay = (d, n = 1) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const evTime = (t) => (t?.dateTime ? new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(t.dateTime)) : t?.date ? `${t.date} (all day)` : "");

export async function calendarList({ from, to }) {
  const c = await gcal();
  const res = await c.events.list({ calendarId: "primary", timeMin: dayStart(from), timeMax: dayStart(plusDay(to || from)), singleEvents: true, orderBy: "startTime", maxResults: 100 });
  return (res.data.items || []).filter((e) => e.status !== "cancelled").map((e) => ({
    id: e.id, title: e.summary || "(no title)", start: evTime(e.start), end: evTime(e.end), location: e.location || undefined,
    attendees: (e.attendees || []).map((a) => a.email).slice(0, 15), meet: e.hangoutLink || undefined, link: e.htmlLink,
  }));
}

export async function calendarCreate({ title, date, start, end, location, description, attendees = [], meet }) {
  const c = await gcal();
  const timed = /^\d{1,2}:\d{2}$/.test(start || "");
  let endT = end;
  if (timed && !/^\d{1,2}:\d{2}$/.test(end || "")) { const [h, m] = start.split(":").map(Number); endT = `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
  const requestBody = {
    summary: title, location, description,
    start: timed ? { dateTime: `${date}T${start.padStart(5, "0")}:00`, timeZone: IST } : { date },
    end: timed ? { dateTime: `${date}T${endT.padStart(5, "0")}:00`, timeZone: IST } : { date: plusDay(date) },
    attendees: attendees.length ? attendees.map((email) => ({ email })) : undefined,
    conferenceData: meet ? { createRequest: { requestId: "w" + Date.now(), conferenceSolutionKey: { type: "hangoutsMeet" } } } : undefined,
  };
  const res = await c.events.insert({ calendarId: "primary", requestBody, sendUpdates: attendees.length ? "all" : "none", conferenceDataVersion: meet ? 1 : 0 });
  return { created: true, title, when: evTime(res.data.start), meet: res.data.hangoutLink || undefined, link: res.data.htmlLink };
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
export async function driveSearch({ query, max = 10 }) {
  const d = await gdrive();
  const q = `trashed = false and (name contains '${esc(query)}' or fullText contains '${esc(query)}')`;
  const res = await d.files.list({ q, pageSize: Math.min(25, max), orderBy: "modifiedTime desc", fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))", includeItemsFromAllDrives: true, supportsAllDrives: true });
  return (res.data.files || []).map((f) => ({ id: f.id, name: f.name, type: f.mimeType.replace("application/vnd.google-apps.", "google "), modified: f.modifiedTime?.slice(0, 10), owner: f.owners?.[0]?.displayName, link: f.webViewLink }));
}

const EXPORT = { "application/vnd.google-apps.document": "text/plain", "application/vnd.google-apps.spreadsheet": "text/csv", "application/vnd.google-apps.presentation": "text/plain" };
export async function driveRead({ id }) {
  const d = await gdrive();
  const meta = (await d.files.get({ fileId: id, fields: "id,name,mimeType,webViewLink,modifiedTime", supportsAllDrives: true })).data;
  let text = "";
  if (EXPORT[meta.mimeType]) text = String((await d.files.export({ fileId: id, mimeType: EXPORT[meta.mimeType] }, { responseType: "text" })).data || "");
  else if (/^text\/|json|csv/.test(meta.mimeType)) text = String((await d.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "text" })).data || "");
  else return { name: meta.name, type: meta.mimeType, link: meta.webViewLink, note: "This file type can't be read as text here (only Google Docs, Sheets, Slides and text files). Open it from the link." };
  return { name: meta.name, link: meta.webViewLink, modified: meta.modifiedTime?.slice(0, 10), text: clip(text, 15000) };
}
