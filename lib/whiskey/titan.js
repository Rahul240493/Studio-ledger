// The two company Titan mailboxes (The Madking Studios and Space & Gravity) for Whiskey:
// mail over IMAP/SMTP and each mailbox's calendar over CalDAV.
// Credentials live only in Vercel env vars:
//   TITAN_MADKING_EMAIL, TITAN_MADKING_PASSWORD, TITAN_SG_EMAIL, TITAN_SG_PASSWORD
// Optional: TITAN_MADKING_NAME / TITAN_SG_NAME (sender name), TITAN_IMAP_HOST, TITAN_SMTP_HOST, TITAN_DAV_URL.
import "../settings";
import crypto from "crypto";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { simpleParser } from "mailparser";
import { DAVClient } from "tsdav";

const IMAP_HOST = () => process.env.TITAN_IMAP_HOST || "imap.titan.email";
const SMTP_HOST = () => process.env.TITAN_SMTP_HOST || "smtp.titan.email";
const DAV_URL = () => process.env.TITAN_DAV_URL || "https://dav.titan.email";
const TZ = "Asia/Kolkata";

export const ACCOUNTS = {
  madking: { key: "madking", env: "TITAN_MADKING", label: "The Madking Studios", short: "Madking" },
  sg: { key: "sg", env: "TITAN_SG", label: "Space & Gravity Studios", short: "S&G" },
};

const bad = (m, status = 400) => Object.assign(new Error(m), { status });

export function account(key) {
  const k = String(key || "").toLowerCase().replace(/[^a-z]/g, "");
  const a = ACCOUNTS[/^(madking|mk|themadking|themadkingstudios|madkingstudios)$/.test(k) ? "madking" : /^(sg|spacegravity|spaceandgravity|spacegravitystudios|spaceandgravitystudios)$/.test(k) ? "sg" : k];
  if (!a) throw bad(`Unknown mailbox "${key}". Use "madking" or "sg".`);
  const email = process.env[a.env + "_EMAIL"], pass = process.env[a.env + "_PASSWORD"];
  if (!email || !pass) throw bad(`The ${a.short} mailbox isn't set up yet (add ${a.env}_EMAIL and ${a.env}_PASSWORD in Vercel).`, 409);
  return { ...a, email, pass, name: process.env[a.env + "_NAME"] || a.label };
}
export const configured = () => Object.values(ACCOUNTS).filter((a) => process.env[a.env + "_EMAIL"] && process.env[a.env + "_PASSWORD"]).map((a) => ({ key: a.key, short: a.short, email: process.env[a.env + "_EMAIL"] }));
const pick = (key) => (key && key !== "all" && key !== "both" ? [account(key)] : configured().map((c) => account(c.key)));

// Turns Titan's sign-in errors into something a partner can act on.
export function friendlyTitanError(e, acct) {
  const m = `${e?.message || ""} ${e?.responseText || ""} ${e?.response || ""}`;
  const who = acct ? `the ${acct.short} mailbox (${acct.email})` : "a Titan mailbox";
  if (e?.authenticationFailed || e?.code === "EAUTH" || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|535|401/i.test(m))
    return `Titan refused the sign-in for ${who}. Check the password in Vercel, that third-party email access is on in Titan, and that two-factor sign-in is off for that mailbox.`;
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed out|ECONNRESET/i.test(m)) return `Couldn't reach Titan for ${who} just now. Try again in a minute.`;
  return null;
}
const wrap = async (acct, fn) => {
  try { return await fn(); }
  catch (e) { const f = friendlyTitanError(e, acct); if (f) throw bad(f, 502); throw e; }
};

// ---------- time helpers ----------
const ist = (d) => {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(d));
  const g = (k) => p.find((x) => x.type === k)?.value;
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
};
const dayStart = (date) => new Date(`${date}T00:00:00+05:30`);
const addDays = (date, n) => { const x = new Date(date + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addr = (list) => (list || []).map((x) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(", ");

// ---------- IMAP ----------
async function withImap(acct, fn) {
  return wrap(acct, async () => {
    const c = new ImapFlow({ host: IMAP_HOST(), port: 993, secure: true, auth: { user: acct.email, pass: acct.pass }, logger: false, socketTimeout: 25000, greetingTimeout: 10000, connectionTimeout: 10000 });
    await c.connect();
    try { return await fn(c); } finally { try { await c.logout(); } catch { c.close(); } }
  });
}

export async function mailSearch({ account: key, folder = "INBOX", from, to, subject, text, unread, since, before, max = 10 } = {}) {
  const accts = pick(key);
  if (!accts.length) throw bad("No Titan mailbox is set up yet.", 409);
  max = Math.min(Math.max(Number(max) || 10, 1), 25);
  const out = [];
  for (const acct of accts) {
    const rows = await withImap(acct, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        const q = {};
        if (unread) q.seen = false;
        if (from) q.from = from;
        if (to) q.to = to;
        if (subject) q.subject = subject;
        if (text) q.body = text;
        if (since) q.since = dayStart(since);
        if (before) q.before = dayStart(before);
        if (!Object.keys(q).length) q.since = dayStart(addDays(new Date().toISOString().slice(0, 10), -7));
        const uids = ((await c.search(q, { uid: true })) || []).sort((a, b) => a - b).slice(-max).reverse();
        if (!uids.length) return [];
        const got = [];
        for await (const m of c.fetch(uids.join(","), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, { uid: true })) {
          got.push({
            mailbox: acct.short, uid: m.uid, folder, date: ist(m.envelope?.date || m.internalDate),
            from: addr(m.envelope?.from), to: addr(m.envelope?.to), subject: m.envelope?.subject || "(no subject)",
            unread: !m.flags?.has("\\Seen"), attachments: /"attachment"|disposition.*attachment/i.test(JSON.stringify(m.bodyStructure || {})) || undefined,
          });
        }
        return got.sort((a, b) => b.uid - a.uid);
      } finally { lock.release(); }
    });
    out.push(...rows);
  }
  return out;
}

const stripHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

export async function mailRead({ account: key, uid, folder = "INBOX" }) {
  const acct = account(key);
  if (!uid) throw bad("Which email? I need its uid from mail_search.");
  return withImap(acct, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const m = await c.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
      if (!m?.source) throw bad("Couldn't find that email; it may have been moved or deleted.", 404);
      const p = await simpleParser(m.source);
      let body = (p.text || stripHtml(p.html) || "").trim();
      if (body.length > 8000) body = body.slice(0, 8000) + "\n…(cut)";
      return {
        mailbox: acct.short, uid: Number(uid), folder, date: ist(p.date), from: p.from?.text || "", to: p.to?.text || "", cc: p.cc?.text || undefined,
        subject: p.subject || "(no subject)", body,
        attachments: (p.attachments || []).map((a) => ({ name: a.filename || "(unnamed)", type: a.contentType, kb: Math.round((a.size || 0) / 1024) })),
      };
    } finally { lock.release(); }
  });
}

async function sentFolder(c) {
  const boxes = await c.list();
  return (boxes.find((b) => b.specialUse === "\\Sent") || boxes.find((b) => /^sent( items| mail)?$/i.test(b.name)) || { path: "Sent" }).path;
}

// Sends from a company mailbox, threads replies, and files a copy in Sent.
export async function mailSend({ account: key, to, cc, subject, body, replyTo, icalEvent }) {
  const acct = account(key);
  const list = (s) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const rcpt = [...list(to), ...list(cc)];
  if (!rcpt.length || rcpt.some((x) => !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(x.replace(/^.*<|>$/g, "")))) throw bad("I need valid email addresses to send to.");
  let inReplyTo, references, subj = subject;
  if (replyTo?.uid) {
    const orig = await withImap(acct, async (c) => {
      const lock = await c.getMailboxLock(replyTo.folder || "INBOX");
      try { return await c.fetchOne(String(replyTo.uid), { uid: true, envelope: true, headers: ["references"] }, { uid: true }); }
      finally { lock.release(); }
    });
    if (orig?.envelope) {
      inReplyTo = orig.envelope.messageId;
      const refs = String(orig.headers || "").replace(/^references:\s*/i, "").replace(/\s+/g, " ").trim();
      references = [refs, inReplyTo].filter(Boolean).join(" ");
      if (!subj) subj = /^re:/i.test(orig.envelope.subject || "") ? orig.envelope.subject : `Re: ${orig.envelope.subject || ""}`;
    }
  }
  const mail = new MailComposer({
    from: { name: acct.name, address: acct.email }, to: list(to), cc: list(cc), subject: subj || "(no subject)", text: body || "",
    inReplyTo, references, icalEvent, messageId: `<${crypto.randomUUID()}@${acct.email.split("@")[1]}>`,
  });
  const raw = await new Promise((res, rej) => mail.compile().build((e, m) => (e ? rej(e) : res(m))));
  await wrap(acct, () => nodemailer.createTransport({ host: SMTP_HOST(), port: 465, secure: true, auth: { user: acct.email, pass: acct.pass }, connectionTimeout: 15000 })
    .sendMail({ envelope: { from: acct.email, to: rcpt.map((x) => x.replace(/^.*<|>$/g, "")) }, raw }));
  // A copy in Sent and the original marked answered; neither should fail the send.
  try {
    await withImap(acct, async (c) => {
      await c.append(await sentFolder(c), raw, ["\\Seen"]);
      if (replyTo?.uid) { const lock = await c.getMailboxLock(replyTo.folder || "INBOX"); try { await c.messageFlagsAdd(String(replyTo.uid), ["\\Answered"], { uid: true }); } finally { lock.release(); } }
    });
  } catch (e) { console.error("Titan: saving to Sent failed", e?.message); }
  return { from: acct.email, to: rcpt.join(", "), subject: subj };
}

// ---------- CalDAV ----------
const calCache = new Map(); // email -> { at, client, calendars }
async function dav(acct) {
  const hit = calCache.get(acct.email);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  return wrap(acct, async () => {
    const client = new DAVClient({ serverUrl: DAV_URL(), credentials: { username: acct.email, password: acct.pass }, authMethod: "Basic", defaultAccountType: "caldav" });
    await client.login();
    const calendars = (await client.fetchCalendars()).filter((c) => !c.components || c.components.includes("VEVENT"));
    if (!calendars.length) throw bad(`No calendar found in the ${acct.short} Titan mailbox (or Titan refused the sign-in).`, 502);
    const v = { at: Date.now(), client, calendars };
    calCache.set(acct.email, v);
    return v;
  });
}

// Minimal iCalendar reader: VEVENTs with start/end in IST.
function unfold(ics) { return String(ics || "").replace(/\r?\n[ \t]/g, ""); }
const unesc = (s) => String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
function tzOffsetMin(tz, utcMs) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs));
    const g = (k) => Number(p.find((x) => x.type === k).value);
    return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - utcMs) / 60000;
  } catch { return 330; }
}
function icsTime(params, v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v).trim());
  if (!m) return null;
  const [, Y, Mo, D, h, mi, , z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { date: `${Y}-${Mo}-${D}`, allDay: true };
  const wall = Date.UTC(+Y, +Mo - 1, +D, +h, +mi);
  const tz = /TZID=("?)([^;:"]+)\1/i.exec(params)?.[2];
  const utc = z ? wall : wall - tzOffsetMin(tz || TZ, wall) * 60000;
  const s = ist(utc);
  return { date: s.slice(0, 10), time: s.slice(11), ms: utc };
}
export function parseEvents(ics) {
  const out = [];
  for (const block of unfold(ics).split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const f = {};
    for (const line of body.split(/\r?\n/)) {
      const i = line.indexOf(":"); if (i < 0) continue;
      const [name, ...ps] = line.slice(0, i).split(";");
      const k = name.toUpperCase();
      if (k === "ATTENDEE") (f.ATTENDEE ||= []).push({ params: ps.join(";"), value: line.slice(i + 1) });
      else if (!(k in f)) f[k] = { params: ps.join(";"), value: line.slice(i + 1) };
    }
    if (/CANCELLED/i.test(f.STATUS?.value || "")) continue;
    const s = f.DTSTART && icsTime(f.DTSTART.params, f.DTSTART.value);
    if (!s) continue;
    const e = f.DTEND && icsTime(f.DTEND.params, f.DTEND.value);
    out.push({
      uid: f.UID?.value, title: unesc(f.SUMMARY?.value) || "(no title)", date: s.date, start: s.time || "",
      endDate: e ? (e.allDay ? addDays(e.date, -1) : e.date) : s.date, end: e?.time || "", allDay: !!s.allDay,
      location: unesc(f.LOCATION?.value) || undefined, notes: unesc(f.DESCRIPTION?.value).slice(0, 400) || undefined,
      repeats: f.RRULE && !f["RECURRENCE-ID"] ? f.RRULE.value : undefined,
      attendees: f.ATTENDEE?.map((a) => a.value.replace(/^mailto:/i, "")),
    });
  }
  return out;
}

export async function titanEvents(key, from, to) {
  const acct = account(key);
  const { client, calendars } = await dav(acct);
  const timeRange = { start: dayStart(from).toISOString(), end: dayStart(addDays(to || from, 1)).toISOString() };
  const out = [];
  for (const cal of calendars) {
    const objs = await wrap(acct, () => client.fetchCalendarObjects({ calendar: cal, timeRange, expand: true, urlFilter: () => true }));
    for (const o of objs) for (const ev of parseEvents(typeof o.data === "string" ? o.data : o.data?._text || "")) {
      if (!ev.repeats && (ev.endDate < from || ev.date > (to || from))) continue;
      out.push({ calendar: `${acct.short} (Titan)${calendars.length > 1 ? " · " + (cal.displayName || "") : ""}`, ...ev });
    }
  }
  return out;
}

// ---------- create an event (and send invites) ----------
const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };
const hm = (t) => (/^\d{1,2}:\d{2}$/.test(t || "") ? t.padStart(5, "0").replace(":", "") + "00" : null);
const VTZ = ["BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530", "TZNAME:IST", "END:STANDARD", "END:VTIMEZONE"];

function buildIcs({ uid, acct, title, date, start, end, endDate, location, description, attendees = [] }, forEmail) {
  const d = date.replace(/-/g, "");
  const s = hm(start);
  let dt;
  if (s) {
    let e = hm(end);
    if (!e || e <= s) { const [h, m] = start.split(":").map(Number); e = String(Math.min(23, h + 1)).padStart(2, "0") + String(m).padStart(2, "0") + "00"; }
    dt = [`DTSTART;TZID=Asia/Kolkata:${d}T${s}`, `DTEND;TZID=Asia/Kolkata:${(endDate || date).replace(/-/g, "")}T${e}`];
  } else dt = [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(endDate || date, 1).replace(/-/g, "")}`];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Studio Ledger//Whiskey//EN", "CALSCALE:GREGORIAN", forEmail && "METHOD:REQUEST",
    ...(s ? VTZ : []),
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(new Date())}`, ...dt, `SUMMARY:${icsEsc(title)}`,
    location && `LOCATION:${icsEsc(location)}`, description && `DESCRIPTION:${icsEsc(description)}`, "SEQUENCE:0", "STATUS:CONFIRMED",
    attendees.length && `ORGANIZER;CN=${icsEsc(acct.name)}:mailto:${acct.email}`,
    ...attendees.map((a) => `ATTENDEE;${forEmail ? "" : "SCHEDULE-AGENT=CLIENT;"}ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`),
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}

export { buildIcs };
export async function titanCreateEvent({ account: key, title, date, start, end, end_date, location, description, attendees = [] }) {
  const acct = account(key);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw bad("I need a title and a date (YYYY-MM-DD).");
  attendees = attendees.map((x) => String(x).trim()).filter(Boolean);
  const uid = `${crypto.randomUUID()}@studio-ledger`;
  const ev = { uid, acct, title, date, start, end, endDate: end_date, location, description, attendees };
  const { client, calendars } = await dav(acct);
  const cal = calendars.find((c) => /^(calendar|my calendar|default|personal)$/i.test(c.displayName || "")) || calendars[0];
  const r = await wrap(acct, () => client.createCalendarObject({ calendar: cal, filename: uid.replace(/[^a-z0-9-]/gi, "") + ".ics", iCalString: buildIcs(ev, false) }));
  if (r && r.ok === false) throw bad(`Titan didn't accept the event (${r.status}).`, 502);
  let invited = "";
  if (attendees.length) {
    const when = `${date}${start ? " at " + start : ""}${end ? "–" + end : ""} IST`;
    await mailSend({ account: key, to: attendees.join(", "), subject: `Invitation: ${title} · ${when}`,
      body: `You're invited: ${title}\nWhen: ${when}${location ? "\nWhere: " + location : ""}${description ? "\n\n" + description : ""}\n\n${acct.name}`,
      icalEvent: { method: "REQUEST", filename: "invite.ics", content: buildIcs(ev, true) } });
    invited = attendees.join(", ");
  }
  return { title, when: `${date}${start ? " " + start : ""}`, calendar: `${acct.short} (Titan)`, invited };
}

// ---------- health check for the settings panel ----------
export async function checkAccount(key) {
  const acct = account(key);
  const res = { mailbox: acct.short, email: acct.email };
  const t = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 15000))]);
  try { const n = await t(withImap(acct, async (c) => (await c.status("INBOX", { unseen: true })).unseen)); res.mail = `OK · ${n} unread`; } catch (e) { res.mail = e.message; }
  try { await t(wrap(acct, () => nodemailer.createTransport({ host: SMTP_HOST(), port: 465, secure: true, auth: { user: acct.email, pass: acct.pass }, connectionTimeout: 10000 }).verify())); res.sending = "OK"; } catch (e) { res.sending = e.message; }
  try { calCache.delete(acct.email); const { calendars } = await t(dav(acct)); res.calendar = `OK · ${calendars.map((c) => c.displayName || "Calendar").join(", ")}`; } catch (e) { res.calendar = e.message; }
  return res;
}
