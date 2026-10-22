import { PROJECT_TYPES, SEGMENTS, EVENT_KINDS, PEOPLE_KINDS } from "./config";
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
  return { name, segment, type, stage, client: s(x.client, 120), budget: num(x.budget), start: date(x.start), end: date(x.end), notes: s(x.notes, 1000), plan: s(x.plan, 5000) };
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
