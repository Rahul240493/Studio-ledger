"use client";
import { useState } from "react";
import { PROJECT_TYPES } from "@/lib/config";
import { api, rs, segOf, fmtDate, fmtTime, today } from "./util";
import { Modal, Field, Select, Confirm, useToast } from "./ui";
import { spentOn, receivedOn } from "./Finance";

export function ProjectsView({ data, reload, openEvent }) {
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);
  const isP = data.me.isPartner;
  const loose = isP ? [...new Set(data.ledger.filter((e) => e.project && e.project !== "General" && !data.projects.some((p) => p.name === e.project)).map((e) => e.project))] : [];
  return (
    <>
      <div className="row spread"><h2>Projects</h2>{isP && <button className="btn primary" onClick={() => setEdit({ segment: "Madking Studios" })}>New project</button>}</div>
      {isP && <div className="hint">Set a budget when a project starts. Spend counts every expense tagged to the project, excluding GST.</div>}
      {["Madking Studios", "Space & Gravity"].map((sk) => {
        const s = segOf(sk); const ps = data.projects.filter((p) => p.segment === sk);
        return (
          <div key={sk} className={`panel flush ${s.cls}`}>
            <div className="phead"><h3><i className={`seg-dot ${s.cls}`} />{sk}</h3><span className="muted small">{ps.length} {ps.length === 1 ? "project" : "projects"}</span></div>
            {ps.length ? ps.map((p) => <ProjectRow key={p.id} p={p} data={data} onOpen={() => setOpen(p)} />) : <div className="empty">No {s.short} projects yet.</div>}
          </div>
        );
      })}
      {loose.length > 0 && <div className="panel col"><h3>Logged but not set up</h3><div className="hint">These names appear in the ledger but have no budget yet.</div>
        <div className="chips">{loose.map((n) => <button key={n} className="chip" onClick={() => setEdit({ name: n, segment: "Madking Studios" })}>+ {n}</button>)}</div></div>}
      {open && <ProjectDetail p={data.projects.find((x) => x.id === open.id) || open} data={data} onClose={() => setOpen(null)} onEdit={() => { setEdit(open); setOpen(null); }} openEvent={openEvent} reload={reload} />}
      {edit && <ProjectForm p={edit} data={data} onClose={() => setEdit(null)} reload={reload} />}
    </>
  );
}

function Stages({ p }) {
  const stages = PROJECT_TYPES[p.segment]?.[p.type] || []; const si = stages.indexOf(p.stage);
  return stages.length ? <div className="stages" title={p.stage}>{stages.map((x, j) => <i key={x} className={j <= si ? "on" : ""} />)}</div> : null;
}

function ProjectRow({ p, data, onOpen }) {
  const isP = data.me.isPartner;
  const spent = isP ? spentOn(data.ledger, p) : 0, pct = isP && p.budget ? (spent / p.budget) * 100 : 0;
  const next = data.schedule.filter((e) => e.project === p.name && e.date >= today()).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return (
    <button className={`proj ${segOf(p.segment).cls}`} onClick={onOpen}>
      <div className="head"><div className="minw"><div className="nm">{p.name}</div><div className="hint">{p.type}{p.client ? " · " + p.client : ""} · {p.stage || "No stage"}</div></div>
        {isP && p.budget ? (pct > 100 ? <span className="pill bad">Over by {rs(spent - p.budget)}</span> : pct > 85 ? <span className="pill warn">{Math.round(pct)}% used</span> : <span className="pill good">{Math.round(pct)}% used</span>) : null}</div>
      <Stages p={p} />
      {isP && p.budget ? <div className={`budget${pct > 100 ? " over" : ""}`}><span style={{ width: Math.min(100, pct) + "%" }} /></div> : null}
      <div className="row spread small">
        {isP ? <span>Spent <b className="num">{rs(spent)}</b>{p.budget ? <> of <span className="num">{rs(p.budget)}</span></> : <span className="muted"> · no budget set</span>}</span> : <span className="muted">{p.plan ? "Plan added" : "No plan yet"}</span>}
        {next && <span className="muted">Next: {next.kind} {fmtDate(next.date)}</span>}
      </div>
    </button>
  );
}

function ProjectDetail({ p, data, onClose, onEdit, openEvent, reload }) {
  const toast = useToast();
  const isP = data.me.isPartner;
  const [plan, setPlan] = useState(p.plan || "");
  const [stage, setStage] = useState(p.stage);
  const [busy, setBusy] = useState(false);
  const stages = PROJECT_TYPES[p.segment]?.[p.type] || [];
  const events = data.schedule.filter((e) => e.project === p.name).sort((a, b) => (a.date < b.date ? -1 : 1));
  const dirty = plan !== (p.plan || "") || stage !== p.stage;
  async function save() {
    setBusy(true);
    try { await api(`/api/projects/${p.id}`, { method: "PUT", body: { stage, plan, notes: p.notes } }); toast("Project updated"); await reload(); }
    catch (e) { toast(e.message); }
    setBusy(false);
  }
  const spent = isP ? spentOn(data.ledger, p) : 0, got = isP ? receivedOn(data.ledger, p) : 0;
  return (
    <Modal title={p.name} onClose={onClose}>
      <div className="hint">{p.segment} · {p.type}{p.client ? " · " + p.client : ""}{p.start ? " · started " + fmtDate(p.start, { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
      <Field label="Stage"><Select value={stage} options={stages} onChange={setStage} /></Field>
      <Stages p={{ ...p, stage }} />
      {isP && <div className="statgrid">
        <div className="kv"><span className="k">Budget</span><span className="v">{p.budget ? rs(p.budget) : "—"}</span></div>
        <div className="kv"><span className="k">Spent</span><span className="v">{rs(spent)}</span></div>
        <div className="kv"><span className="k">Left</span><span className={`v${p.budget && spent > p.budget ? " danger-text" : ""}`}>{p.budget ? rs(p.budget - spent) : "—"}</span></div>
        <div className="kv"><span className="k">Received</span><span className="v">{rs(got)}</span></div>
      </div>}
      <Field label="Plan / strategy (visible to the whole team)"><textarea rows={6} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Approach, references, key decisions, what's next." /></Field>
      {p.notes && <div className="hint">Notes: {p.notes}</div>}
      <div className="row"><button className="btn primary" disabled={!dirty || busy} onClick={save}>Save</button>{isP && <button className="btn" onClick={onEdit}>Edit details</button>}</div>
      <h3>Schedule</h3>
      {events.length ? <div className="panel flush"><div className="list">{events.map((e) => (
        <button key={e.id} className="item" onClick={() => { onClose(); openEvent(e); }}>
          <span className="t">{e.kind} · {e.title}</span><span className="a small">{fmtDate(e.date)}</span>
          <span className="s">{[e.callTime && "Call " + fmtTime(e.callTime), e.location].filter(Boolean).join(" · ") || "—"}</span><span className="g" />
        </button>))}</div></div> : <div className="hint">Nothing scheduled for this project yet.</div>}
    </Modal>
  );
}

function ProjectForm({ p, data, onClose, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", client: "", budget: "", start: "", notes: "", plan: "", ...p, segment: p.segment || "Madking Studios" });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const types = Object.keys(PROJECT_TYPES[f.segment] || {});
  const type = types.includes(f.type) ? f.type : types[0];
  const stages = PROJECT_TYPES[f.segment][type];
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  async function save() {
    setBusy(true);
    try {
      const body = { ...f, type, stage: stages.includes(f.stage) ? f.stage : stages[0] };
      if (p.id) await api(`/api/projects/${p.id}`, { method: "PUT", body }); else await api("/api/projects", { method: "POST", body });
      toast(p.id && p.name !== f.name ? "Renamed. Older ledger entries keep the old name." : "Project saved"); onClose(); await reload();
    } catch (e) { toast(e.message); }
    setBusy(false);
  }
  async function del() { setBusy(true); try { await api(`/api/projects/${p.id}`, { method: "DELETE" }); toast("Project deleted"); onClose(); await reload(); } catch (e) { toast(e.message); setBusy(false); } }
  return (
    <Modal title={p.id ? "Edit project" : "New project"} onClose={onClose}>
      <div className="grid">
        <Field label="Project name" wide><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Company"><Select value={f.segment} options={["Madking Studios", "Space & Gravity"]} onChange={(v) => setF({ ...f, segment: v, type: "", stage: "" })} /></Field>
        <Field label="Type"><Select value={type} options={types} onChange={(v) => setF({ ...f, type: v, stage: "" })} /></Field>
        <Field label="Client"><input value={f.client} onChange={set("client")} /></Field>
        <Field label="Budget excl. GST (₹)"><input inputMode="decimal" value={f.budget || ""} onChange={set("budget")} /></Field>
        <Field label="Stage"><Select value={stages.includes(f.stage) ? f.stage : stages[0]} options={stages} onChange={set("stage")} /></Field>
        <Field label="Start date"><input type="date" value={f.start || ""} onChange={set("start")} /></Field>
        <Field label="Notes" wide><input value={f.notes || ""} onChange={set("notes")} /></Field>
      </div>
      <div className="row spread"><button className="btn primary" onClick={save} disabled={busy}>Save project</button>{p.id && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}</div>
      {confirm && <Confirm text="Delete this project? Ledger entries and schedule items keep its name." action="Delete project" onYes={del} onNo={() => setConfirm(false)} />}
    </Modal>
  );
}
