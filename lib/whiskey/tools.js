// Whiskey's tools. Partners only.
// Reads and reversible work changes (tickets, posts, briefs, schedule) run straight away.
// Money entries, emails, Titan calendar events (which can send invites) and deletions are only PROPOSED here: the partner
// confirms them with a tap, and /api/whiskey/act carries them out.
import { TOOLS as WORK_TOOLS, callTool as workTool } from "../mcp";
import { readTab, readTabs, appendRows, deleteRows } from "../google";
import { cleanEntry } from "../entries";
import { cleanEvent } from "../records";
import { upsertEvent, studioEvents } from "../calendar";
import { configured as titanAccounts, mailSearch, mailRead, mailSend, titanEvents, titanCreateEvent, account as titanAccount } from "./titan";
import { crewNames } from "../crew";
import { uid } from "../access";
import { istToday, addDays } from "../ist";
import { SEGMENTS, EXPENSE_CATS, INCOME_CATS, MODES, TAX_CAT, EVENT_KINDS } from "../config";
import { clientIndex, rollup, clientKey, norm } from "../moneyRollup";
import { delivery, linkIndex, postedDay } from "../posts";

const S = (props, required = []) => ({ type: "object", properties: props, required });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const DATE = "YYYY-MM-DD";
const SEG_KEYS = SEGMENTS.map((s) => s.key);
const bad = (m) => Object.assign(new Error(m), { status: 400 });

// Work tools from the Claude connector (delete goes through confirmation instead).
const work = WORK_TOOLS.filter((t) => t.name !== "delete_items").map(({ name, description, inputSchema }) => ({ name, description, input_schema: inputSchema }));

const ENTRY = S({
  type: str("Expense or Income", { enum: ["Expense", "Income"] }), date: str(DATE), segment: str("Company", { enum: SEG_KEYS }),
  project: str("Project name, or General for overheads/office"), category: str("Expense: " + EXPENSE_CATS.join("; ") + ". Income: " + INCOME_CATS.join("; ")),
  description: str("Short description"), party: str("Who was paid / who paid us"), amount: { type: "number", description: "Amount BEFORE GST, in rupees" },
  gstRate: { type: "number", description: "GST % (0 if none)" }, mode: str("Payment mode", { enum: MODES }),
  status: str("Paid / Payable for expenses, Received / Pending for income", { enum: ["Paid", "Payable", "Received", "Pending"] }),
}, ["type", "date", "segment", "category", "amount"]);

export const TOOLS = [
  ...work,
  { name: "morning_briefing", description: "Everything a partner needs for the day: studio schedule, today's events on all calendars, tickets due or overdue, content posts due or overdue, who has checked in, this month's money, payments still to come in, and recent unread email in both company mailboxes. Use for 'brief me', 'what's on today', 'good morning'.", input_schema: S({}) },
  { name: "query_ledger", description: "Search the books (income and expenses) with filters and totals. Use for any money question: 'how much did we spend on AI credits this month', 'what did Wintex pay us', 'office rent this year'. Amounts are excl. GST. The Indian financial year runs 1 April to 31 March.",
    input_schema: S({ from: str("Start date " + DATE), to: str("End date " + DATE), type: str("Expense or Income", { enum: ["Expense", "Income"] }), segment: str("Company", { enum: SEG_KEYS }),
      project: str("Project name (partial match)"), client: str("Client name (partial match)"), category: str("Exact category"), search: str("Words to find in description or payee"),
      status: str("Paid / Payable / Received / Pending", { enum: ["Paid", "Payable", "Received", "Pending"] }), group_by: str("Group totals", { enum: ["category", "project", "segment", "party", "month", "client"] }), limit: { type: "number", description: "Max entries to list (default 25)" } }) },
  { name: "money_overview", description: "Money in and out per company for a month (or all time), GST paid, payments still to come in, and what we still owe.", input_schema: S({ month: str("YYYY-MM, or 'all' for all time (default this month)") }) },
  { name: "client_money", description: "Money by client and project: budget, received, spent, net, still to receive. Optionally one client or project.", input_schema: S({ name: str("Client or project name (optional)"), month: str("YYYY-MM to limit to one month (optional)") }) },
  { name: "propose_ledger_entries", description: "Prepare income/expense entries to add to the books. They are NOT saved until the partner taps Confirm on the card, so describe them briefly and ask them to confirm.", input_schema: S({ entries: { type: "array", items: ENTRY, maxItems: 20 } }, ["entries"]) },
  { name: "add_schedule_entry", description: "Add a shoot, recce, meeting etc. to the studio schedule. It appears in the dashboard and on the Studio Productions Google Calendar ('studio' calendar). No invites are sent; to invite people, use propose_calendar_event on a Titan calendar.",
    input_schema: S({ title: str("What"), date: str(DATE), end_date: str("Last day if multi-day, " + DATE), start: str("HH:MM 24h"), end: str("HH:MM 24h"), call_time: str("HH:MM"), kind: str("Kind", { enum: EVENT_KINDS }), project: str("Project name"), location: str("Where"), notes: str("Notes") }, ["title", "date"]) },
  { name: "propose_delete", description: "Prepare deleting tickets or content posts. Not done until the partner confirms.", input_schema: S({ kind: str("tickets or content", { enum: ["tickets", "content"] }), ids: { type: "array", items: { type: "string" } }, summary: str("What will be deleted, in words") }, ["kind", "ids", "summary"]) },
  // Company mail (Titan) and calendars
  { name: "mail_search", description: "Search the company Titan mailboxes. mailbox: 'madking', 'sg' or 'both' (default both). With no filters it lists the last 7 days. Returns uid, mailbox, date, from, subject, unread.",
    input_schema: S({ mailbox: str("madking, sg or both", { enum: ["madking", "sg", "both"] }), from: str("Sender name or address contains"), to: str("Recipient contains"), subject: str("Subject contains"), text: str("Words in the body"), unread: { type: "boolean" }, since: str("On or after, " + DATE), before: str("Before, " + DATE), folder: str("Folder, default INBOX"), max: { type: "number" } }) },
  { name: "mail_read", description: "Read one email (full text and attachment names) by mailbox and uid from mail_search.", input_schema: S({ mailbox: str("madking or sg", { enum: ["madking", "sg"] }), uid: { type: "number" }, folder: str("Folder, default INBOX") }, ["mailbox", "uid"]) },
  { name: "propose_email", description: "Draft an email from a company mailbox (new, or a reply when reply_to_uid is given). Use the Madking mailbox for Madking work (films, music videos, OTT) and the S&G mailbox for S&G work (ads, brand films, documentaries, digital); ask if unclear. NOT sent until the partner taps Send. Warm, professional, signed from the studio.",
    input_schema: S({ mailbox: str("madking or sg", { enum: ["madking", "sg"] }), to: str("Recipient email(s), comma separated"), cc: str("Cc (optional)"), subject: str("Subject (optional for replies)"), body: str("Plain text body"), reply_to_uid: { type: "number", description: "uid of the email being replied to (same mailbox)" }, reply_folder: str("Folder of that email, default INBOX") }, ["mailbox", "to", "body"]) },
  { name: "calendar_events", description: "List events between two dates on the studio Google Calendar and the Madking and S&G Titan calendars. calendar: 'all' (default), 'studio', 'madking' or 'sg'.",
    input_schema: S({ from: str(DATE), to: str(DATE + " (default = from)"), calendar: str("Which calendar", { enum: ["all", "studio", "madking", "sg"] }) }, ["from"]) },
  { name: "propose_calendar_event", description: "Prepare an event on the Madking or S&G Titan calendar, optionally emailing invites (from that mailbox) to attendees. NOT created until the partner confirms. For the studio Google Calendar use add_schedule_entry instead.",
    input_schema: S({ calendar: str("madking or sg", { enum: ["madking", "sg"] }), title: str("Title"), date: str(DATE), end_date: str("Last day if multi-day"), start: str("HH:MM 24h (omit for all-day)"), end: str("HH:MM"), location: str(""), description: str(""), attendees: { type: "array", items: { type: "string" }, description: "Emails to invite" } }, ["calendar", "title", "date"]) },
];

// ---------- money helpers ----------
const inr = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
async function books() {
  const d = await readTabs(["Ledger", "Projects"]);
  return { L: (d.Ledger || []).filter((e) => e.id), projects: d.Projects || [] };
}
function sums(list) {
  let inc = 0, exp = 0, gst = 0, tax = 0;
  for (const e of list) {
    if (e.type === "Income") inc += e.amount || 0;
    else if (e.category === TAX_CAT) tax += e.total || e.amount || 0;
    else { exp += e.amount || 0; gst += e.gst || 0; }
  }
  return { in: Math.round(inc), out: Math.round(exp), net: Math.round(inc - exp), gstPaidOnBills: Math.round(gst), taxPaid: Math.round(tax) };
}

async function queryLedger(a) {
  const { L, projects } = await books();
  const clientOf = clientIndex(L, projects);
  let xs = L;
  if (a.from) xs = xs.filter((e) => e.date >= a.from);
  if (a.to) xs = xs.filter((e) => e.date <= a.to);
  if (a.type) xs = xs.filter((e) => e.type === a.type);
  if (a.segment) xs = xs.filter((e) => e.segment === a.segment);
  if (a.status) xs = xs.filter((e) => e.status === a.status);
  if (a.category) xs = xs.filter((e) => norm(e.category) === norm(a.category));
  if (a.project) xs = xs.filter((e) => norm(e.project).includes(norm(a.project)));
  if (a.client) { const k = clientKey(a.client); xs = xs.filter((e) => e.project && e.project !== "General" && (clientKey(clientOf(e.project)).includes(k) || clientKey(e.party).includes(k))); }
  if (a.search) { const words = norm(a.search).split(/\s+/).filter(Boolean); xs = xs.filter((e) => { const h = norm(`${e.description} ${e.party} ${e.category} ${e.project}`); return words.every((w) => h.includes(w)); }); }
  const out = { count: xs.length, totals: sums(xs) };
  if (a.group_by) {
    const g = {};
    for (const e of xs) {
      const k = a.group_by === "month" ? String(e.date).slice(0, 7) : a.group_by === "client" ? (e.project && e.project !== "General" ? clientOf(e.project) : "Overheads") : e[a.group_by] || "(none)";
      const r = (g[k] ||= { key: k, in: 0, out: 0, count: 0 });
      r.count++; if (e.type === "Income") r.in += e.amount || 0; else r.out += e.amount || 0;
    }
    out.groups = Object.values(g).map((r) => ({ ...r, in: Math.round(r.in), out: Math.round(r.out) })).sort((x, y) => y.in + y.out - (x.in + x.out)).slice(0, 40);
  }
  const lim = Math.min(80, a.limit || 25);
  out.entries = [...xs].sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, lim).map((e) => ({ date: e.date, type: e.type, company: e.segment, project: e.project, category: e.category, description: e.description, party: e.party, amount: e.amount, gst: e.gst || undefined, status: e.status }));
  if (xs.length > lim) out.note = `Showing the latest ${lim} of ${xs.length}. Totals cover all of them.`;
  return out;
}

async function moneyOverview(a) {
  const { L } = await books();
  const month = a.month === "all" ? "" : a.month || istToday().slice(0, 7);
  const xs = month ? L.filter((e) => String(e.date).slice(0, 7) === month) : L;
  const per = Object.fromEntries(SEG_KEYS.map((s) => [s, sums(xs.filter((e) => e.segment === s))]));
  const pending = L.filter((e) => e.type === "Income" && e.status === "Pending").map((e) => ({ date: e.date, project: e.project, from: e.party, amount: e.amount }));
  const payable = L.filter((e) => e.type !== "Income" && e.status === "Payable").map((e) => ({ date: e.date, project: e.project, to: e.party, amount: e.amount }));
  return { period: month || "all time", combined: sums(xs), byCompany: per, stillToReceive: { total: Math.round(pending.reduce((t, e) => t + e.amount, 0)), items: pending.slice(0, 20) }, weOwe: { total: Math.round(payable.reduce((t, e) => t + e.amount, 0)), items: payable.slice(0, 20) } };
}

async function clientMoney(a) {
  const { L, projects } = await books();
  const xs = a.month ? L.filter((e) => String(e.date).slice(0, 7) === a.month) : L;
  const { clients, overheads } = rollup(xs, projects, clientIndex(L, projects));
  const pick = (r) => ({ name: r.name, budget: r.budget || undefined, received: Math.round(r.received), spent: Math.round(r.spent), net: Math.round(r.net), stillToReceive: Math.round(r.pending) || undefined });
  let list = clients.sort((x, y) => y.net - x.net).map((c) => ({ ...pick(c), projects: c.rows.length > 1 || norm(c.rows[0].name) !== norm(c.name) ? c.rows.map(pick) : undefined }));
  if (a.name) { const k = clientKey(a.name); list = list.filter((c) => clientKey(c.name).includes(k) || (c.projects || []).some((p) => clientKey(p.name).includes(k))); }
  return { period: a.month || "all time", clients: list, overheads: a.name ? undefined : overheads.map((o) => ({ name: o.name, spent: Math.round(o.spent) })) };
}

async function briefing(user) {
  const today = istToday(), tomorrow = addDays(today, 1);
  const d = await readTabs(["Schedule", "Tickets", "Content", "Daily", "Team", "Projects", "Ledger"]);
  const pn = Object.fromEntries((d.Projects || []).map((p) => [p.id, p.name]));
  const team = (d.Team || []).filter((t) => t.role !== "Partner");
  const schedule = (d.Schedule || []).filter((e) => e.date && (e.date === today || e.date === tomorrow || (e.date < today && e.endDate >= today))).map((e) => ({ when: e.date === tomorrow ? "tomorrow" : "today", title: e.title, kind: e.kind, project: e.project, start: e.start, callTime: e.callTime, location: e.location }));
  const open = (d.Tickets || []).filter((t) => t.status !== "Done");
  const tickets = { overdue: open.filter((t) => t.deadline && t.deadline < today).map((t) => ({ title: t.title, project: pn[t.projectId], deadline: t.deadline, priority: t.priority })),
    dueToday: open.filter((t) => t.deadline === today).map((t) => ({ title: t.title, project: pn[t.projectId], priority: t.priority })), p1Open: open.filter((t) => t.priority === "P1").length };
  const C = d.Content || [], links = linkIndex(C), byId = Object.fromEntries(C.map((c) => [c.id, c]));
  const posts = { dueToday: [], overdue: [] };
  for (const c of C) {
    const dl = delivery(c, links, byId, today);
    if (dl.state === "overdue") posts.overdue.push({ project: pn[c.projectId], planned: c.date, format: c.format, title: c.title, daysOverdue: dl.days });
    else if (c.date === today && !postedDay(c) && !["Skipped", "Moved"].includes(c.status)) posts.dueToday.push({ project: pn[c.projectId], format: c.format, title: c.title, status: c.status });
  }
  const daily = (d.Daily || []).filter((x) => x.date === today);
  const checkedIn = daily.map((x) => ({ name: x.name, at: x.checkIn, late: x.late === true || x.late === "TRUE" || x.late === "Yes" }));
  const inEmails = new Set(daily.map((x) => String(x.email).toLowerCase()));
  const notIn = team.filter((t) => !inEmails.has(String(t.email).toLowerCase())).map((t) => t.name);
  const month = today.slice(0, 7);
  const L = d.Ledger || [];
  const money = { thisMonth: sums(L.filter((e) => String(e.date).slice(0, 7) === month)), stillToReceive: Math.round(L.filter((e) => e.type === "Income" && e.status === "Pending").reduce((t, e) => t + (e.amount || 0), 0)) };
  const out = { today, partner: user.name, studioSchedule: schedule, tickets, contentPosts: { dueToday: posts.dueToday, overdueCount: posts.overdue.length, overdue: posts.overdue.slice(0, 8) }, attendance: { checkedIn, notCheckedInYet: notIn }, money };
  const [cal, mail] = await Promise.all([
    timed(allEvents(today, tomorrow), 15000).catch((e) => "unavailable: " + e.message),
    titanAccounts().length ? timed(mailSearch({ unread: true, since: addDays(today, -2), max: 8 }), 20000).catch((e) => "unavailable: " + e.message) : "no mailbox set up",
  ]);
  out.calendarsTodayAndTomorrow = cal;
  out.unreadEmailLast2Days = mail;
  return out;
}

const timed = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("took too long")), ms))]);

// Events from the studio Google Calendar and the Titan calendars; one calendar failing doesn't hide the rest.
async function allEvents(from, to, which = "all") {
  to = to || from;
  const jobs = [];
  if (which === "all" || which === "studio") jobs.push(["Studio (Google)", studioEvents(from, to)]);
  for (const t of titanAccounts()) if (which === "all" || which === t.key) jobs.push([`${t.short} (Titan)`, titanEvents(t.key, from, to)]);
  if (which !== "all" && which !== "studio" && !jobs.length) titanAccount(which); // throws "not set up"
  const res = await Promise.allSettled(jobs.map(([, p]) => timed(p, 15000)));
  const events = [], problems = [];
  res.forEach((r, i) => (r.status === "fulfilled" ? events.push(...r.value) : problems.push(`${jobs[i][0]}: ${r.reason?.message}`)));
  events.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
  return problems.length ? { events, problems } : events;
}

async function addSchedule(user, a) {
  const ev = { ...cleanEvent({ title: a.title, date: a.date, endDate: a.end_date, start: a.start, end: a.end, callTime: a.call_time, kind: a.kind, project: a.project, location: a.location, notes: a.notes }), id: uid("S"), createdBy: user.name + " (via Whiskey)", createdAt: new Date().toISOString() };
  let warning;
  try { ev.calendarEventId = await upsertEvent(ev, await crewNames(ev.crew)); } catch (e) { console.error(e); warning = "Saved, but not added to Google Calendar."; }
  await appendRows("Schedule", [ev]);
  return { added: true, title: ev.title, date: ev.date, start: ev.start || undefined, warning };
}

// ---------- confirmable actions ----------
// Returns { summary, payload } describing what the partner is asked to confirm.
export function prepareAction(name, a) {
  if (name === "propose_ledger_entries") {
    const entries = (a.entries || []).map((x) => {
      const gst = Math.round((Number(x.amount) || 0) * (Number(x.gstRate) || 0)) / 100;
      return cleanEntry({ ...x, gst, project: x.project || "General", mode: x.mode || "UPI" });
    });
    if (!entries.length) throw bad("No entries.");
    return { kind: "ledger", title: entries.length === 1 ? "Add to the books" : `Add ${entries.length} entries to the books`, lines: entries.map((e) => `${e.type === "Income" ? "In" : "Out"} · ${inr(e.amount)}${e.gst ? ` + GST ${inr(e.gst)}` : ""} · ${e.description || e.category} · ${e.segment}${e.project && e.project !== "General" ? " / " + e.project : ""} · ${e.date}`), payload: { entries } };
  }
  if (name === "propose_email") {
    const acct = titanAccount(a.mailbox);
    if (!/@/.test(a.to || "")) throw bad("Who should the email go to? I need an email address.");
    return { kind: "email", title: a.reply_to_uid ? "Send this reply" : "Send this email", lines: [`From: ${acct.email}`, `To: ${a.to}`, a.cc && `Cc: ${a.cc}`, a.subject && `Subject: ${a.subject}`].filter(Boolean), body: a.body,
      payload: { account: acct.key, to: a.to, cc: a.cc, subject: a.subject, body: a.body, replyTo: a.reply_to_uid ? { uid: a.reply_to_uid, folder: a.reply_folder || "INBOX" } : undefined } };
  }
  if (name === "propose_calendar_event") {
    const acct = titanAccount(a.calendar);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || "")) throw bad("Which date? I need YYYY-MM-DD.");
    const att = (a.attendees || []).filter(Boolean);
    return { kind: "event", title: att.length ? "Create event and send invites" : `Add to the ${acct.short} calendar`,
      lines: [a.title, `${a.date}${a.end_date && a.end_date !== a.date ? " to " + a.end_date : ""}${a.start ? " · " + a.start + (a.end ? "–" + a.end : "") : " · all day"} · ${acct.short} calendar`, a.location, att.length && `Invites from ${acct.email} to: ${att.join(", ")}`].filter(Boolean),
      payload: { account: acct.key, title: a.title, date: a.date, end_date: a.end_date, start: a.start, end: a.end, location: a.location, description: a.description, attendees: att } };
  }
  if (name === "propose_delete") {
    return { kind: "delete", title: `Delete ${a.ids.length} ${a.kind === "tickets" ? (a.ids.length === 1 ? "ticket" : "tickets") : a.ids.length === 1 ? "post" : "posts"}`, lines: [a.summary], payload: { kind: a.kind, ids: a.ids }, danger: true };
  }
  return null;
}

export async function runAction(user, kind, payload) {
  if (kind === "ledger") {
    const now = new Date().toISOString();
    const rows = payload.entries.map((x) => ({ ...cleanEntry(x), id: uid("E"), loggedBy: user.name + " (via Whiskey)", loggedAt: now }));
    await appendRows("Ledger", rows);
    return `Saved ${rows.length === 1 ? "the entry" : rows.length + " entries"} to the books.`;
  }
  if (kind === "email") { const r = await mailSend(payload); return `Sent from ${r.from} to ${r.to}.`; }
  if (kind === "event") { const r = await titanCreateEvent(payload); return `Added "${r.title}" on ${r.when} to the ${r.calendar} calendar${r.invited ? ` and sent invites to ${r.invited}` : ""}.`; }
  if (kind === "delete") {
    const tab = payload.kind === "tickets" ? "Tickets" : "Content";
    await deleteRows(tab, payload.ids);
    return `Deleted ${payload.ids.length}.`;
  }
  throw bad("Unknown action.");
}

export const CONFIRM_TOOLS = new Set(["propose_ledger_entries", "propose_email", "propose_calendar_event", "propose_delete"]);

export async function runTool(user, name, a = {}) {
  switch (name) {
    case "morning_briefing": return briefing(user);
    case "query_ledger": return queryLedger(a);
    case "money_overview": return moneyOverview(a);
    case "client_money": return clientMoney(a);
    case "add_schedule_entry": return addSchedule(user, a);
    case "mail_search": return mailSearch({ ...a, account: a.mailbox });
    case "mail_read": return mailRead({ ...a, account: a.mailbox });
    case "calendar_events": return allEvents(a.from, a.to, a.calendar || "all");
    default:
      if (WORK_TOOLS.some((t) => t.name === name)) return workTool({ ...user, via: "Whiskey" }, name, a);
      throw bad(`Unknown tool ${name}.`);
  }
}
