"use client";
import { Fragment, useMemo, useState } from "react";
import { SEGMENTS, TAX_CAT } from "@/lib/config";
import { rs, ym, monthLabel, shiftMonth, segOf } from "./util";
import { EntryRow } from "./Finance";

// Money by client and by project (partners only).
// Client = the project's Client field; if that's empty, whoever paid us for it most often; else the project name.
// "General" entries are each company's overheads and are listed separately.

const norm = (s) => String(s || "").trim().toLowerCase();
// "Atom Social", "ATOM SOCIAL LLP" and "Atom Social LLP." are one client.
const clientKey = (s) => norm(s).replace(/[.,()&]/g, " ").replace(/\b(llp|pvt|private|ltd|limited|inc|co|company|the)\b/g, " ").replace(/\s+/g, " ").trim();

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
    // Payer spellings for the same company are merged before picking the main payer.
    if (pay) return Object.entries(pay).sort((a, b) => b[1] - a[1])[0][0];
    return project;
  };
}

function rollup(entries, projects, clientOf) {
  const byName = Object.fromEntries(projects.map((p) => [norm(p.name), p]));
  const proj = {};
  for (const e of entries) {
    const general = !e.project || e.project === "General";
    const key = general ? `__${e.segment}` : `${e.segment}|${norm(e.project)}`;
    const r = (proj[key] ||= { key, general, segment: e.segment, name: general ? `${segOf(e.segment).short || e.segment} overheads` : e.project, entries: [], received: 0, pending: 0, spent: 0, owed: 0, tax: 0 });
    r.entries.push(e);
    const amt = Number(e.amount) || 0;
    if (e.type === "Income") { if (e.status === "Pending") r.pending += amt; else r.received += amt; }
    else if (e.category === TAX_CAT) r.tax += Number(e.total) || amt;
    else { r.spent += amt; if (e.status === "Payable") r.owed += amt; }
  }
  const rows = Object.values(proj).map((r) => {
    const p = r.general ? null : byName[norm(r.name)];
    const budget = Number(p?.budget) || 0;
    return { ...r, project: p, budget, client: r.general ? "Overheads" : clientOf(r.name), net: r.received - r.spent };
  });
  const clients = {};
  for (const r of rows.filter((x) => !x.general)) {
    const ck = clientKey(r.client) || norm(r.client);
    if (clients[ck] && r.client.length > clients[ck].name.length) clients[ck].name = r.client; // keep the fullest spelling
    const c = (clients[ck] ||= { name: r.client, rows: [], received: 0, pending: 0, spent: 0, owed: 0, budget: 0, segments: new Set() });
    c.rows.push(r); c.segments.add(r.segment);
    for (const k of ["received", "pending", "spent", "owed", "budget"]) c[k] += r[k];
  }
  const list = Object.values(clients).map((c) => ({ ...c, net: c.received - c.spent }));
  return { clients: list, overheads: rows.filter((x) => x.general) };
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const SORTS = [["net", "Net"], ["received", "Money in"], ["spent", "Money out"], ["name", "Name"]];

export function BudgetsView({ data, openEntry }) {
  const [period, setPeriod] = useState("all");
  const [month, setMonth] = useState(ym(new Date()));
  const [seg, setSeg] = useState("All");
  const [sort, setSort] = useState("net");
  const [open, setOpen] = useState({});
  const L = data.ledger;
  const clientOf = useMemo(() => clientIndex(L, data.projects), [L, data.projects]);
  const entries = L.filter((e) => (seg === "All" || e.segment === seg) && (period === "all" || String(e.date).slice(0, 7) === month));
  const { clients, overheads } = useMemo(() => rollup(entries, data.projects, clientOf), [entries, data.projects, clientOf]);
  const by = (a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b[sort] - a[sort]);
  clients.sort(by); clients.forEach((c) => c.rows.sort(by));
  const tot = clients.reduce((t, c) => ({ received: t.received + c.received, pending: t.pending + c.pending, spent: t.spent + c.spent }), { received: 0, pending: 0, spent: 0 });
  const oh = overheads.reduce((a, r) => a + r.spent, 0);
  const toggle = (k) => setOpen({ ...open, [k]: !open[k] });
  const now = ym(new Date());
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Clients & projects</h2>
          <p className="hint">Money in and out for every client and project, against budget. Amounts excl. GST. Overheads (entries with no project) are shown separately.</p></div>
      </div>
      <div className="filters">
        <div className="seg2" role="group">{[["all", "All time"], ["month", "One month"]].map(([k, l]) => <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}</div>
        {period === "month" && (
          <div className="monthbar tight">
            <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
            <b>{monthLabel(month)}</b>
            <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= now} aria-label="Next month">›</button>
          </div>
        )}
        <div className="chips">{["All", ...SEGMENTS.filter((s) => s.key !== "Office").map((s) => s.key)].map((s) => <button key={s} className="chip" aria-pressed={seg === s} onClick={() => setSeg(s)}>{s === "All" ? "Both companies" : segOf(s).short}</button>)}</div>
        <label className="filter">Sort<select className="mini" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="kpis bk">
        <div className="kpi"><b>{rs(tot.received)}</b><span>Received from clients</span></div>
        <div className="kpi"><b>{rs(tot.spent)}</b><span>Spent on projects</span></div>
        <div className={`kpi ${tot.received - tot.spent < 0 ? "bad" : ""}`}><b>{rs(tot.received - tot.spent)}</b><span>Project net</span></div>
        <div className="kpi"><b>{rs(oh)}</b><span>Overheads</span></div>
        <div className={`kpi ${tot.received - tot.spent - oh < 0 ? "bad" : ""}`}><b>{rs(tot.received - tot.spent - oh)}</b><span>After overheads</span></div>
        <div className="kpi"><b>{rs(tot.pending)}</b><span>Still to receive</span></div>
      </div>

      <div className="btable" role="table">
        <div className="btr head" role="row"><span>Client / project</span><span>Budget</span><span>Money in</span><span>Money out</span><span>Net</span><span>Budget used</span><span>To receive</span></div>
        {!clients.length && <div className="empty">No client or project entries {period === "month" ? `in ${monthLabel(month)}` : "yet"}.</div>}
        {clients.map((c) => {
          const single = c.rows.length === 1 && norm(c.rows[0].name) === norm(c.name);
          return (
            <Fragment key={c.name}>
              <button className={`btr client${c.net < 0 ? " neg" : ""}`} role="row" onClick={() => toggle("c:" + c.name)} aria-expanded={!!open["c:" + c.name]}>
                <span className="bname"><i className="caret">{open["c:" + c.name] ? "▾" : "▸"}</i>{c.name}{!single && <small className="faint"> · {c.rows.length === 1 ? c.rows[0].name : `${c.rows.length} projects`}</small>}{[...c.segments].map((s) => <i key={s} className={`seg-dot ${segOf(s).cls}`} title={s} />)}</span>
                <span data-l="Budget">{c.budget ? rs(c.budget) : <span className="faint">–</span>}</span>
                <span data-l="Money in" className="in">{rs(c.received)}</span>
                <span data-l="Money out">{rs(c.spent)}</span>
                <span data-l="Net" className="netv">{rs(c.net)}{c.received > 0 && <small className="faint"> {pct(c.net, c.received)}%</small>}</span>
                <span data-l="Budget used"><Used spent={c.spent} budget={c.budget} /></span>
                <span data-l="To receive">{c.pending ? rs(c.pending) : <span className="faint">–</span>}</span>
              </button>
              {open["c:" + c.name] && c.rows.map((r) => (
                <Fragment key={r.key}>
                  <button className={`btr proj${r.net < 0 ? " neg" : ""}`} role="row" onClick={() => toggle(r.key)} aria-expanded={!!open[r.key]}>
                    <span className="bname"><i className="caret">{open[r.key] ? "▾" : "▸"}</i><i className={`seg-dot ${segOf(r.segment).cls}`} />{r.name}<small className="faint"> · {r.entries.length} entries</small></span>
                    <span data-l="Budget">{r.budget ? rs(r.budget) : <span className="faint">not set</span>}</span>
                    <span data-l="Money in" className="in">{rs(r.received)}</span>
                    <span data-l="Money out">{rs(r.spent)}</span>
                    <span data-l="Net" className="netv">{rs(r.net)}</span>
                    <span data-l="Budget used"><Used spent={r.spent} budget={r.budget} /></span>
                    <span data-l="To receive">{r.pending ? rs(r.pending) : <span className="faint">–</span>}</span>
                  </button>
                  {open[r.key] && <div className="bentries list">{[...r.entries].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => <EntryRow key={e.id} e={e} onOpen={openEntry} />)}</div>}
                </Fragment>
              ))}
            </Fragment>
          );
        })}
        {overheads.length > 0 && <div className="btr sub head" role="row"><span>Overheads (no project)</span><span /><span /><span>Money out</span><span /><span /><span /></div>}
        {overheads.map((r) => (
          <Fragment key={r.key}>
            <button className="btr proj" role="row" onClick={() => toggle(r.key)} aria-expanded={!!open[r.key]}>
              <span className="bname"><i className="caret">{open[r.key] ? "▾" : "▸"}</i><i className={`seg-dot ${segOf(r.segment).cls}`} />{r.name}<small className="faint"> · {r.entries.length} entries</small></span>
              <span /><span data-l="Money in" className="in">{r.received ? rs(r.received) : ""}</span><span data-l="Money out">{rs(r.spent)}</span><span /><span /><span />
            </button>
            {open[r.key] && <div className="bentries list">{[...r.entries].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => <EntryRow key={e.id} e={e} onOpen={openEntry} />)}</div>}
          </Fragment>
        ))}
      </div>
      <p className="hint">Budgets come from each project's page. A project without a Client field is grouped under whoever paid for it; set the Client on the project to group it differently.</p>
    </>
  );
}

function Used({ spent, budget }) {
  const p = pct(spent, budget);
  if (p === null) return <span className="faint">–</span>;
  return <span className={`used${p > 100 ? " over" : p > 85 ? " warn" : ""}`}><i className="meter"><b style={{ width: Math.min(100, p) + "%" }} /></i>{p}%</span>;
}
