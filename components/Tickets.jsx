"use client";
import { useMemo, useState } from "react";
import { PRIORITIES, T_STATUS, T_KIND, EARLY, C_STATUS, C_GLYPH } from "@/lib/config";
import { api } from "./util";
import { Modal, Field, Confirm, useToast } from "./ui";
import { useWork, Seg, Dot, Pri, Avatars, PeoplePicker, MonthGrid, MonthNav, monthLabelOf } from "./workui";
import { dueInfo, isOpen, sortTickets, splitList, parseISO, today0, daysBetween, plural, memberMap, sortProjects, monthlyTickets, relTickets, contentSlots, isoDate, fmtShort, ymNow, pipelineOf, ticketTiming, rowTiming, postAsTicket, TICKET_TIMING_LABEL } from "./workdata";
import { ONE_TIME_TPL, LEAD_TPL } from "@/lib/config";

export const DEF_TF = { project: "", person: "", priority: "", status: "open", due: "any", sort: "deadline", show: "all" };

export function applyTicketFilters(ts, f) {
  const t0 = today0();
  return ts.filter((t) => {
    if (f.show === "tickets" && t._post) return false;
    if (f.show === "posts" && !t._post) return false;
    if (f.project && t.projectId !== f.project) return false;
    const pocs = splitList(t.pocs);
    if (f.person === "__none") { if (pocs.length) return false; }
    else if (f.person && !pocs.includes(f.person)) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status === "open" && !isOpen(t)) return false;
    if (f.status && f.status !== "open" && f.status !== "all" && t.status !== f.status) return false;
    const d = parseISO(t.deadline);
    if (f.due === "overdue" && !(d && d < t0 && isOpen(t))) return false;
    if (f.due === "week" && !(d && d >= t0 && daysBetween(t0, d) <= 7)) return false;
    if (f.due === "none" && d) return false;
    return true;
  });
}

// Small coloured chip used on calendars and lists.
export function TicketChip({ t, showProject }) {
  const w = useWork();
  const p = w.projectById[t.projectId];
  return (
    <button type="button" className={`ev${t.status === "Done" ? " done" : ""} tm-${ticketTiming(t) || "none"}`} style={{ "--c": p?.color || "var(--muted)" }} onClick={(e) => { e.stopPropagation(); w.openTicket(t); }} title={(p ? p.name + ": " : "") + t.title}>
      <Pri v={t.priority} />
      {showProject && p ? <span className="t2"><span className="pn">{p.name}</span><span className="t">{t.title}</span></span> : <span className="t">{t.title}</span>}
    </button>
  );
}

export function TicketLine({ t }) {
  const w = useWork();
  const p = w.projectById[t.projectId]; const di = dueInfo(t.deadline, t.status === "Done");
  return (
    <button className="line-btn" onClick={() => w.openTicket(t)}>
      <Pri v={t.priority} />
      <span className="minw"><span className="lt">{t.title}</span><span className="ls">{p ? p.name : "No project"}</span></span>
      <span className={`due ${di.cls}`}>{di.text}</span>
    </button>
  );
}

export function TicketTable({ tickets, showProject = true, sort = "deadline" }) {
  const w = useWork();
  const toast = useToast();
  const members = memberMap(w.data);
  const rows = [...tickets].sort(sortTickets(sort));
  async function patch(t, change) {
    try { await api(`/api/rec/tickets/${t.id}`, { method: "PUT", body: change }); await w.reload(); } catch (e) { toast(e.message); }
  }
  async function patchPost(c, change) {
    try { await api(`/api/rec/content/${c.id}`, { method: "PUT", body: change }); await w.reload(); } catch (e) { toast(e.message); }
  }
  const stop = (e) => e.stopPropagation();
  return (
    <div className="tlist" role="table">
      <div className={`trow head${showProject ? "" : " no-proj"}`} role="row"><span>Ticket</span>{showProject && <span>Project</span>}<span>Priority</span><span>Status</span><span>POCs</span><span>Deadline</span><span>Type</span></div>
      {rows.map((t) => { const p = w.projectById[t.projectId]; const c = t._post; const di = dueInfo(t.deadline, !isOpen(t)); const tm = rowTiming(t);
        const open = () => (c ? w.openPost(c) : w.openTicket(t));
        return (
        <div key={t.id} className={`trow${showProject ? "" : " no-proj"}${!isOpen(t) ? " done" : ""}${tm ? " tm-" + tm : ""}`} role="row" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open()} title={tm ? TICKET_TIMING_LABEL[tm] : undefined}>
          <span className="c-title">{c ? <i className="glyph" aria-hidden="true">{C_GLYPH[c.format] || "•"}</i> : <Pri v={t.priority} />}<span className="title">{t.title}</span></span>
          {showProject && <span className="c-proj muted">{p && <Dot p={p} size={8} />}{p ? p.name : "No project"}</span>}
          <span>{c ? <span className="faint">Post</span> : <select className="mini" value={t.priority} onClick={stop} onKeyDown={stop} onChange={(e) => patch(t, { priority: e.target.value })} aria-label="Priority">{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</span>
          <span>{c
            ? <select className="mini" value={t.status} onClick={stop} onKeyDown={stop} onChange={(e) => patchPost(c, { status: e.target.value })} aria-label="Status">{C_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
            : <select className="mini" value={t.status} onClick={stop} onKeyDown={stop} onChange={(e) => patch(t, { status: e.target.value })} aria-label="Status">{T_STATUS.map((s) => <option key={s}>{s}</option>)}</select>}</span>
          <span><Avatars emails={splitList(t.pocs)} members={members} /></span>
          <span className={`due ${di.cls}`}>{di.text}</span>
          <span className="muted">{c ? `Content · ${c.format}` : t.kind === "Client deliverable" ? "Client" : "Internal"}</span>
        </div>); })}
    </div>
  );
}

export function TicketsView() {
  const w = useWork();
  const [f, setF] = useState(w.ticketFilter || DEF_TF);
  const all = [...w.data.tickets, ...w.data.content.map(postAsTicket)];
  const ts = applyTicketFilters(all, f);
  const set = (k, v) => setF({ ...f, [k]: v });
  const projects = sortProjects(w.data.projects);
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Tickets</h2><p className="hint">{ts.length} of {all.length} shown: tickets and content-calendar posts.</p></div>
        <button className="btn primary" onClick={() => w.openTicket({ projectId: f.project })}>New ticket</button>
      </div>
      <div className="filters">
        <label className="filter">Show<select className="mini" value={f.show || "all"} onChange={(e) => set("show", e.target.value)}><option value="all">Tickets and posts</option><option value="tickets">Tickets only</option><option value="posts">Content posts only</option></select></label>
        <label className="filter">Project<select className="mini" value={f.project} onChange={(e) => set("project", e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="filter">POC<select className="mini" value={f.person} onChange={(e) => set("person", e.target.value)}><option value="">Everyone</option><option value="__none">Unassigned</option>{w.data.members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}</select></label>
        <label className="filter">Priority<select className="mini" value={f.priority} onChange={(e) => set("priority", e.target.value)}><option value="">Any</option>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="filter">Status<select className="mini" value={f.status} onChange={(e) => set("status", e.target.value)}><option value="open">Open</option><option value="all">All</option>{T_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="filter">Deadline<select className="mini" value={f.due} onChange={(e) => set("due", e.target.value)}><option value="any">Any</option><option value="overdue">Overdue</option><option value="week">Next 7 days</option><option value="none">No deadline</option></select></label>
        <Seg options={[["deadline", "By deadline"], ["priority", "By priority"]]} value={f.sort} onChange={(v) => set("sort", v)} />
        {JSON.stringify(f) !== JSON.stringify(DEF_TF) && <button className="btn ghost" onClick={() => setF(DEF_TF)}>Reset</button>}
      </div>
      {ts.length ? <TicketTable tickets={ts} sort={f.sort} /> : <div className="empty-box"><p>Nothing matches these filters.</p><p>Reset the filters or add a ticket.</p></div>}
      <div className="legend">{Object.entries(TICKET_TIMING_LABEL).map(([k, l]) => <span key={k}><i className={`sw tm-${k}`} />{l}</span>)}</div>
    </>
  );
}

// Ticket deadlines across projects, as a month calendar.
export function DeadlinesCalendar({ projectId }) {
  const w = useWork();
  const [ym, setYm] = useState(ymNow());
  const ts = w.data.tickets.filter((t) => parseISO(t.deadline) && (!projectId || t.projectId === projectId));
  const items = ts.map((t) => ({ key: t.id, date: t.deadline, node: <TicketChip t={t} showProject={!projectId} /> }));
  return (
    <>
      <div className="row spread"><MonthNav ym={ym} setYm={setYm} /><button className="btn primary" onClick={() => w.openTicket({ projectId })}>New ticket</button></div>
      <MonthGrid ym={ym} items={items} onAdd={(d) => w.openTicket({ projectId, deadline: d })} emptyText={`No ticket deadlines in ${monthLabelOf(ym)}.`} />
    </>
  );
}

export function TicketModal({ t, onClose }) {
  const w = useWork();
  const toast = useToast();
  const isNew = !t.id;
  const proj = w.projectById[t.projectId];
  const [d, setD] = useState(() => ({
    title: "", projectId: "", priority: "P2", status: "To do", kind: "Internal", deadline: "", notes: "", ...t,
    pocs: t.pocs !== undefined && t.id ? splitList(t.pocs) : (isNew && proj ? splitList(proj.teamPocs) : splitList(t.pocs)),
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setD({ ...d, [k]: e?.target ? e.target.value : e });
  async function save() {
    if (!d.title.trim()) return setErr("Give the ticket a name.");
    if (!d.projectId) return setErr("Choose the project this ticket belongs to.");
    if (!parseISO(d.deadline)) return setErr("Set a deadline. Every ticket needs one.");
    setBusy(true);
    try {
      if (isNew) await api("/api/rec/tickets", { method: "POST", body: { item: d } });
      else await api(`/api/rec/tickets/${t.id}`, { method: "PUT", body: d });
      toast(isNew ? "Ticket added" : "Ticket saved"); onClose(); await w.reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function del() { setBusy(true); try { await api(`/api/rec/tickets/${t.id}`, { method: "DELETE" }); toast("Ticket deleted"); onClose(); await w.reload(); } catch (e) { toast(e.message); setBusy(false); } }
  return (
    <Modal title={isNew ? "New ticket" : "Edit ticket"} onClose={onClose}>
      <div className="grid">
        <Field label="Ticket" wide><input value={d.title} onChange={set("title")} placeholder="What needs to happen?" autoFocus /></Field>
        <Field label="Project"><select value={d.projectId} onChange={(e) => { const p = w.projectById[e.target.value]; setD({ ...d, projectId: e.target.value, pocs: isNew && !d.pocs.length && p ? splitList(p.teamPocs) : d.pocs }); }}>
          <option value="">Choose a project</option>{sortProjects(w.data.projects).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Deadline"><input type="date" value={d.deadline} onChange={set("deadline")} /></Field>
        <div className="wide col tight"><span className="flabel">Priority</span><Seg cls="prio" options={PRIORITIES} value={d.priority} onChange={set("priority")} /></div>
        <Field label="Status"><select value={d.status} onChange={set("status")}>{T_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <div className="col tight"><span className="flabel">Type</span><Seg options={T_KIND} value={d.kind} onChange={set("kind")} /></div>
        <div className="wide col tight"><span className="flabel">POCs</span><PeoplePicker value={d.pocs} onChange={(v) => setD({ ...d, pocs: v })} members={w.data.members} /></div>
        <Field label="Notes" wide><textarea rows={3} value={d.notes} onChange={set("notes")} placeholder="Context, links, client feedback" /></Field>
      </div>
      {err && <div className="banner">{err}</div>}
      <div className="row spread">
        <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{isNew ? "Add ticket" : "Save ticket"}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
        {!isNew && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}
      </div>
      {confirm && <Confirm text="Delete this ticket?" action="Delete ticket" onYes={del} onNo={() => setConfirm(false)} />}
    </Modal>
  );
}

// "Add standard tickets": retainer month cycle, one-time production, or new lead.
export function TemplateModal({ p, onClose }) {
  const w = useWork();
  const toast = useToast();
  const now = new Date();
  const months = Array.from({ length: 8 }, (_, i) => isoDate(new Date(now.getFullYear(), now.getMonth() - 1 + i, 1)).slice(0, 7));
  const [kind, setKind] = useState(EARLY.includes(pipelineOf(p)) ? "lead" : p.engagement === "Retainer" ? "monthly" : "onetime");
  const [ym, setYm] = useState(months[2]);
  const [start, setStart] = useState(isoDate(now));
  const [slots, setSlots] = useState(true);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => (kind === "monthly" ? monthlyTickets(p, ym) : relTickets(kind === "lead" ? LEAD_TPL : ONE_TIME_TPL, start)), [kind, ym, start, p]);
  const r = Number(p.reels) || 0, sc = Number(p.statics) || 0;
  const existing = w.data.content.filter((c) => c.projectId === p.id && c.date?.slice(0, 7) === ym).length;
  const pocs = splitList(p.teamPocs);
  async function create() {
    setBusy(true);
    try {
      await api("/api/rec/tickets", { method: "POST", body: { items: items.map((t) => ({ ...t, projectId: p.id, status: "To do", pocs, notes: "" })) } });
      const posts = kind === "monthly" && slots ? contentSlots(p, ym) : [];
      if (posts.length) await api("/api/rec/content", { method: "POST", body: { items: posts.map((c) => ({ ...c, projectId: p.id, owners: pocs })) } });
      toast(`Added ${items.length} tickets${posts.length ? ` and ${posts.length} posts` : ""}`); onClose(); await w.reload();
    } catch (e) { toast(e.message); }
    setBusy(false);
  }
  return (
    <Modal title={`Standard tickets for ${p.name}`} onClose={onClose}>
      <Seg options={[["monthly", "Monthly retainer cycle"], ["onetime", "One-time production"], ["lead", "New lead"]]} value={kind} onChange={setKind} />
      {kind === "monthly"
        ? <Field label="Month"><select value={ym} onChange={(e) => setYm(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabelOf(m)}</option>)}</select></Field>
        : <Field label="Start date"><input type="date" value={start} onChange={(e) => parseISO(e.target.value) && setStart(e.target.value)} /></Field>}
      {kind === "monthly" && r + sc > 0 && (
        <label className="check"><input type="checkbox" checked={slots} onChange={(e) => setSlots(e.target.checked)} />
          <span>Also add {[r && `${r} ${plural(r, "reel")}`, sc && `${sc} ${plural(sc, "static")}`].filter(Boolean).join(" and ")} to the content calendar as planned slots.{existing ? <span className="hint block">This month already has {existing} {plural(existing, "post")}.</span> : null}</span></label>
      )}
      <div className="hint">{pocs.length ? `${items.length} tickets, assigned to the project's team POCs.` : `${items.length} tickets. Add team POCs on the project's Overview to assign sets automatically.`}</div>
      <ol className="tpl-preview">{items.map((t, i) => <li key={i}><Pri v={t.priority} /><span>{t.title}</span><span className="muted">{t.kind === "Client deliverable" ? "Client" : "Internal"}</span><span className="muted">{fmtShort(t.deadline)}</span></li>)}</ol>
      <div className="row"><button className="btn primary" onClick={create} disabled={busy}>Add {items.length} tickets</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
