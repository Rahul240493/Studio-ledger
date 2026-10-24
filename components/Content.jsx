"use client";
import { useState } from "react";
import { C_FORMATS, C_GLYPH, C_STATUS, PLATFORMS } from "@/lib/config";
import { api } from "./util";
import { Modal, Field, Confirm, useToast } from "./ui";
import { useWork, Seg, Dot, PeoplePicker, MonthGrid, MonthNav, monthLabelOf } from "./workui";
import { output, splitList, parseISO, sortProjects, ymNow, pipelineOf } from "./workdata";

const slug = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function ContentChip({ c, showProject }) {
  const w = useWork();
  const p = w.projectById[c.projectId];
  const label = c.title || (showProject ? c.format : `${p ? p.name + " " : ""}${String(c.format).toLowerCase()}`);
  return (
    <button type="button" className={`ev cev st-${slug(c.status)}`} style={{ "--c": p?.color || "var(--muted)" }} onClick={(e) => { e.stopPropagation(); w.openPost(c); }} title={`${p ? p.name + ": " : ""}${label} (${c.status})`}>
      <i className="glyph" aria-hidden="true">{C_GLYPH[c.format] || "•"}</i>
      {showProject && p ? <span className="t2"><span className="pn">{p.name}</span><span className="t">{label}</span></span> : <span className="t">{label}</span>}
    </button>
  );
}

export const ContentLegend = () => <div className="legend">{C_STATUS.map((s) => <span key={s}><i className={`sw st-${slug(s)}`} />{s}</span>)}</div>;

function Progress({ label, o, color }) {
  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : a ? 100 : 0) + "%";
  const txt = o.target ? `${o.planned} of ${o.target} planned, ${o.posted} posted` : `${o.planned} planned, ${o.posted} posted`;
  return (
    <div className="prog">
      <div className="prog-top"><span>{label}</span><span className="muted">{txt}</span></div>
      <div className="pbar" style={{ "--c": color }}><i className="planned" style={{ width: pct(o.planned, o.target) }} /><i style={{ width: pct(o.posted, o.target) }} /></div>
    </div>
  );
}
export function OutputRows({ p, ym }) {
  const w = useWork();
  const o = output(w.data.content, p, ym);
  const per = ym ? "" : " total";
  const rows = [];
  if (o.reels.target || o.reels.planned) rows.push(<Progress key="r" label={"Reels" + per} o={o.reels} color={p.color} />);
  if (o.statics.target || o.statics.planned) rows.push(<Progress key="s" label={"Statics" + per} o={o.statics} color={p.color} />);
  return rows.length ? rows : null;
}

export function ContentView({ projectId }) {
  const w = useWork();
  const [ym, setYm] = useState(ymNow());
  const [f, setF] = useState({ project: projectId || "", status: w.contentStatus || "", format: "" });
  let items = w.data.content;
  if (f.project) items = items.filter((c) => c.projectId === f.project);
  if (f.status) items = items.filter((c) => c.status === f.status);
  if (f.format) items = items.filter((c) => c.format === f.format);
  const rets = w.data.projects.filter((p) => p.engagement === "Retainer" && ["Active", "Onboarding"].includes(pipelineOf(p)) && (!f.project || p.id === f.project));
  const quota = rets.map((p) => {
    const o = output(w.data.content, p, ym); const bits = [];
    if (o.reels.target) bits.push(`${o.reels.planned}/${o.reels.target} reels`);
    if (o.statics.target) bits.push(`${o.statics.planned}/${o.statics.target} statics`);
    return bits.length ? <span key={p.id}><Dot p={p} size={9} />{p.name}: {bits.join(", ")}</span> : null;
  }).filter(Boolean);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <>
      {!projectId && (
        <div className="page-head">
          <div><h2 className="page-title">Content calendar</h2><p className="hint">Posts across every project. Each project's page shows the same posts.</p></div>
          <button className="btn primary" onClick={() => w.openPost({ projectId: f.project })}>New post</button>
        </div>
      )}
      <div className="filters">
        {!projectId && <label className="filter">Project<select className="mini" value={f.project} onChange={(e) => set("project", e.target.value)}><option value="">All projects</option>{sortProjects(w.data.projects).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="filter">Status<select className="mini" value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">Any</option>{C_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="filter">Format<select className="mini" value={f.format} onChange={(e) => set("format", e.target.value)}><option value="">Any</option>{C_FORMATS.map((s) => <option key={s}>{s}</option>)}</select></label>
        {projectId && <button className="btn primary" onClick={() => w.openPost({ projectId })}>New post</button>}
      </div>
      <MonthNav ym={ym} setYm={setYm} />
      {projectId && w.projectById[projectId] && <div className="quota"><OutputRows p={w.projectById[projectId]} ym={w.projectById[projectId].engagement === "Retainer" ? ym : null} /></div>}
      {!projectId && quota.length > 0 && <div className="legend"><span className="faint">Planned against retainer scope:</span>{quota}</div>}
      <MonthGrid ym={ym} items={items.map((c) => ({ key: c.id, date: c.date, node: <ContentChip c={c} showProject={!projectId} /> }))} onAdd={(d) => w.openPost({ date: d, projectId: f.project })} emptyText={`No posts planned for ${monthLabelOf(ym)}.`} />
      <ContentLegend />
    </>
  );
}

export function PostModal({ c, onClose }) {
  const w = useWork();
  const toast = useToast();
  const isNew = !c.id;
  const pr = w.projectById[c.projectId];
  const [d, setD] = useState(() => ({
    projectId: "", date: "", format: "Reel", title: "", status: "Idea", link: "", notes: "", ...c,
    platform: c.platform || splitList(pr?.platforms)[0] || "Instagram",
    owners: c.id ? splitList(c.owners) : pr ? splitList(pr.teamPocs) : [],
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setD({ ...d, [k]: e?.target ? e.target.value : e });
  async function save() {
    if (!d.projectId) return setErr("Choose the project this post belongs to.");
    if (!parseISO(d.date)) return setErr("Set a post date.");
    setBusy(true);
    try {
      if (isNew) await api("/api/rec/content", { method: "POST", body: { item: d } });
      else await api(`/api/rec/content/${c.id}`, { method: "PUT", body: d });
      toast(isNew ? "Post added" : "Post saved"); onClose(); await w.reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function del() { setBusy(true); try { await api(`/api/rec/content/${c.id}`, { method: "DELETE" }); toast("Post deleted"); onClose(); await w.reload(); } catch (e) { toast(e.message); setBusy(false); } }
  return (
    <Modal title={isNew ? "New post" : "Edit post"} onClose={onClose}>
      <div className="grid">
        <Field label="Title" wide><input value={d.title} onChange={set("title")} placeholder="Hook or working title" /></Field>
        <Field label="Project"><select value={d.projectId} onChange={(e) => { const p = w.projectById[e.target.value]; setD({ ...d, projectId: e.target.value, owners: isNew && !d.owners.length && p ? splitList(p.teamPocs) : d.owners }); }}>
          <option value="">Choose a project</option>{sortProjects(w.data.projects).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Post date"><input type="date" value={d.date} onChange={set("date")} /></Field>
        <div className="wide col tight"><span className="flabel">Format</span><Seg options={C_FORMATS} value={d.format} onChange={set("format")} /></div>
        <Field label="Platform"><select value={d.platform} onChange={set("platform")}>{PLATFORMS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Status"><select value={d.status} onChange={set("status")}>{C_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <div className="wide col tight"><span className="flabel">Owners</span><PeoplePicker value={d.owners} onChange={(v) => setD({ ...d, owners: v })} members={w.data.members} /></div>
        <Field label="Link" wide><input type="url" value={d.link} onChange={set("link")} placeholder="Draft or published link" /></Field>
        <Field label="Notes" wide><textarea rows={3} value={d.notes} onChange={set("notes")} placeholder="Script notes, references, caption" /></Field>
      </div>
      {err && <div className="banner">{err}</div>}
      <div className="row spread">
        <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{isNew ? "Add post" : "Save post"}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
        {!isNew && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}
      </div>
      {confirm && <Confirm text="Delete this post?" action="Delete post" onYes={del} onNo={() => setConfirm(false)} />}
    </Modal>
  );
}
