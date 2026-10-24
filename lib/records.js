import { PROJECT_TYPES, SEGMENTS, EVENT_KINDS, PEOPLE_KINDS, PIPELINE, ENGAGEMENTS, INDUSTRIES, PLATFORMS, PALETTE, PRIORITIES, T_STATUS, T_KIND, C_FORMATS, C_STATUS } from "./config";
const s = (v, n = 300) => String(v ?? "").trim().slice(0, n);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
const time = (v) => (/^\d{1,2}:\d{2}$/.test(v || "") ? v.padStart(5, "0") : "");
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[₹,\s]/g, "")); return isFinite(n) ? n : 0; };
const bad = (m) => { const e = new Error(m); e.status = 400; return e; };

export function cleanProject(x) {
  const segment = ["Madking Studios", "Space & Gravity"].includes(x.segment) ? x.segment : null;
  if (!segment) throw bad("Pick Madking Studios or Space & Gravity.");
  const types = PROJECT_TYPES[segment];
  const type = types[x.type] ? x.type : Object.keys(types)[0];
  const stage = types[type].includes(x.stage) ? x.stage : types[type][0];
  const name = s(x.name, 120);
  if (!name) throw bad("Give the project a name.");
  const list = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((c) => String(c).trim()).filter(Boolean);
  return {
    name, segment, type, stage, client: s(x.client, 120), budget: num(x.budget), start: date(x.start), end: date(x.end), notes: s(x.notes, 3000), plan: s(x.plan, 5000),
    pipeline: PIPELINE.includes(x.pipeline) ? x.pipeline : "Active",
    engagement: ENGAGEMENTS.includes(x.engagement) ? x.engagement : segment === "Space & Gravity" ? "Retainer" : "One-time",
    industry: INDUSTRIES.includes(x.industry) ? x.industry : "",
    reels: Math.max(0, Math.floor(num(x.reels))), statics: Math.max(0, Math.floor(num(x.statics))),
    otherScope: s(x.otherScope, 300), objective: s(x.objective, 2000), audience: s(x.audience, 1000), brand: s(x.brand, 2000),
    platforms: list(x.platforms).filter((p) => PLATFORMS.includes(p)).join(","),
    links: s(x.links, 2000), clientPoc: s(x.clientPoc, 500),
    teamPocs: list(x.teamPocs).map((e) => e.toLowerCase()).filter((e) => e.includes("@")).join(","),
    color: PALETTE.includes(x.color) ? x.color : "",
  };
}

const emails = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes("@")).join(",");

export function cleanTicket(x) {
  const title = s(x.title, 200);
  if (!title) throw bad("Give the ticket a name.");
  if (!s(x.projectId, 40)) throw bad("Choose the project this ticket belongs to.");
  if (!date(x.deadline)) throw bad("Set a deadline. Every ticket needs one.");
  return {
    projectId: s(x.projectId, 40), title,
    priority: PRIORITIES.some(([k]) => k === x.priority) ? x.priority : "P2",
    status: T_STATUS.includes(x.status) ? x.status : "To do",
    kind: T_KIND.includes(x.kind) ? x.kind : "Internal",
    pocs: emails(x.pocs), deadline: x.deadline, notes: s(x.notes, 3000),
  };
}

export function cleanContent(x) {
  if (!s(x.projectId, 40)) throw bad("Choose the project this post belongs to.");
  if (!date(x.date)) throw bad("Set a post date.");
  return {
    projectId: s(x.projectId, 40), date: x.date,
    format: C_FORMATS.includes(x.format) ? x.format : "Reel",
    platform: PLATFORMS.includes(x.platform) ? x.platform : "Instagram",
    title: s(x.title, 200), status: C_STATUS.includes(x.status) ? x.status : "Idea",
    owners: emails(x.owners), link: s(x.link, 500), notes: s(x.notes, 3000),
  };
}

export function cleanUpdate(x) {
  const text = s(x.text, 3000);
  if (!text) throw bad("Write the update first.");
  if (!s(x.projectId, 40)) throw bad("Missing project.");
  return { projectId: s(x.projectId, 40), text };
}

export function cleanEvent(x) {
  const title = s(x.title, 160);
  if (!title) throw bad("Give the schedule entry a title.");
  if (!date(x.date)) throw bad("Pick a date.");
  return {
    title, project: s(x.project, 120), kind: EVENT_KINDS.includes(x.kind) ? x.kind : "Other",
    date: x.date, endDate: date(x.endDate) && x.endDate > x.date ? x.endDate : "",
    start: time(x.start), end: time(x.end), callTime: time(x.callTime),
    location: s(x.location, 300), notes: s(x.notes, 3000),
    crew: (Array.isArray(x.crew) ? x.crew : String(x.crew || "").split(",")).map((c) => s(c, 40)).filter(Boolean).join(","),
  };
}

export function cleanPerson(x) {
  const name = s(x.name, 120);
  if (!name) throw bad("Enter a name.");
  return { name, kind: PEOPLE_KINDS.includes(x.kind) ? x.kind : "Crew", department: s(x.department, 60), role: s(x.role, 80), phone: s(x.phone, 40), email: s(x.email, 120), rate: num(x.rate), rateUnit: s(x.rateUnit, 30), notes: s(x.notes, 1000) };
}
export { SEGMENTS };
