// Studio work tools for Claude (remote MCP connector).
// Deliberately has NO access to money: it never reads or writes the Ledger tab, project budgets or crew rates,
// whoever's link is used. Everything here is something any signed-in team member can already do in the app.
import { createHash } from "crypto";
import { readTab, readTabs, appendRows, updateRow, deleteRows } from "./google";
import { cleanTicket, cleanContent, cleanUpdate, cleanProject } from "./records";
import { membersFrom } from "./members";
import { roleFor, uid } from "./access";
import { istToday } from "./ist";
import { PRIORITIES, T_STATUS, T_KIND, C_FORMATS, C_STATUS, PLATFORMS, PIPELINE } from "./config";

export const hashKey = (k) => createHash("sha256").update(String(k)).digest("hex");

// Find whose personal link this is. Removing someone from the team (or regenerating the link) cuts it off.
export async function userForKey(key) {
  if (!key || String(key).length < 20) return null;
  const h = hashKey(key);
  const rows = await readTab("Team");
  const row = rows.find((r) => r.mcpKey && r.mcpKey === h);
  if (!row) return null;
  const email = String(row.email).toLowerCase();
  const role = await roleFor(email);
  if (!role) return null;
  return { email, name: row.name || email, role };
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
  { name: "list_content", description: "List content-calendar posts. Filter by project and/or month.",
    inputSchema: S({ project: str("Project name or ID"), month: str("YYYY-MM"), status: str("One of: " + C_STATUS.join(", ")) }), annotations: { readOnlyHint: true } },
  { name: "add_content_posts", description: "Add posts to the content calendar, e.g. when uploading a client's monthly content calendar. Check list_content first to avoid adding the same post twice.",
    inputSchema: S({ posts: { type: "array", maxItems: 120, items: S({
      project: str("Project name or ID"), date: str("Post date, " + DATE), format: str("Default Reel", { enum: C_FORMATS }),
      title: str("Topic / hook"), status: str("Default Idea", { enum: C_STATUS }), platform: str("Default Instagram", { enum: PLATFORMS }),
      owners: { type: "array", items: { type: "string" }, description: "Names or emails. Defaults to the project's team POCs." },
      link: str("Draft or published link"), notes: str("Series, objective, CTA, reference links"), posted_on: str("If already posted: the day it went live, " + DATE),
    }, ["project", "date"]) } }, ["posts"]) },
  { name: "update_content_post", description: "Change a content post: date, status (e.g. Posted or Delayed), title, format, owners, link or notes. Get the ID from list_content.",
    inputSchema: S({ id: str("Post ID"), date: str(DATE), status: str("New status", { enum: C_STATUS }), title: str("Topic / hook"), format: str("Format", { enum: C_FORMATS }),
      platform: str("Platform", { enum: PLATFORMS }), owners: { type: "array", items: { type: "string" } }, link: str("Link"), notes: str("Replace notes"), posted_on: str("Day it went live, " + DATE) }, ["id"]) },
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
const isPostedLike = (s) => s === "Posted";

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
      let cs = await readTab("Content");
      if (a.project) { const p = projectRef(projects, a.project); cs = cs.filter((c) => c.projectId === p.id); }
      if (a.month) cs = cs.filter((c) => String(c.date).slice(0, 7) === a.month);
      if (a.status) cs = cs.filter((c) => c.status === a.status);
      const pn = Object.fromEntries(projects.map((p) => [p.id, p.name]));
      return cs.sort((x, y) => String(x.date).localeCompare(String(y.date))).map((c) => ({
        id: c.id, project: pn[c.projectId] || c.projectId, date: c.date, format: c.format, platform: c.platform, title: c.title, status: c.status, owners: people(members, c.owners), link: c.link, notes: c.notes }));
    }
    case "add_content_posts": {
      const { projects, members } = await context();
      const list = (a.posts || []).slice(0, 120);
      if (!list.length) throw bad("No posts given.");
      const t0 = Date.now(), t = today();
      const rows = list.map((x, i) => {
        const p = projectRef(projects, x.project);
        const owners = x.owners && x.owners.length ? peopleRefs(members, x.owners) : String(p.teamPocs || "").split(",").filter(Boolean);
        const r = { ...cleanContent({ ...x, projectId: p.id, owners, postedAt: x.posted_on }), id: uid("C") + i, createdBy: user.name + " (via Claude)", createdAt: new Date(t0 + i).toISOString() };
        if (isPostedLike(r.status) && !r.postedAt) r.postedAt = r.date < t ? r.date : t;
        return r;
      });
      await appendRows("Content", rows);
      return { added: rows.length, posts: rows.map((r) => ({ id: r.id, date: r.date, format: r.format, title: r.title, status: r.status })) };
    }
    case "update_content_post": {
      const { members } = await context();
      const old = (await readTab("Content")).find((c) => c.id === a.id);
      if (!old) throw bad("No post with that ID.");
      const change = { ...a }; delete change.id;
      if (change.owners) change.owners = peopleRefs(members, change.owners);
      if (change.posted_on) { change.postedAt = change.posted_on; delete change.posted_on; }
      const merged = { ...old, ...change };
      if (!("postedAt" in change) && change.status && change.status !== "Posted") merged.postedAt = "";
      const next = { ...old, ...cleanContent(merged) };
      if (next.status === "Posted" && old.status !== "Posted" && !next.postedAt) next.postedAt = today();
      await updateRow("Content", old.id, next);
      return { ok: true, id: old.id, date: next.date, status: next.status };
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
There is no financial data here. When uploading a content calendar, call list_content for that project and month first so posts aren't added twice. Dates are YYYY-MM-DD (India time). Confirm with the person before deleting anything.`;
