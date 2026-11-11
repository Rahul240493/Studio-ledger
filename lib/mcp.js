// Studio work tools for Claude (remote MCP connector).
// Deliberately has NO access to money: it never reads or writes the Ledger tab, project budgets or crew rates,
// whoever's link is used. Everything here is something any signed-in team member can already do in the app.
import { createHash } from "crypto";
import { readTab, readTabs, appendRows, updateRow, updateRows, deleteRows } from "./google";
import { cleanTicket, cleanContent, cleanUpdate, cleanProject } from "./records";
import { membersFrom } from "./members";
import { roleFor, uid } from "./access";
import { istToday } from "./ist";
import { PRIORITIES, T_STATUS, T_KIND, C_FORMATS, C_STATUS, C_SOURCES, PLATFORMS, PIPELINE, DELAY_REASONS } from "./config";
import { delivery, linkIndex, clientTally, scopeFor, postedDay } from "./posts";
import { postedDefaults, slotUpdates } from "./contentRules";

export const hashKey = (k) => createHash("sha256").update(String(k)).digest("hex");

// Find whose personal link this is. Removing someone from the team (or regenerating the link) cuts it off.
const keyCache = new Map(); // hash -> { at, user } (5 minutes)
export async function userForKey(key) {
  if (!key || String(key).length < 20) return null;
  const h = hashKey(key);
  const hit = keyCache.get(h);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.user;
  const rows = await readTab("Team"); // errors (e.g. Google busy) propagate: they are not "invalid link"
  const row = rows.find((r) => r.mcpKey && r.mcpKey === h);
  if (!row) return null;
  const email = String(row.email).toLowerCase();
  const role = await roleFor(email);
  if (!role) return null;
  const user = { email, name: row.name || email, role };
  keyCache.set(h, { at: Date.now(), user });
  return user;
}

const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
const STRIP_PROJECT = ["budget", "createdBy", "createdAt"];

async function context() {
  const d = await readTabs(["Projects", "Team"]);
  const projects = d.Projects || [];
  const members = membersFrom(d.Team || []);
  return { projects, members };
}
function projectRef(projects, ref) {
  const r = String(ref || "").trim().toLowerCase();
  if (!r) throw bad("Say which project (name or ID).");
  const p = projects.find((x) => x.id.toLowerCase() === r) || projects.find((x) => x.name.toLowerCase() === r)
    || projects.filter((x) => x.name.toLowerCase().includes(r)).sort((a, b) => a.name.length - b.name.length)[0];
  if (!p) throw bad(`No project matches "${ref}". Use list_projects to see the names.`);
  return p;
}
function peopleRefs(members, refs) {
  const list = Array.isArray(refs) ? refs : String(refs || "").split(",");
  return list.map((x) => String(x).trim()).filter(Boolean).map((x) => {
    const r = x.toLowerCase();
    const m = members.find((m) => m.email === r) || members.find((m) => m.name.toLowerCase() === r)
      || members.find((m) => m.name.toLowerCase().split(/\s+/)[0] === r.split(/\s+/)[0]);
    if (!m) throw bad(`No team member matches "${x}". Use list_team to see names.`);
    return m.email;
  });
}
const nameOf = (members, e) => members.find((m) => m.email === e)?.name || e;
const people = (members, v) => String(v || "").split(",").filter(Boolean).map((e) => nameOf(members, e));
const projectOut = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => !STRIP_PROJECT.includes(k)));

const S = (props, required = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const DATE = "Date as YYYY-MM-DD";

const POST_FIELDS = {
  title: str("Topic / hook"), format: str("Planned format", { enum: C_FORMATS }), platform: str("Platform", { enum: PLATFORMS }),
  status: str("Workflow status. 'Skipped' = slot won't happen; 'Moved' = replaced by another post. A post can be 'Delayed' and still have a posted_on date.", { enum: C_STATUS }),
  owners: { type: "array", items: { type: "string" }, description: "Names or emails" }, link: str("Draft or published link"), notes: str("Notes"),
  posted_on: str("The day it actually went live, " + DATE + ". Set this whenever a post goes out, even if it was late."),
  posted_as: str("If it went out in a different format than planned (e.g. planned Carousel, went out as Static)", { enum: C_FORMATS }),
  post_time: str("Posting time, HH:MM 24h"), delay_reason: str("Why it was late", { enum: DELAY_REASONS }),
  fulfils: str("ID of the planned calendar post this one replaces/fulfils (e.g. a backup carousel posted instead of a slipped reel). That slot becomes 'Moved'."),
  type: str("'Calendar' (planned), 'Ad-hoc' (client request) or 'Unplanned' (extra the team posted)", { enum: C_SOURCES }),
  requested_on: str("Ad-hoc only: day the client asked, " + DATE),
};

export const TOOLS = [
  { name: "list_projects", description: "List the studio's projects (Madking Studios and Space & Gravity) with stage, client, scope and team POCs. No financial data.",
    inputSchema: S({ include_closed: { type: "boolean", description: "Also include Delivered, Lost and On hold projects" } }), annotations: { readOnlyHint: true } },
  { name: "list_team", description: "List everyone who can be assigned work: name, email, job title, group.", inputSchema: S({}), annotations: { readOnlyHint: true } },
  { name: "list_tickets", description: "List tickets (tasks). Filter by project, person, or status.",
    inputSchema: S({ project: str("Project name or ID"), person: str("Name or email of a POC"), status: str("'open' (default), 'all', or one of: " + T_STATUS.join(", ")) }), annotations: { readOnlyHint: true } },
  { name: "create_tickets", description: "Create one or more tickets (assign work). Each needs a title, project and deadline.",
    inputSchema: S({ tickets: { type: "array", maxItems: 60, items: S({
      title: str("What needs to happen"), project: str("Project name or ID"), deadline: str(DATE),
      priority: str("P1 (high), P2 (medium, default) or P3 (low)", { enum: PRIORITIES.map(([k]) => k) }),
      status: str("Default 'To do'", { enum: T_STATUS }), kind: str("Default 'Internal'", { enum: T_KIND }),
      pocs: { type: "array", items: { type: "string" }, description: "People responsible (names or emails). Defaults to the project's team POCs." },
      notes: str("Context, links, feedback"),
    }, ["title", "project", "deadline"]) } }, ["tickets"]) },
  { name: "update_ticket", description: "Change a ticket: status, priority, deadline, POCs, title or notes. Get the ID from list_tickets.",
    inputSchema: S({ id: str("Ticket ID"), title: str("New title"), deadline: str(DATE), priority: str("P1, P2 or P3", { enum: PRIORITIES.map(([k]) => k) }),
      status: str("New status", { enum: T_STATUS }), kind: str("Ticket type", { enum: T_KIND }), pocs: { type: "array", items: { type: "string" }, description: "Replace POCs (names or emails)" }, notes: str("Replace notes") }, ["id"]) },
  { name: "list_content", description: "List content posts with planned date, posted date, delivery (on time / N days late / overdue / skipped / moved), type and delay reason. Filter by project, month or delivery.",
    inputSchema: S({ project: str("Project name or ID"), month: str("YYYY-MM (matches planned or posted month)"), status: str("Workflow status", { enum: C_STATUS }),
      delivery: str("Only posts in this delivery state", { enum: ["ontime", "late", "overdue", "delayed", "upcoming", "skipped", "moved"] }) }), annotations: { readOnlyHint: true } },
  { name: "add_content_posts", description: "Add posts to the content calendar (e.g. a client's monthly calendar), ad-hoc client requests, or unplanned extras that already went out. Check list_content first so posts aren't added twice.",
    inputSchema: S({ posts: { type: "array", maxItems: 120, items: S({ project: str("Project name or ID"), date: str("Planned date (or due date for ad-hoc), " + DATE), ...POST_FIELDS }, ["project", "date"]) } }, ["posts"]) },
  { name: "update_content_posts", description: "Update one or many posts in one go (e.g. record posted dates for a whole month). Use posted_on for the day a post went live. Get IDs from list_content.",
    inputSchema: S({ posts: { type: "array", maxItems: 200, items: S({ id: str("Post ID"), date: str("Planned date, " + DATE), ...POST_FIELDS }, ["id"]) } }, ["posts"]) },
  { name: "client_summary", description: "Per client: calendar posts due so far, posted on time, posted late (avg days, delay reasons), not posted, skipped/moved, unplanned extras; plus monthly retainer scope (delivered, remaining, backlog carried over).",
    inputSchema: S({ project: str("Optional: one project name or ID"), month: str("Month for the scope tracker, YYYY-MM (default this month)") }), annotations: { readOnlyHint: true } },
  { name: "delete_items", description: "Delete tickets or content posts by ID. Always confirm with the person before calling this.",
    inputSchema: S({ kind: str("What to delete", { enum: ["tickets", "content"] }), ids: { type: "array", items: { type: "string" }, maxItems: 100 } }, ["kind", "ids"]), annotations: { destructiveHint: true } },
  { name: "add_project_update", description: "Post a dated update on a project's page (progress, client feedback, decisions).",
    inputSchema: S({ project: str("Project name or ID"), text: str("The update") }, ["project", "text"]) },
  { name: "update_project_brief", description: "Edit a project's brief: pipeline stage, objective, audience, brand voice, plan, links, client POC, team POCs, monthly reels/statics scope. Budget can't be changed here.",
    inputSchema: S({ project: str("Project name or ID"), pipeline: str("Pipeline stage", { enum: PIPELINE }), objective: str(""), audience: str(""), brand: str("Brand voice"), plan: str("Plan / strategy"),
      links: str("Key links"), clientPoc: str("Client contact"), teamPocs: { type: "array", items: { type: "string" }, description: "Team POCs (names or emails)" },
      reels: { type: "number", description: "Reels per month (retainers)" }, statics: { type: "number", description: "Statics per month (retainers)" }, otherScope: str("Other deliverables") }, ["project"]) },
  { name: "list_schedule", description: "List shoots, recces and meetings from the studio schedule.",
    inputSchema: S({ from: str("Start " + DATE + " (default today)"), to: str("End " + DATE) }), annotations: { readOnlyHint: true } },
];

const today = () => istToday();
// Connector field names -> sheet fields.
function postChange(x, members) {
  const c = { ...x }; delete c.id; delete c.project;
  const ren = { posted_on: "postedAt", posted_as: "postedFormat", post_time: "postTime", delay_reason: "delayReason", fulfils: "linkedTo", type: "source", requested_on: "requestedOn" };
  for (const [k, v] of Object.entries(ren)) if (k in c) { c[v] = c[k]; delete c[k]; }
  if (c.owners) c.owners = peopleRefs(members, c.owners);
  return c;
}

export async function callTool(user, name, a = {}) {
  const now = new Date().toISOString();
  switch (name) {
    case "list_projects": {
      const { projects, members } = await context();
      const rows = projects.filter((p) => a.include_closed || !["Delivered", "Lost", "On hold"].includes(p.pipeline || "Active"));
      return rows.map((p) => ({ ...projectOut(p), teamPocs: people(members, p.teamPocs) }));
    }
    case "list_team": {
      const { members } = await context();
      return members.map(({ name, email, title, group }) => ({ name, email, title, group }));
    }
    case "list_tickets": {
      const { projects, members } = await context();
      let ts = await readTab("Tickets");
      if (a.project) { const p = projectRef(projects, a.project); ts = ts.filter((t) => t.projectId === p.id); }
      if (a.person) { const [e] = peopleRefs(members, [a.person]); ts = ts.filter((t) => String(t.pocs).split(",").includes(e)); }
      const st = a.status || "open";
      if (st === "open") ts = ts.filter((t) => t.status !== "Done"); else if (st !== "all") ts = ts.filter((t) => t.status === st);
      const pn = Object.fromEntries(projects.map((p) => [p.id, p.name]));
      return ts.sort((x, y) => String(x.deadline).localeCompare(String(y.deadline))).map((t) => ({
        id: t.id, title: t.title, project: pn[t.projectId] || t.projectId, priority: t.priority, status: t.status, deadline: t.deadline, kind: t.kind, pocs: people(members, t.pocs), notes: t.notes }));
    }
    case "create_tickets": {
      const { projects, members } = await context();
      const list = (a.tickets || []).slice(0, 60);
      if (!list.length) throw bad("No tickets given.");
      const t0 = Date.now();
      const rows = list.map((x, i) => {
        const p = projectRef(projects, x.project);
        const pocs = x.pocs && x.pocs.length ? peopleRefs(members, x.pocs) : String(p.teamPocs || "").split(",").filter(Boolean);
        const r = { ...cleanTicket({ ...x, projectId: p.id, pocs }), id: uid("T") + i, createdBy: user.name + " (via Claude)", createdAt: new Date(t0 + i).toISOString() };
        if (r.status === "Done") r.doneAt = now;
        return r;
      });
      await appendRows("Tickets", rows);
      return { created: rows.map((r) => ({ id: r.id, title: r.title, deadline: r.deadline, pocs: people(members, r.pocs) })) };
    }
    case "update_ticket": {
      const { members } = await context();
      const old = (await readTab("Tickets")).find((t) => t.id === a.id);
      if (!old) throw bad("No ticket with that ID.");
      const change = { ...a }; delete change.id;
      if (change.pocs) change.pocs = peopleRefs(members, change.pocs);
      const next = { ...old, ...cleanTicket({ ...old, ...change }) };
      if (next.status === "Done" && old.status !== "Done") next.doneAt = now;
      if (next.status !== "Done") next.doneAt = "";
      await updateRow("Tickets", old.id, next);
      return { ok: true, id: old.id, status: next.status, deadline: next.deadline };
    }
    case "list_content": {
      const { projects, members } = await context();
      const all = await readTab("Content");
      const links = linkIndex(all), byId = Object.fromEntries(all.map((c) => [c.id, c]));
      let cs = all;
      if (a.project) { const p = projectRef(projects, a.project); cs = cs.filter((c) => c.projectId === p.id); }
      if (a.month) cs = cs.filter((c) => String(c.date).slice(0, 7) === a.month || String(postedDay(c)).slice(0, 7) === a.month);
      if (a.status) cs = cs.filter((c) => c.status === a.status);
      const pn = Object.fromEntries(projects.map((p) => [p.id, p.name]));
      const out = cs.sort((x, y) => String(x.date).localeCompare(String(y.date))).map((c) => {
        const d = delivery(c, links, byId, today());
        return { id: c.id, project: pn[c.projectId] || c.projectId, plannedDate: c.date, postedOn: postedDay(c) || undefined, format: c.format, postedAs: c.postedFormat || undefined,
          title: c.title, status: c.status, delivery: d.state, daysLate: d.days || undefined, type: c.source || "Calendar", fulfils: c.linkedTo || undefined, replacedBy: d.via?.id,
          postTime: c.postTime || undefined, delayReason: c.delayReason || undefined, requestedOn: c.requestedOn || undefined, owners: people(members, c.owners), link: c.link || undefined, notes: c.notes || undefined };
      });
      return a.delivery ? out.filter((x) => x.delivery === a.delivery) : out;
    }
    case "add_content_posts": {
      const { projects, members } = await context();
      const list = (a.posts || []).slice(0, 120);
      if (!list.length) throw bad("No posts given.");
      const t0 = Date.now(), t = today();
      const rows = list.map((x, i) => {
        const p = projectRef(projects, x.project);
        const owners = x.owners && x.owners.length ? peopleRefs(members, x.owners) : String(p.teamPocs || "").split(",").filter(Boolean);
        const ch = postChange(x, members);
        const r = { ...cleanContent({ ...ch, projectId: p.id, date: x.date, owners, requestedOn: ch.requestedOn || (ch.source === "Ad-hoc" ? t : "") }), id: uid("C") + i, createdBy: user.name + " (via Claude)", createdAt: new Date(t0 + i).toISOString() };
        return postedDefaults(r, null);
      });
      const slots = rows.some((r) => r.linkedTo) ? slotUpdates(rows, await readTab("Content")) : [];
      await appendRows("Content", rows);
      if (slots.length) await updateRows("Content", slots);
      return { added: rows.length, posts: rows.map((r) => ({ id: r.id, date: r.date, format: r.format, title: r.title, status: r.status, postedOn: r.postedAt || undefined })) };
    }
    case "update_content_posts": {
      const { members } = await context();
      const all = await readTab("Content");
      const byId = Object.fromEntries(all.map((c) => [c.id, c]));
      const changed = [], missing = [];
      for (const x of (a.posts || []).slice(0, 200)) {
        const old = byId[x.id];
        if (!old) { missing.push(x.id); continue; }
        const next = { ...old, ...cleanContent({ ...old, ...postChange(x, members) }) };
        changed.push(postedDefaults(next, old));
      }
      const slots = slotUpdates(changed, all).filter((sl) => !changed.some((c) => c.id === sl.id));
      await updateRows("Content", [...changed, ...slots]);
      return { updated: changed.length, slotsMarkedMoved: slots.length || undefined, notFound: missing.length ? missing : undefined };
    }
    case "client_summary": {
      const { projects } = await context();
      const all = await readTab("Content");
      const ym = a.month || today().slice(0, 7);
      let ps = projects.filter((p) => all.some((c) => c.projectId === p.id));
      if (a.project) { const p = projectRef(projects, a.project); ps = [p]; }
      return ps.map((p) => {
        const t = clientTally(all.filter((c) => c.projectId === p.id), today());
        const sc = scopeFor(p, all, ym);
        return { client: p.name, dueSoFar: t.due, postedOnTime: t.ontime, postedLate: t.late, avgDaysLate: t.late ? +(t.lateDays / t.late).toFixed(1) : 0, delayReasons: t.reasons,
          notPosted: t.notPosted, skipped: t.skipped, moved: t.moved, unplannedExtras: t.extras, upcoming: t.upcoming,
          scope: (sc.reels.scope || sc.statics.scope) ? { month: ym, reels: sc.reels, staticsAndCarousels: sc.statics, plannedThisMonth: sc.planned, backlogSince: sc.since } : undefined };
      });
    }
    case "delete_items": {
      const tab = a.kind === "tickets" ? "Tickets" : a.kind === "content" ? "Content" : null;
      if (!tab) throw bad("kind must be tickets or content.");
      const have = new Set((await readTab(tab)).map((r) => r.id));
      const ids = (a.ids || []).filter((id) => have.has(id));
      if (!ids.length) throw bad("None of those IDs exist.");
      await deleteRows(tab, ids);
      return { deleted: ids.length };
    }
    case "add_project_update": {
      const { projects } = await context();
      const p = projectRef(projects, a.project);
      const r = { ...cleanUpdate({ projectId: p.id, text: a.text }), id: uid("U"), date: today(), by: user.name + " (via Claude)", at: now };
      await appendRows("Updates", [r]);
      return { ok: true, project: p.name };
    }
    case "update_project_brief": {
      const { projects, members } = await context();
      const old = projectRef(projects, a.project);
      const change = { ...a }; delete change.project; delete change.budget;
      if (change.teamPocs) change.teamPocs = peopleRefs(members, change.teamPocs);
      const p = cleanProject({ ...old, ...change, budget: old.budget }); // budget always kept as it was
      await updateRow("Projects", old.id, { ...old, ...p, budget: old.budget });
      return { ok: true, project: old.name };
    }
    case "list_schedule": {
      const { projects } = await context();
      const from = a.from || today(), to = a.to || "9999-12-31";
      const pn = Object.fromEntries(projects.map((p) => [p.id, p.name]));
      return (await readTab("Schedule")).filter((e) => e.date >= from && e.date <= to).sort((x, y) => String(x.date).localeCompare(String(y.date)))
        .map((e) => ({ title: e.title, kind: e.kind, project: pn[e.project] || e.project, date: e.date, endDate: e.endDate, start: e.start, end: e.end, callTime: e.callTime, location: e.location, notes: e.notes }));
    }
    default: throw bad(`Unknown tool ${name}.`);
  }
}

export const INSTRUCTIONS = `Studio Ledger work tools for The Madking Studios and Space & Gravity: projects, tickets (tasks), the content calendar, project updates and the shoot schedule.
There is no financial data here.
Content posts: each row is ONE post with a planned date and, once live, a posted_on date (never add a second row for a late post; set posted_on on the planned row).
Types: Calendar (planned), Ad-hoc (client request), Unplanned (an extra the team posted). Statuses Skipped / Moved close a slot; "fulfils" links a replacement post to the slot it replaces.
Record delay_reason for late posts when known. Use update_content_posts to change many posts in one call (avoids Google rate limits). When uploading a content calendar, call list_content for that project and month first so posts aren't added twice. Dates are YYYY-MM-DD (India time). Confirm with the person before deleting anything.`;
