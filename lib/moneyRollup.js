// Money by client and project, shared by the "Clients & projects" page and Whiskey.
import { SEGMENTS, TAX_CAT } from "./config";

export const norm = (s) => String(s || "").trim().toLowerCase();
// "Atom Social", "ATOM SOCIAL LLP" and "Atom Social LLP." are one client.
export const clientKey = (s) => norm(s).replace(/[.,()&]/g, " ").replace(/\b(llp|pvt|private|ltd|limited|inc|co|company|the)\b/g, " ").replace(/\s+/g, " ").trim();
const short = (seg) => SEGMENTS.find((s) => s.key === seg)?.short || seg;

// Client of a project: the project's Client field; else whoever paid for it most; else the project name.
export function clientIndex(ledger, projects) {
  const byName = Object.fromEntries(projects.map((p) => [norm(p.name), p]));
  const payers = {};
  for (const e of ledger) {
    if (e.type !== "Income" || !e.project || e.project === "General" || !e.party) continue;
    const k = norm(e.project);
    (payers[k] ||= {})[e.party] = (payers[k][e.party] || 0) + (Number(e.amount) || 0);
  }
  return (project) => {
    const p = byName[norm(project)];
    if (p && String(p.client || "").trim()) return String(p.client).trim();
    const pay = payers[norm(project)];
    if (pay) return Object.entries(pay).sort((a, b) => b[1] - a[1])[0][0];
    return project;
  };
}

export function rollup(entries, projects, clientOf) {
  const byName = Object.fromEntries(projects.map((p) => [norm(p.name), p]));
  const proj = {};
  for (const e of entries) {
    const general = !e.project || e.project === "General";
    const key = general ? `__${e.segment}` : `${e.segment}|${norm(e.project)}`;
    const r = (proj[key] ||= { key, general, segment: e.segment, name: general ? `${short(e.segment)} overheads` : e.project, entries: [], received: 0, pending: 0, spent: 0, owed: 0, tax: 0 });
    r.entries.push(e);
    const amt = Number(e.amount) || 0;
    if (e.type === "Income") { if (e.status === "Pending") r.pending += amt; else r.received += amt; }
    else if (e.category === TAX_CAT) r.tax += Number(e.total) || amt;
    else { r.spent += amt; if (e.status === "Payable") r.owed += amt; }
  }
  const rows = Object.values(proj).map((r) => {
    const p = r.general ? null : byName[norm(r.name)];
    return { ...r, project: p, budget: Number(p?.budget) || 0, client: r.general ? "Overheads" : clientOf(r.name), net: r.received - r.spent };
  });
  const clients = {};
  for (const r of rows.filter((x) => !x.general)) {
    const ck = clientKey(r.client) || norm(r.client);
    if (clients[ck] && r.client.length > clients[ck].name.length) clients[ck].name = r.client;
    const c = (clients[ck] ||= { name: r.client, rows: [], received: 0, pending: 0, spent: 0, owed: 0, budget: 0, segments: new Set() });
    c.rows.push(r); c.segments.add(r.segment);
    for (const k of ["received", "pending", "spent", "owed", "budget"]) c[k] += r[k];
  }
  return { clients: Object.values(clients).map((c) => ({ ...c, net: c.received - c.spent })), overheads: rows.filter((x) => x.general) };
}
