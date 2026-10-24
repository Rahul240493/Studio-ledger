"use client";
import { useEffect, useState } from "react";
import { PROJECT_TYPES, PIPELINE, PIPE_ORDER, ENGAGEMENTS, INDUSTRIES, PLATFORMS, PALETTE } from "@/lib/config";
import { api, rs, fmtDate, fmtTime, today } from "./util";
import { Modal, Field, Select, Confirm, useToast } from "./ui";
import { useWork, Seg, Dot, Avatar, Avatars, PeoplePicker } from "./workui";
import { TicketTable, TicketLine, DeadlinesCalendar, TemplateModal } from "./Tickets";
import { ContentView, OutputRows } from "./Content";
import { StatusPill } from "./Work";
import { spentOn, receivedOn, EntryRow } from "./Finance";
import { isOpen, parseISO, byDeadline, dueInfo, plural, scopeText, splitList, sortTickets, memberMap, pipelineOf, sortProjects, ymNow } from "./workdata";

/* ---------- list ---------- */
export function ProjectsView() {
  const w = useWork();
  const [eng, setEng] = useState("");
  const [co, setCo] = useState("");
  const [adding, setAdding] = useState(!!w.route.newProject);
  let ps = sortProjects(w.data.projects);
  if (eng) ps = ps.filter((p) => (p.engagement || "One-time") === eng);
  if (co) ps = ps.filter((p) => p.segment === co);
  const groups = PIPE_ORDER.map((st) => [st, ps.filter((p) => pipelineOf(p) === st)]).filter((g) => g[1].length);
  const loose = w.data.me.isPartner ? [...new Set((w.data.ledger || []).filter((e) => e.project && e.project !== "General" && !w.data.projects.some((p) => p.name === e.project)).map((e) => e.project))] : [];
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Projects</h2><p className="hint">{ps.length} {plural(ps.length, "project")}, grouped by stage. Select one to open its page.</p></div>
        <button className="btn primary" onClick={() => setAdding(true)}>New project</button>
      </div>
      <div className="filters">
        <Seg options={[["", "Both companies"], ["Madking Studios", "Madking"], ["Space & Gravity", "S&G"]]} value={co} onChange={setCo} />
        <Seg options={[["", "All"], ...ENGAGEMENTS.map((t) => [t, t])]} value={eng} onChange={setEng} />
      </div>
      {groups.length ? groups.map(([st, arr]) => (
        <section key={st} className="col tight">
          <h3 className="group-h">{st} <span className="count">{arr.length}</span></h3>
          <div className="plist">{arr.map((p) => <ProjectRow key={p.id} p={p} />)}</div>
        </section>
      )) : <div className="empty-box"><p>No projects match.</p><p>Change the filter or add a project.</p></div>}
      {loose.length > 0 && <div className="panel col"><h3>Logged but not set up</h3><div className="hint">These names appear in the ledger but aren't projects yet.</div>
        <div className="chips">{loose.map((n) => <button key={n} className="chip" onClick={() => setAdding({ name: n })}>+ {n}</button>)}</div></div>}
      {adding && <NewProjectModal seed={typeof adding === "object" ? adding : {}} onClose={() => setAdding(false)} />}
    </>
  );
}

function ProjectRow({ p }) {
  const w = useWork();
  const members = memberMap(w.data);
  const open = w.data.tickets.filter((t) => t.projectId === p.id && isOpen(t));
  const next = open.filter((t) => parseISO(t.deadline)).sort(byDeadline)[0];
  const di = next ? dueInfo(next.deadline) : null;
  const isP = w.data.me.isPartner;
  const spent = isP ? spentOn(w.data.ledger, p) : 0, pct = isP && p.budget ? (spent / p.budget) * 100 : 0;
  return (
    <button className="prow" onClick={() => w.go({ view: "project", id: p.id })}>
      <span className="prow-name"><Dot p={p} size={12} /><span>{p.name}</span></span>
      <span className="c-ind muted">{p.segment === "Madking Studios" ? "Madking" : "S&G"} · {p.type}</span>
      <span className="c-type"><span className="pill">{p.engagement || "One-time"}</span></span>
      <span className="c-scope muted">{isP && p.budget ? <span className={pct > 100 ? "danger-text" : ""}>{Math.round(pct)}% of {rs(p.budget)}</span> : scopeText(p) || p.stage || "Scope not set"}</span>
      <span className="c-poc"><Avatars emails={splitList(p.teamPocs)} members={members} max={3} /></span>
      <span className="c-open">{open.length ? `${open.length} open` : <span className="faint">No open tickets</span>}</span>
      <span className={`c-next due ${di ? di.cls : ""}`}>{di ? di.text : ""}</span>
    </button>
  );
}

/* ---------- new project ---------- */
function NewProjectModal({ seed, onClose }) {
  const w = useWork();
  const toast = useToast();
  const [f, setF] = useState({ name: "", segment: "Space & Gravity", type: "", engagement: "Retainer", pipeline: "Lead", industry: "", reels: 0, statics: 0, client: "", budget: "", start: "", ...seed });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const types = Object.keys(PROJECT_TYPES[f.segment]);
  const type = types.includes(f.type) ? f.type : types[0];
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  async function save() {
    if (!f.name.trim()) return setErr("Give the project a name.");
    setBusy(true);
    try {
      const stage = PROJECT_TYPES[f.segment][type][0];
      const r = await api("/api/projects", { method: "POST", body: { ...f, type, stage } });
      toast("Project added"); onClose(); await w.reload(); if (r.id) w.go({ view: "project", id: r.id });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <Modal title="New project" onClose={onClose}>
      <div className="grid">
        <Field label="Name" wide><input value={f.name} onChange={set("name")} placeholder="Client or project name" autoFocus /></Field>
        <Field label="Company"><Select value={f.segment} options={["Madking Studios", "Space & Gravity"]} onChange={(v) => setF({ ...f, segment: v, type: "", engagement: v === "Space & Gravity" ? "Retainer" : "One-time" })} /></Field>
        <Field label="Type"><Select value={type} options={types} onChange={set("type")} /></Field>
        <div className="wide col tight"><span className="flabel">Engagement</span><Seg options={ENGAGEMENTS} value={f.engagement} onChange={set("engagement")} /></div>
        <Field label="Pipeline stage"><Select value={f.pipeline} options={PIPELINE} onChange={set("pipeline")} /></Field>
        <Field label="Industry"><Select value={f.industry} options={INDUSTRIES} onChange={set("industry")} blank="Not set" /></Field>
        <Field label={f.engagement === "Retainer" ? "Reels per month" : "Reels"}><input type="number" min="0" value={f.reels} onChange={set("reels")} /></Field>
        <Field label={f.engagement === "Retainer" ? "Statics per month" : "Statics"}><input type="number" min="0" value={f.statics} onChange={set("statics")} /></Field>
        <Field label="Client"><input value={f.client} onChange={set("client")} /></Field>
        {w.data.me.isPartner && <Field label="Budget excl. GST (₹)"><input inputMode="decimal" value={f.budget} onChange={set("budget")} /></Field>}
        <Field label="Start date"><input type="date" value={f.start} onChange={set("start")} /></Field>
      </div>
      <p className="hint">Everything else (objective, brand voice, POCs) goes on the project page.</p>
      {err && <div className="banner">{err}</div>}
      <div className="row"><button className="btn primary" onClick={save} disabled={busy}>Add project</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

/* ---------- project page ---------- */
export function ProjectPage() {
  const w = useWork();
  const p = w.projectById[w.route.id];
  const [tpl, setTpl] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [sort, setSort] = useState("deadline");
  if (!p) return <div className="empty-box"><p>This project was deleted or doesn't exist.</p><div><button className="btn" onClick={() => w.go({ view: "projects" })}>All projects</button></div></div>;
  const tab = w.route.tab || "overview";
  const isP = w.data.me.isPartner;
  const openN = w.data.tickets.filter((t) => t.projectId === p.id && isOpen(t)).length;
  const stages = PROJECT_TYPES[p.segment]?.[p.type] || [];
  const setTab = (k) => w.go({ view: "project", id: p.id, tab: k }, true);
  const tabs = [["overview", "Overview"], ["tickets", `Tickets${openN ? ` (${openN})` : ""}`], ["deliverables", "Deliverables"], ["content", "Content"], ["schedule", "Schedule"], ...(isP ? [["money", "Money"]] : [])];
  let ts = w.data.tickets.filter((t) => t.projectId === p.id);
  const doneN = ts.filter((t) => !isOpen(t)).length;
  if (!showDone) ts = ts.filter(isOpen);
  return (
    <>
      <button className="crumb" onClick={() => w.go({ view: "projects" })}>‹ All projects</button>
      <div className="proj-title"><Dot p={p} size={18} /><h2 className="page-title">{p.name}</h2></div>
      <div className="row tight-row">
        <span className="pill">{p.segment === "Madking Studios" ? "Madking" : "S&G"}</span><span className="pill">{p.type}</span><span className="pill">{p.engagement || "One-time"}</span>
        {p.industry && <span className="pill">{p.industry}</span>}
        {scopeText(p) && <span className="muted small">{scopeText(p)}</span>}
      </div>
      <div className="row">
        <label className="filter">Pipeline<select className="mini" value={pipelineOf(p)} onChange={(e) => w.patchProject(p.id, { pipeline: e.target.value })}>{PIPELINE.map((s) => <option key={s}>{s}</option>)}</select></label>
        {stages.length > 0 && <label className="filter">Production<select className="mini" value={p.stage} onChange={(e) => w.patchProject(p.id, { stage: e.target.value })}>{stages.map((s) => <option key={s}>{s}</option>)}</select></label>}
      </div>
      {stages.length > 0 && <div className="stages" title={p.stage}>{stages.map((x, j) => <i key={x} className={j <= stages.indexOf(p.stage) ? "on" : ""} style={{ "--c": p.color || "var(--ink)" }} />)}</div>}
      <div className="ptabs" role="tablist">{tabs.map(([k, l]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === "overview" && <ProjectOverview p={p} setTab={setTab} />}
      {tab === "tickets" && (
        <>
          <div className="toolbar">
            <button className="btn primary" onClick={() => w.openTicket({ projectId: p.id })}>New ticket</button>
            <button className="btn" onClick={() => setTpl(true)}>Add standard tickets</button>
            <span className="grow" />
            <Seg options={[["deadline", "By deadline"], ["priority", "By priority"]]} value={sort} onChange={setSort} />
            {doneN > 0 && <button className="btn ghost" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : `Show done (${doneN})`}</button>}
          </div>
          {ts.length ? <TicketTable tickets={ts} showProject={false} sort={sort} /> : <div className="empty-box"><p>No open tickets on this project.</p><p>Add one, or start from the standard set for this kind of project.</p></div>}
        </>
      )}
      {tab === "deliverables" && <><DeadlinesCalendar projectId={p.id} /><p className="hint">Every ticket deadline on this project. Posting dates live in Content.</p></>}
      {tab === "content" && <ContentView projectId={p.id} />}
      {tab === "schedule" && <ProjectSchedule p={p} />}
      {tab === "money" && isP && <ProjectMoney p={p} />}
      {tpl && <TemplateModal p={p} onClose={() => setTpl(false)} />}
    </>
  );
}

// A text field that saves itself when you leave it.
function AutoField({ p, k, label, multi, rows = 3, type = "text", placeholder, hideLabel }) {
  const w = useWork();
  const [v, setV] = useState(p[k] ?? "");
  useEffect(() => { setV(p[k] ?? ""); }, [p, k]);
  const commit = () => { const cur = p[k] ?? ""; if (String(v).trim() !== String(cur)) w.patchProject(p.id, { [k]: type === "number" ? Number(v) || 0 : String(v).trim() }); };
  const el = multi
    ? <textarea rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} aria-label={hideLabel ? label : undefined} />
    : <input type={type} min={type === "number" ? 0 : undefined} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={hideLabel ? label : undefined} />;
  return hideLabel ? <label className="f">{el}</label> : <Field label={label}>{el}</Field>;
}

function ProjectOverview({ p, setTab }) {
  const w = useWork();
  const toast = useToast();
  const isP = w.data.me.isPartner;
  const members = memberMap(w.data);
  const ret = p.engagement === "Retainer", per = ret ? " per month" : "";
  const open = w.data.tickets.filter((t) => t.projectId === p.id && isOpen(t)).sort(sortTickets("deadline"));
  const ups = w.data.updates.filter((u) => u.projectId === p.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const [upd, setUpd] = useState("");
  const [confirm, setConfirm] = useState(false);
  const platforms = new Set(splitList(p.platforms));
  const pocs = splitList(p.teamPocs);
  async function postUpdate() {
    if (!upd.trim()) return;
    try { await api("/api/rec/updates", { method: "POST", body: { item: { projectId: p.id, text: upd } } }); setUpd(""); await w.reload(); } catch (e) { toast(e.message); }
  }
  async function delUpdate(u) { try { await api(`/api/rec/updates/${u.id}`, { method: "DELETE" }); await w.reload(); } catch (e) { toast(e.message); } }
  async function delProject() {
    try { await api(`/api/projects/${p.id}`, { method: "DELETE" }); toast("Project deleted"); w.go({ view: "projects" }); await w.reload(); } catch (e) { toast(e.message); }
  }
  return (
    <div className="proj-grid">
      <div className="col">
        <section className="panel col">
          <h3>Objective</h3>
          <p className="hint">What this engagement should achieve for the client. Everyone reads this before picking up a ticket.</p>
          <AutoField p={p} k="objective" label="Objective" multi hideLabel placeholder="What success looks like for this client" />
          <hr className="rule" />
          <h3>Scope</h3>
          <div className="grid three">
            <AutoField p={p} k="reels" label={"Reels" + per} type="number" />
            <AutoField p={p} k="statics" label={"Statics" + per} type="number" />
            <AutoField p={p} k="otherScope" label="Other deliverables" placeholder="Photos, films, website…" />
          </div>
          <hr className="rule" />
          <h3>Context</h3>
          <p className="hint">What a new teammate needs to know before working on this account.</p>
          <AutoField p={p} k="audience" label="Target audience" multi rows={2} placeholder="Who the content is for" />
          <AutoField p={p} k="brand" label="Brand voice and guidelines" multi placeholder="Tone, do's and don'ts, visual rules" />
          <div className="col tight"><span className="flabel">Platforms</span>
            <div className="chips">{PLATFORMS.map((pl) => <button key={pl} className="chip" aria-pressed={platforms.has(pl)} onClick={() => { const n = new Set(platforms); n.has(pl) ? n.delete(pl) : n.add(pl); w.patchProject(p.id, { platforms: PLATFORMS.filter((x) => n.has(x)) }); }}>{pl}</button>)}</div></div>
          <AutoField p={p} k="links" label="Key links" multi rows={2} placeholder="Drive folder, brand kit, references" />
          <AutoField p={p} k="plan" label="Plan and strategy" multi rows={4} placeholder="Approach, references, key decisions, what's next" />
          <AutoField p={p} k="notes" label="Notes" multi rows={3} placeholder="History, client preferences, anything else" />
        </section>
      </div>
      <div className="col">
        <section className="panel col">
          <h3>POCs</h3>
          <div className="col tight"><span className="flabel">Team</span><PeoplePicker value={pocs} onChange={(v) => w.patchProject(p.id, { teamPocs: v })} members={w.data.members} /></div>
          <p className="hint">New tickets and posts on this project start with these people.</p>
          <AutoField p={p} k="clientPoc" label="Client" multi rows={2} placeholder="Name, role, phone" />
        </section>
        <section className="panel col">
          <div className="row spread"><h3>{ret ? "This month" : "Output"}</h3><button className="link" onClick={() => setTab("content")}>Content calendar</button></div>
          <OutputRows p={p} ym={ret ? ymNow() : null} />
          {!(Number(p.reels) || Number(p.statics)) && <p className="muted">Set reels and statics in Scope to track output.</p>}
        </section>
        <section className="panel col">
          <div className="row spread"><h3>Open tickets</h3><button className="link" onClick={() => setTab("tickets")}>{open.length ? `All ${open.length}` : "Tickets"}</button></div>
          {open.length ? <div className="rows">{open.slice(0, 4).map((t) => <TicketLine key={t.id} t={t} />)}</div> : <p className="muted">No open tickets.</p>}
        </section>
        <section className="panel col">
          <h3>Updates</h3>
          <textarea rows={2} value={upd} onChange={(e) => setUpd(e.target.value)} placeholder="What changed? Client feedback, decisions, blockers" />
          <div><button className="btn" onClick={postUpdate} disabled={!upd.trim()}>Post update</button></div>
          {ups.length > 0 && <div className="upd-list">{ups.slice(0, 12).map((u) => (
            <div key={u.id} className="upd"><time>{fmtDate(u.date)}</time><p>{u.text}{u.by && <span className="hint block">{u.by}</span>}</p><button className="x" aria-label="Delete update" onClick={() => delUpdate(u)}>×</button></div>))}</div>}
        </section>
        <section className="panel col">
          <h3>Details</h3>
          <AutoField p={p} k="name" label="Project name" />
          <div className="grid">
            <Field label="Engagement"><Select value={p.engagement || "One-time"} options={ENGAGEMENTS} onChange={(v) => w.patchProject(p.id, { engagement: v })} /></Field>
            <Field label="Industry"><Select value={p.industry} options={INDUSTRIES} blank="Not set" onChange={(v) => w.patchProject(p.id, { industry: v })} /></Field>
            <AutoField p={p} k="client" label="Client" />
            <AutoField p={p} k="start" label="Start date" type="date" />
            {isP && <AutoField p={p} k="budget" label="Budget excl. GST (₹)" type="number" />}
          </div>
          <div className="col tight"><span className="flabel">Colour</span>
            <div className="swatches">{PALETTE.map((c) => <button key={c} className="swatch" style={{ "--c": c }} aria-label={`Colour ${c}`} aria-pressed={p.color === c} onClick={() => w.patchProject(p.id, { color: c })} />)}</div></div>
          {isP && <div>{confirm ? <Confirm text="Delete this project and all its tickets, posts and updates? Ledger entries keep its name." action="Delete project" onYes={delProject} onNo={() => setConfirm(false)} /> : <button className="btn danger" onClick={() => setConfirm(true)}>Delete project</button>}</div>}
        </section>
      </div>
    </div>
  );
}

function ProjectSchedule({ p }) {
  const w = useWork();
  const events = w.data.schedule.filter((e) => e.project === p.name).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <>
      <div className="row"><button className="btn primary" onClick={() => w.openEvent({ project: p.name, kind: "Shoot", date: today() })}>Add shoot or meeting</button></div>
      <div className="panel flush">
        {events.length ? <div className="list">{events.map((e) => (
          <button key={e.id} className="item" onClick={() => w.openEvent(e)}>
            <span className="t">{e.kind} · {e.title}</span><span className="a small">{fmtDate(e.date)}</span>
            <span className="s">{[e.callTime && "Call " + fmtTime(e.callTime), e.location].filter(Boolean).join(" · ") || "—"}</span><span className="g" />
          </button>))}</div> : <div className="empty">Nothing scheduled for this project yet. Shoots added here also go to Google Calendar.</div>}
      </div>
    </>
  );
}

function ProjectMoney({ p }) {
  const w = useWork();
  const L = w.data.ledger || [];
  const spent = spentOn(L, p), got = receivedOn(L, p);
  const entries = L.filter((e) => e.project === p.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <div className="statgrid">
        <div className="kv"><span className="k">Budget</span><span className="v">{p.budget ? rs(p.budget) : "—"}</span></div>
        <div className="kv"><span className="k">Spent</span><span className="v">{rs(spent)}</span></div>
        <div className="kv"><span className="k">Left</span><span className={`v${p.budget && spent > p.budget ? " danger-text" : ""}`}>{p.budget ? rs(p.budget - spent) : "—"}</span></div>
        <div className="kv"><span className="k">Received</span><span className="v">{rs(got)}</span></div>
      </div>
      {p.budget > 0 && <div className={`budget${spent > p.budget ? " over" : ""}`}><span style={{ width: Math.min(100, (spent / p.budget) * 100) + "%" }} /></div>}
      <div className="panel flush">{entries.length ? <div className="list">{entries.map((e) => <EntryRow key={e.id} e={e} onOpen={w.openEntry} />)}</div> : <div className="empty">No ledger entries tagged to this project yet. Log them with the project name.</div>}</div>
    </>
  );
}
