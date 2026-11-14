// Whiskey's tools. Partners only.
// Reads and reversible work changes (tickets, posts, briefs, schedule) run straight away.
// Money entries, emails, company-calendar invites and deletions are only PROPOSED here: the partner
// confirms them with a tap, and /api/whiskey/act carries them out.
import { TOOLS as WORK_TOOLS, callTool as workTool } from "../mcp";
import { readTab, readTabs, appendRows, deleteRows } from "../google";
import { cleanEntry } from "../entries";
import { cleanEvent } from "../records";
import { upsertEvent } from "../calendar";
import { crewNames } from "../crew";
import { uid } from "../access";
import { istToday, addDays } from "../ist";
import { SEGMENTS, EXPENSE_CATS, INCOME_CATS, MODES, TAX_CAT, EVENT_KINDS } from "../config";
import { clientIndex, rollup, clientKey, norm } from "../moneyRollup";
import { delivery, linkIndex, postedDay } from "../posts";
import { gmailSearch, gmailRead, gmailSend, calendarList, calendarCreate, driveSearch, driveRead } from "./gtools";
import { loadAccount } from "./gaccount";

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
  { name: "morning_briefing", description: "Everything a partner needs for the day: studio schedule, the company calendar, tickets due or overdue, content posts due or overdue, who has checked in, this month's money, payments still to come in, and unread email. Use for 'brief me', 'what's on today', 'good morning'.", input_schema: S({}) },
  { name: "query_ledger", description: "Search the books (income and expenses) with filters and totals. Use for any money question: 'how much did we spend on AI credits this month', 'what did Wintex pay us', 'office rent this year'. Amounts are excl. GST. The Indian financial year runs 1 April to 31 March.",
    input_schema: S({ from: str("Start date " + DATE), to: str("End date " + DATE), type: str("Expense or Income", { enum: ["Expense", "Income"] }), segment: str("Company", { enum: SEG_KEYS }),
      project: str("Project name (partial match)"), client: str("Client name (partial match)"), category: str("Exact category"), search: str("Words to find in description or payee"),
      status: str("Paid / Payable / Received / Pending", { enum: ["Paid", "Payable", "Received", "Pending"] }), group_by: str("Group totals", { enum: ["category", "project", "segment", "party", "month", "client"] }), limit: { type: "number", description: "Max entries to list (default 25)" } }) },
  { name: "money_overview", description: "Money in and out per company for a month (or all time), GST paid, payments still to come in, and what we still owe.", input_schema: S({ month: str("YYYY-MM, or 'all' for all time (default this month)") }) },
  { name: "client_money", description: "Money by client and project: budget, received, spent, net, still to receive. Optionally one client or project.", input_schema: S({ name: str("Client or project name (optional)"), month: str("YYYY-MM to limit to one month (optional)") }) },
  { name: "propose_ledger_entries", description: "Prepare income/expense entries to add to the books. They are NOT saved until the partner taps Confirm on the card, so describe them briefly and ask them to confirm.", input_schema: S({ entries: { type: "array", items: ENTRY, maxItems: 20 } }, ["entries"]) },
  { name: "add_schedule_entry", description: "Add a shoot, recce, meeting etc. to the studio schedule (it syncs to the Studio Productions Google Calendar).",
    input_schema: S({ title: str("What"), date: str(DATE), end_date: str("Last day if multi-day, " + DATE), start: str("HH:MM 24h"), end: str("HH:MM 24h"), call_time: str("HH:MM"), kind: str("Kind", { enum: EVENT_KINDS }), project: str("Project name"), location: str("Where"), notes: str("Notes") }, ["title", "date"]) },
  { name: "propose_delete", description: "Prepare deleting tickets or content posts. Not done until the partner confirms.", input_schema: S({ kind: str("tickets or content", { enum: ["tickets", "content"] }), ids: { type: "array", items: { type: "string" } }, summary: str("What will be deleted, in words") }, ["kind", "ids", "summary"]) },
  // Company Google account
  { name: "gmail_search", description: "Search the company Gmail. Uses Gmail search syntax, e.g. 'is:unread newer_than:2d', 'from:wintex', 'subject:invoice'.", input_schema: S({ query: str("Gmail search query"), max: { type: "number" } }, ["query"]) },
  { name: "gmail_read", description: "Read one email from the company Gmail (by id from gmail_search).", input_schema: S({ id: str("Message id") }, ["id"]) },
  { name: "propose_email", description: "Draft an email from the company Gmail (new or a reply). It is NOT sent until the partner taps Send on the card. Write it in a warm, professional tone signed from the studio.",
    input_schema: S({ to: str("Recipient email(s), comma separated"), cc: str("Cc (optional)"), subject: str("Subject (optional for replies)"), body: str("Plain text body"), reply_to_id: str("Message id when replying") }, ["to", "body"]) },
  { name: "company_calendar", description: "List events on the company Google Calendar between two dates.", input_schema: S({ from: str(DATE), to: str(DATE) }, ["from"]) },
  { name: "propose_calendar_event", description: "Prepare an event on the company Google Calendar (with invites if attendees are given). Not created until the partner confirms.",
    input_schema: S({ title: str("Title"), date: str(DATE), start: str("HH:MM 24h (omit for all-day)"), end: str("HH:MM"), location: str(""), description: str(""), attendees: { type: "array", items: { type: "string" }, description: "Emails to invite" }, meet: { type: "boolean", description: "Add a Google Meet link" } }, ["title", "date"]) },
  { name: "drive_search", description: "Find files in the company Google Drive.", input_schema: S({ query: str("Words in the name or content"), max: { type: "number" } }, ["query"]) },
  { name: "drive_read", description: "Read the text of a Google Doc, Sheet or Slides file from the company Drive (by id).", input_schema: S({ id: str("File id") }, ["id"]) },
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
  if (await loadAccount().catch(() => null)) {
    try { out.companyCalendar = await calendarList({ from: today, to: today }); } catch (e) { out.companyCalendar = "unavailable: " + e.message; }
    try { out.unreadEmail = await gmailSearch({ query: "is:unread in:inbox newer_than:3d", max: 8 }); } catch (e) { out.unreadEmail = "unavailable: " + e.message; }
  } else out.companyGoogle = "not connected";
  return out;
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
    if (!/@/.test(a.to || "")) throw bad("Who should the email go to? I need an email address.");
    return { kind: "email", title: a.reply_to_id ? "Send this reply" : "Send this email", lines: [`To: ${a.to}`, a.cc && `Cc: ${a.cc}`, a.subject && `Subject: ${a.subject}`].filter(Boolean), body: a.body, payload: { to: a.to, cc: a.cc, subject: a.subject, body: a.body, replyToId: a.reply_to_id } };
  }
  if (name === "propose_calendar_event") {
    return { kind: "event", title: (a.attendees || []).length ? "Create event and send invites" : "Add to the company calendar", lines: [`${a.title}`, `${a.date}${a.start ? " · " + a.start + (a.end ? "–" + a.end : "") : " · all day"}`, a.location, (a.attendees || []).length && `Invites: ${a.attendees.join(", ")}`, a.meet && "With a Google Meet link"].filter(Boolean), payload: a };
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
  if (kind === "email") { const r = await gmailSend(payload); return `Sent to ${r.to}.`; }
  if (kind === "event") { const r = await calendarCreate(payload); return `Added "${r.title}" on ${r.when}${r.meet ? " with a Meet link" : ""}.`; }
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
    case "gmail_search": return gmailSearch(a);
    case "gmail_read": return gmailRead(a);
    case "company_calendar": return calendarList(a);
    case "drive_search": return driveSearch(a);
    case "drive_read": return driveRead(a);
    default:
      if (WORK_TOOLS.some((t) => t.name === name)) return workTool({ ...user, via: "Whiskey" }, name, a);
      throw bad(`Unknown tool ${name}.`);
  }
}
