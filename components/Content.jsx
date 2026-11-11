"use client";
import { useMemo, useState } from "react";
import { C_FORMATS, C_GLYPH, C_STATUS, C_SOURCES, PLATFORMS, DELAY_REASONS } from "@/lib/config";
import { api } from "./util";
import { Modal, Field, Confirm, useToast } from "./ui";
import { useWork, Seg, Dot, PeoplePicker, MonthGrid, MonthNav, monthLabelOf } from "./workui";
import { output, splitList, parseISO, sortProjects, ymNow, pipelineOf, timingOf, TIMING_LABEL, isoDate, fmtShort, lateText, delivery, linkIndex, isPosted, postedDay, isExtra, actualFormat, DELIVERY_LABEL, postTitle } from "./workdata";

const slug = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const SOURCE_LABEL = { Calendar: "Content calendar", "Ad-hoc": "Ad-hoc client request", Unplanned: "Unplanned extra" };

// Links and lookup for every post, so a slot and the post that replaced it can be judged together.
export function usePostIndex() {
  const w = useWork();
  return useMemo(() => {
    const all = w.data.content;
    return { links: linkIndex(all), byId: Object.fromEntries(all.map((c) => [c.id, c])) };
  }, [w.data.content]);
}

// One line describing how a post was delivered, e.g. "planned 5 Nov · 2 days late".
export function deliveryLine(c, d, byId) {
  if (!d) return "";
  const slot = c.linkedTo ? byId[c.linkedTo] : null;
  const planned = slot ? `for ${fmtShort(slot.date)} ${String(slot.format).toLowerCase()}` : d.due && d.live && d.live !== d.due ? `planned ${fmtShort(d.due)}` : "";
  if (d.state === "late") return [planned, lateText(d.days)].filter(Boolean).join(" · ");
  if (d.state === "ontime") return d.live && d.due && d.live < d.due ? [planned, "early"].filter(Boolean).join(" · ") : planned ? planned + " · on time" : "";
  if (d.state === "overdue") return `${d.days === 1 ? "1 day" : d.days + " days"} overdue`;
  if (d.state === "moved") return d.via ? `moved to ${String(actualFormat(d.via)).toLowerCase()}${postedDay(d.via) ? " on " + fmtShort(postedDay(d.via)) : ""}` : "moved";
  if (d.state === "skipped") return "skipped";
  return "";
}

// A post on the calendar. variant "ghost" = faint marker left on the planned day when it went live on another day.
export function ContentChip({ c, showProject, idx, variant }) {
  const w = useWork();
  const p = w.projectById[c.projectId];
  const d = delivery(c, idx.links, idx.byId);
  const tm = timingOf(d);
  const fmt = variant === "ghost" ? c.format : actualFormat(c);
  const label = postTitle(c);
  const line = deliveryLine(c, d, idx.byId);
  const extra = isExtra(c);
  if (variant === "ghost") {
    const where = d.via ? `replaced: ${postTitle(d.via)} went live ${fmtShort(postedDay(d.via))}` : `went live ${fmtShort(d.live)}`;
    return (
      <button type="button" className="ev cev ghost" style={{ "--c": p?.color || "var(--muted)" }} onClick={(e) => { e.stopPropagation(); w.openPost(c); }} title={`Planned here: ${label}. ${where}${d.days ? ` (${lateText(d.days)})` : ""}`}>
        <i className="glyph" aria-hidden="true">{C_GLYPH[fmt] || "•"}</i>
        <span className="t">{showProject && p ? p.name + " · " : ""}{d.via ? (postedDay(d.via) ? `→ replaced ${fmtShort(postedDay(d.via))}` : "→ moved") : `→ live ${fmtShort(d.live)}`}</span>
      </button>
    );
  }
  const tip = [`${p ? p.name + ": " : ""}${label}`, c.status, extra && SOURCE_LABEL[c.source]?.toLowerCase(), line, c.postedFormat && `planned as ${c.format.toLowerCase()}, went out as ${c.postedFormat.toLowerCase()}`, c.postTime && `at ${c.postTime}`, c.delayReason && `delay: ${c.delayReason}`].filter(Boolean).join(" · ");
  return (
    <button type="button" className={`ev cev st-${slug(c.status)}${tm ? " tm-" + tm : ""}${extra ? " adhoc" : ""}`} style={{ "--c": p?.color || "var(--muted)" }} onClick={(e) => { e.stopPropagation(); w.openPost(c); }} title={tip}>
      <i className="glyph" aria-hidden="true">{C_GLYPH[fmt] || "•"}</i>
      <span className="t2">
        {showProject && p && <span className="pn">{p.name}</span>}
        <span className="t">{extra && <b className="tag">{c.source === "Ad-hoc" ? "Ad-hoc" : "Extra"}</b>}{label}</span>
        {line && (d.state === "late" || d.live !== d.due || c.linkedTo) && <span className="sub">{d.state === "late" && <b className="late-badge" aria-label={lateText(d.days)}>+{d.days}d</b>}{line.replace(/ · \d+ days? late$/, "")}</span>}
      </span>
    </button>
  );
}

// Calendar entries: a post sits on the day it went live; the planned day keeps a faint marker.
function calendarItems(items, idx, showProject) {
  const out = [];
  for (const c of items) {
    const d = delivery(c, idx.links, idx.byId);
    const rep = idx.links[c.id];
    if (rep && rep.id !== c.id) { // slot replaced by another post: marker only (the other post shows itself)
      out.push({ key: c.id + ":g", date: c.date, node: <ContentChip c={c} idx={idx} showProject={showProject} variant="ghost" /> });
      continue;
    }
    const live = postedDay(c);
    out.push({ key: c.id, date: live || c.date, node: <ContentChip c={c} idx={idx} showProject={showProject} /> });
    if (live && live !== c.date && !c.linkedTo && !isExtra(c)) out.push({ key: c.id + ":g", date: c.date, node: <ContentChip c={c} idx={idx} showProject={showProject} variant="ghost" /> });
  }
  return out;
}

export const ContentLegend = () => (
  <>
    <div className="legend">
      {Object.entries(TIMING_LABEL).map(([k, l]) => <span key={k}><i className={`sw tm-${k}`} />{l}</span>)}
      <span><b className="late-badge">+2d</b>Went live 2 days late (shown on the day it went live)</span>
      <span><i className="sw ghost-sw" />Planned day of a post that went live another day</span>
      <span><b className="tag">Ad-hoc</b><b className="tag">Extra</b>Client request / unplanned</span>
    </div>
    <div className="legend">{C_STATUS.map((s) => <span key={s}><i className={`sw st-${slug(s)}`} />{s}</span>)}</div>
  </>
);

// ---------- List view: one row per post, planned and posted dates side by side ----------
export function PostTable({ posts, showProject = true, empty = "No posts here." }) {
  const w = useWork();
  const idx = usePostIndex();
  if (!posts.length) return <div className="empty-box"><p>{empty}</p></div>;
  const rows = [...posts].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(postedDay(a)).localeCompare(String(postedDay(b))));
  return (
    <div className={`ptable${showProject ? "" : " no-proj"}`} role="table" aria-label="Posts">
      <div className="ptr head" role="row"><span>Planned</span><span>Posted</span>{showProject && <span>Client</span>}<span>Post</span><span>Format</span><span>Status</span><span>Delivery</span><span>Delay reason</span></div>
      {rows.map((c) => {
        const p = w.projectById[c.projectId];
        const d = delivery(c, idx.links, idx.byId);
        const tm = timingOf(d);
        const slot = c.linkedTo ? idx.byId[c.linkedTo] : null;
        const dl = d.state === "late" ? lateText(d.days) : d.state === "overdue" ? `${d.days}d overdue` : DELIVERY_LABEL[d.state];
        return (
          <div key={c.id} className={`ptr${tm ? " tm-" + tm : ""}`} role="row" tabIndex={0} onClick={() => w.openPost(c)} onKeyDown={(e) => e.key === "Enter" && w.openPost(c)}>
            <span data-l="Planned">{isExtra(c) && !slot ? <span className="faint">{c.source === "Ad-hoc" ? "Requested" : "Unplanned"}</span> : fmtShort(slot?.date || c.date)}{c.postTime ? <small className="faint"> {c.postTime}</small> : null}</span>
            <span data-l="Posted">{d.live ? fmtShort(d.live) : <span className="faint">–</span>}</span>
            {showProject && <span data-l="Client" className="muted">{p && <Dot p={p} size={8} />}{p ? p.name : "–"}</span>}
            <span data-l="Post" className="ptitle"><i className="glyph" aria-hidden="true">{C_GLYPH[actualFormat(c)] || "•"}</i>{isExtra(c) && <b className="tag">{c.source === "Ad-hoc" ? "Ad-hoc" : "Extra"}</b>}{postTitle(c)}{slot && <small className="faint"> · fulfils {fmtShort(slot.date)} {String(slot.format).toLowerCase()}</small>}{d.via && <small className="faint"> · replaced by {postTitle(d.via)}</small>}</span>
            <span data-l="Format">{c.postedFormat ? <>{c.format} → <b>{c.postedFormat}</b></> : c.format}</span>
            <span data-l="Status">{c.status}</span>
            <span data-l="Delivery" className="dl">{dl}</span>
            <span data-l="Delay reason" className="muted">{c.delayReason || (d.state === "late" ? <span className="faint">not given</span> : "")}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Month summary ----------
const BUCKETS = [["", "All"], ["ontime", "On time"], ["late", "Posted late"], ["overdue", "Overdue"], ["skip", "Skipped / moved"], ["extra", "Ad-hoc & unplanned"], ["upcoming", "Upcoming"]];
const bucketMatch = (c, d, b) => {
  if (!b) return true;
  if (b === "extra") return isExtra(c);
  if (isExtra(c) && !c.linkedTo) return false;
  if (b === "skip") return d.state === "skipped" || d.state === "moved";
  if (b === "upcoming") return d.state === "upcoming" || d.state === "delayed";
  return d.state === b;
};

function MonthSummary({ items, ym, idx, onPick }) {
  const inMonth = (c) => String(c.date).slice(0, 7) === ym || String(postedDay(c)).slice(0, 7) === ym;
  const mine = items.filter(inMonth);
  if (!mine.length) return null;
  const t = { due: 0, ontime: 0, late: 0, days: 0, overdue: 0, skip: 0, extra: 0, reasons: {} };
  const today = isoDate(new Date());
  for (const c of mine) {
    const d = delivery(c, idx.links, idx.byId);
    if (isExtra(c) && !c.linkedTo) { if (isPosted(c) && String(postedDay(c)).slice(0, 7) === ym) t.extra++; continue; }
    if (c.linkedTo) continue; // counted through the slot it fulfils
    if (String(c.date).slice(0, 7) !== ym || c.date > today) continue;
    t.due++;
    if (d.state === "ontime") t.ontime++;
    else if (d.state === "late") { t.late++; t.days += d.days; const r = (d.via || c).delayReason || "Not given"; t.reasons[r] = (t.reasons[r] || 0) + 1; }
    else if (d.state === "skipped" || d.state === "moved") t.skip++;
    else t.overdue++;
  }
  const avg = t.late ? (t.days / t.late).toFixed(1).replace(/\.0$/, "") : 0;
  const B = ({ k, n, label, cls }) => <button className={`stat-btn ${cls || ""}`} onClick={() => onPick(k)}><b>{n}</b> {label}</button>;
  return (
    <div className="card csum">
      <div className="csum-stats">
        <span><b>{t.due}</b> due so far</span>
        <B k="ontime" n={t.ontime} label="on time" />
        <B k="late" n={t.late} label={`posted late${t.late ? ` (avg ${avg} days)` : ""}`} cls={t.late ? "warn" : ""} />
        <B k="overdue" n={t.overdue} label="not posted" cls={t.overdue ? "bad" : ""} />
        <B k="skip" n={t.skip} label="skipped / moved" />
        <B k="extra" n={t.extra} label="ad-hoc & unplanned" />
      </div>
      {Object.keys(t.reasons).length > 0 && <div className="hint">Late because of: {Object.entries(t.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(" · ")}</div>}
    </div>
  );
}

export function ContentView({ projectId }) {
  const w = useWork();
  const idx = usePostIndex();
  const [ym, setYm] = useState(ymNow());
  const [view, setView] = useState("calendar");
  const [bulk, setBulk] = useState(false);
  const [f, setF] = useState({ project: projectId || "", status: w.contentStatus || "", format: "", source: "", bucket: "" });
  let items = w.data.content;
  if (f.project) items = items.filter((c) => c.projectId === f.project);
  if (f.status) items = items.filter((c) => c.status === f.status);
  if (f.format) items = items.filter((c) => c.format === f.format || c.postedFormat === f.format);
  if (f.source === "extras") items = items.filter(isExtra); else if (f.source) items = items.filter((c) => (c.source || "Calendar") === f.source);
  if (f.bucket) items = items.filter((c) => bucketMatch(c, delivery(c, idx.links, idx.byId), f.bucket));
  const rets = w.data.projects.filter((p) => p.engagement === "Retainer" && ["Active", "Onboarding"].includes(pipelineOf(p)) && (!f.project || p.id === f.project));
  const quota = rets.map((p) => {
    const o = output(w.data.content, p, ym); const bits = [];
    if (o.reels.target) bits.push(`${o.reels.planned}/${o.reels.target} reels`);
    if (o.statics.target) bits.push(`${o.statics.planned}/${o.statics.target} statics`);
    return bits.length ? <span key={p.id}><Dot p={p} size={9} />{p.name}: {bits.join(", ")}</span> : null;
  }).filter(Boolean);
  const set = (k, v) => setF({ ...f, [k]: v });
  const base = () => ({ projectId: f.project || projectId || "" });
  const adhocNew = () => w.openPost({ ...base(), source: "Ad-hoc", requestedOn: isoDate(new Date()), date: isoDate(new Date()) });
  const inMonth = (c) => String(c.date).slice(0, 7) === ym || String(postedDay(c)).slice(0, 7) === ym;
  const actions = (
    <div className="row">
      <button className="btn ghost" onClick={() => setBulk(true)}>Bulk update</button>
      <button className="btn" onClick={adhocNew}>Ad-hoc request</button>
      <button className="btn primary" onClick={() => w.openPost(base())}>New post</button>
    </div>
  );
  return (
    <>
      {!projectId && (
        <div className="page-head">
          <div><h2 className="page-title">Content calendar</h2><p className="hint">Posts sit on the day they went live; a faint marker stays on the planned day. <button className="linkish" onClick={() => w.go({ view: "clients" })}>Client summary →</button></p></div>
          {actions}
        </div>
      )}
      <div className="filters">
        <Seg options={[["calendar", "Calendar"], ["list", "List"]]} value={view} onChange={setView} />
        {!projectId && <label className="filter">Project<select className="mini" value={f.project} onChange={(e) => set("project", e.target.value)}><option value="">All projects</option>{sortProjects(w.data.projects).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="filter">Delivery<select className="mini" value={f.bucket} onChange={(e) => set("bucket", e.target.value)}>{BUCKETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="filter">Status<select className="mini" value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">Any</option>{C_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="filter">Type<select className="mini" value={f.source} onChange={(e) => set("source", e.target.value)}><option value="">All</option><option value="Calendar">Content calendar</option><option value="extras">Ad-hoc & unplanned</option><option value="Ad-hoc">Ad-hoc requests</option><option value="Unplanned">Unplanned extras</option></select></label>
        <label className="filter">Format<select className="mini" value={f.format} onChange={(e) => set("format", e.target.value)}><option value="">Any</option>{C_FORMATS.map((s) => <option key={s}>{s}</option>)}</select></label>
        {projectId && actions}
      </div>
      <MonthNav ym={ym} setYm={setYm} />
      {projectId && w.projectById[projectId] && <div className="quota"><OutputRows p={w.projectById[projectId]} ym={w.projectById[projectId].engagement === "Retainer" ? ym : null} /></div>}
      {!projectId && quota.length > 0 && <div className="legend"><span className="faint">Planned against retainer scope:</span>{quota}</div>}
      <MonthSummary items={f.bucket ? w.data.content.filter((c) => !f.project || c.projectId === f.project) : items} ym={ym} idx={idx} onPick={(b) => { setF({ ...f, bucket: f.bucket === b ? "" : b }); setView("list"); }} />
      {view === "calendar"
        ? <MonthGrid ym={ym} items={calendarItems(items, idx, !projectId)} onAdd={(d) => w.openPost({ date: d, projectId: f.project })} emptyText={`No posts for ${monthLabelOf(ym)}.`} />
        : <PostTable posts={items.filter(inMonth)} showProject={!projectId} empty={`No posts match for ${monthLabelOf(ym)}.`} />}
      <ContentLegend />
      {bulk && <BulkModal onClose={() => setBulk(false)} projectId={f.project || projectId} />}
    </>
  );
}

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

// ---------- Post form ----------
export function PostModal({ c, onClose }) {
  const w = useWork();
  const toast = useToast();
  const idx = usePostIndex();
  const isNew = !c.id;
  const pr = w.projectById[c.projectId];
  const [d, setD] = useState(() => ({
    projectId: "", date: "", format: "Reel", title: "", status: "Idea", link: "", notes: "", source: "Calendar", requestedOn: "",
    postedAt: "", postedFormat: "", postTime: "", delayReason: "", linkedTo: "", ...c,
    platform: c.platform || splitList(pr?.platforms)[0] || "Instagram",
    owners: c.id ? splitList(c.owners) : pr ? splitList(pr.teamPocs) : [],
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setD({ ...d, [k]: e?.target ? e.target.value : e });
  const posted = String(d.postedAt || "").slice(0, 10);
  const del = delivery({ ...d, id: c.id || "_new" }, idx.links, idx.byId);
  // Planned calendar posts this one could fulfil (same client, not yet out, not already replaced).
  const slots = d.projectId ? w.data.content.filter((x) => x.projectId === d.projectId && x.id !== c.id && !isExtra(x) && !isPosted(x) && x.status !== "Skipped" && (!idx.links[x.id] || idx.links[x.id].id === c.id || x.id === d.linkedTo)).sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
  function setStatus(v) {
    setD({ ...d, status: v, postedAt: v === "Posted" ? d.postedAt || isoDate(new Date()) : v === "Skipped" ? "" : d.postedAt });
  }
  function setPosted(v) {
    // Entering a posted date marks it Posted, unless it's flagged Delayed (kept so late posts stay identifiable).
    setD({ ...d, postedAt: v, status: v && !["Posted", "Delayed"].includes(d.status) ? "Posted" : !v && d.status === "Posted" ? "Scheduled" : d.status });
  }
  async function save() {
    if (!d.projectId) return setErr("Choose the project this post belongs to.");
    if (!parseISO(d.date)) return setErr(d.source === "Calendar" ? "Set the planned date." : "Set a due / post date.");
    setBusy(true);
    try {
      if (isNew) await api("/api/rec/content", { method: "POST", body: { item: d } });
      else await api(`/api/rec/content/${c.id}`, { method: "PUT", body: d });
      toast(isNew ? "Post added" : "Post saved"); onClose(); await w.reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function remove() { setBusy(true); try { await api(`/api/rec/content/${c.id}`, { method: "DELETE" }); toast("Post deleted"); onClose(); await w.reload(); } catch (e) { toast(e.message); setBusy(false); } }
  const title = isNew ? (d.source === "Ad-hoc" ? "Ad-hoc request" : d.source === "Unplanned" ? "Unplanned post" : "New post") : "Edit post";
  const lateNote = !isNew && (del.state === "late" ? `Went live ${fmtShort(del.live)}, ${lateText(del.days)} (due ${fmtShort(del.due)}).` : del.state === "overdue" ? `Not posted yet: ${del.days} ${del.days === 1 ? "day" : "days"} overdue.` : del.state === "moved" && del.via ? `Replaced by "${postTitle(del.via)}"${postedDay(del.via) ? `, live ${fmtShort(postedDay(del.via))}` : ""}.` : "");
  return (
    <Modal title={title} onClose={onClose}>
      {lateNote && <div className={`banner ${del.state === "late" ? "warn-banner" : ""}`}>{lateNote}</div>}
      <div className="grid">
        <Field label="Title" wide><input value={d.title} onChange={set("title")} placeholder="Hook or working title" /></Field>
        <div className="wide col tight"><span className="flabel">Type</span><Seg options={C_SOURCES.map((s) => [s, SOURCE_LABEL[s]])} value={d.source || "Calendar"} onChange={(v) => setD({ ...d, source: v, requestedOn: v === "Ad-hoc" ? d.requestedOn || isoDate(new Date()) : "" })} /></div>
        <Field label="Project"><select value={d.projectId} onChange={(e) => { const p = w.projectById[e.target.value]; setD({ ...d, projectId: e.target.value, linkedTo: "", owners: isNew && !d.owners.length && p ? splitList(p.teamPocs) : d.owners }); }}>
          <option value="">Choose a project</option>{sortProjects(w.data.projects).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        {d.source === "Ad-hoc" && <Field label="Requested on"><input type="date" value={String(d.requestedOn || "").slice(0, 10)} onChange={set("requestedOn")} /></Field>}
        <Field label={d.source === "Calendar" ? "Planned date" : d.source === "Ad-hoc" ? "Due date" : "Date"}><input type="date" value={d.date} onChange={set("date")} /></Field>
        <Field label="Posting time"><input type="time" value={d.postTime || ""} onChange={set("postTime")} /></Field>
        <div className="wide col tight"><span className="flabel">Format (planned)</span><Seg options={C_FORMATS} value={d.format} onChange={set("format")} /></div>
        <Field label="Platform"><select value={d.platform} onChange={set("platform")}>{PLATFORMS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Status"><select value={d.status} onChange={(e) => setStatus(e.target.value)}>{C_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Posted on (went live)"><div className="row tight"><input type="date" value={posted} onChange={(e) => setPosted(e.target.value)} style={{ flex: 1 }} />{posted && <button type="button" className="btn ghost" onClick={() => setPosted("")}>Clear</button>}</div></Field>
        {posted && <Field label="Went out as"><select value={d.postedFormat || ""} onChange={set("postedFormat")}><option value="">Same as planned ({d.format})</option>{C_FORMATS.filter((x) => x !== d.format).map((x) => <option key={x}>{x}</option>)}</select></Field>}
        {(["late", "overdue", "delayed"].includes(del.state) || d.status === "Delayed" || d.delayReason) && <Field label="Delay reason"><select value={d.delayReason || ""} onChange={set("delayReason")}><option value="">Choose…</option>{DELAY_REASONS.map((x) => <option key={x}>{x}</option>)}</select></Field>}
        {d.projectId && (d.source !== "Calendar" || d.linkedTo || slots.length > 0) && (
          <Field label="Fulfils / replaces a planned post" wide>
            <select value={d.linkedTo || ""} onChange={set("linkedTo")}>
              <option value="">None{d.source === "Calendar" ? "" : " (an extra, not in the calendar)"}</option>
              {slots.map((x) => <option key={x.id} value={x.id}>{fmtShort(x.date)} · {x.format} · {postTitle(x)}{x.status === "Moved" ? " (moved)" : ""}</option>)}
            </select>
          </Field>
        )}
        <div className="wide col tight"><span className="flabel">Owners</span><PeoplePicker value={d.owners} onChange={(v) => setD({ ...d, owners: v })} members={w.data.members} /></div>
        <Field label="Link" wide><input type="url" value={d.link} onChange={set("link")} placeholder="Draft or published link" /></Field>
        <Field label="Notes" wide><textarea rows={3} value={d.notes} onChange={set("notes")} placeholder="Script notes, references, caption" /></Field>
      </div>
      {d.linkedTo && <p className="hint">Saving marks that planned post as Moved; its lateness is judged by when this post went live.</p>}
      {err && <div className="banner">{err}</div>}
      <div className="row spread">
        <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{isNew ? "Add post" : "Save post"}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
        {!isNew && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}
      </div>
      {confirm && <Confirm text="Delete this post?" action="Delete post" onYes={remove} onNo={() => setConfirm(false)} />}
    </Modal>
  );
}

// ---------- Bulk update (paste from a sheet or CSV) ----------
const MONTHS3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function parseDay(v, year = new Date().getFullYear()) {
  const s = String(v || "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  const ok = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y < 100 ? 2000 + y : y}-${p2(m)}-${p2(d)}` : "");
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ok(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) return ok(+m[3], +m[2], +m[1]); // day first (India)
  if ((m = s.match(/^(\d{1,2})[ -]([a-z]{3})[a-z]*\.?(?:[ -](\d{2,4}))?$/))) { const mo = MONTHS3.indexOf(m[2]) + 1; return mo ? ok(m[3] ? +m[3] : year, mo, +m[1]) : ""; }
  if ((m = s.match(/^([a-z]{3})[a-z]*\.? (\d{1,2})(?: (\d{2,4}))?$/))) { const mo = MONTHS3.indexOf(m[1]) + 1; return mo ? ok(m[3] ? +m[3] : year, mo, +m[2]) : ""; }
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + +s * 864e5).toISOString().slice(0, 10); // spreadsheet serial
  return "";
}
function splitLine(line, sep) {
  if (sep === "\t") return line.split("\t").map((x) => x.trim());
  const out = []; let cur = "", q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  out.push(cur.trim()); return out;
}
const HEADERS = [
  ["project", /client|project|brand|account/], ["planned", /plan|schedul|due|^date$|post date/], ["posted", /posted|live|publish|actual date|went/],
  ["format", /format|type|kind/], ["actual", /posted as|actual format|went out as/], ["link", /link|url/], ["time", /time/], ["reason", /reason|why/], ["status", /status/], ["title", /title|topic|content|hook/],
];
export function parsePaste(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const first = splitLine(lines[0], sep).map((x) => x.toLowerCase());
  const map = {};
  first.forEach((h, i) => { const hit = HEADERS.find(([k, re]) => !map[k] && re.test(h)); if (hit) map[hit[0]] = i; });
  const hasHeader = Object.keys(map).length >= 2 && (map.planned !== undefined || map.posted !== undefined);
  const cols = hasHeader ? map : { project: 0, planned: 1, format: 2, posted: 3, link: 4 };
  return (hasHeader ? lines.slice(1) : lines).map((l) => {
    const r = splitLine(l, sep); const g = (k) => (cols[k] === undefined ? "" : r[cols[k]] || "");
    const fmt = (x) => C_FORMATS.find((f) => f.toLowerCase() === String(x).trim().toLowerCase().replace(/s$/, "")) || "";
    return { project: g("project"), planned: parseDay(g("planned")), posted: parseDay(g("posted")), format: fmt(g("format")), actual: fmt(g("actual")), link: g("link"), time: (g("time").match(/^\d{1,2}:\d{2}/) || [""])[0], reason: DELAY_REASONS.find((x) => x.toLowerCase() === g("reason").toLowerCase()) || (g("reason") ? "Other" : ""), status: C_STATUS.find((x) => x.toLowerCase() === g("status").toLowerCase()) || "", title: g("title"), raw: l };
  });
}

function BulkModal({ onClose, projectId }) {
  const w = useWork();
  const toast = useToast();
  const [text, setText] = useState("");
  const [addExtras, setAddExtras] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const projects = w.data.projects;
  const findProject = (name) => {
    const n = String(name || "").trim().toLowerCase();
    if (!n) return projectId ? w.projectById[projectId] : null;
    return projects.find((p) => p.name.toLowerCase() === n) || projects.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())) || projects.find((p) => String(p.client || "").toLowerCase().includes(n));
  };
  const plan = useMemo(() => {
    const used = new Set();
    return parsePaste(text).map((r) => {
      const p = findProject(r.project);
      if (!p) return { r, error: r.project ? `No project called "${r.project}"` : "Which client? Add a client column or pick a project first." };
      let match = null;
      if (r.planned) {
        const cands = w.data.content.filter((c) => c.projectId === p.id && c.date === r.planned && !used.has(c.id));
        match = cands.find((c) => !r.format || c.format === r.format) || cands[0] || null;
      }
      if (match) { used.add(match.id); return { r, p, match }; }
      if (r.posted) return { r, p, add: true };
      return { r, p, error: r.planned ? `No ${p.name} post planned on ${fmtShort(r.planned)}` : "Needs a planned or posted date" };
    });
  }, [text, projectId, w.data.content]); // eslint-disable-line react-hooks/exhaustive-deps
  const updates = plan.filter((x) => x.match).map(({ r, match }) => {
    const u = { id: match.id };
    if (r.posted) { u.postedAt = r.posted; if (match.status !== "Delayed") u.status = "Posted"; }
    if (r.status) u.status = r.status;
    if (r.link) u.link = r.link;
    if (r.time) u.postTime = r.time;
    if (r.reason) u.delayReason = r.reason;
    if (r.actual && r.actual !== match.format) u.postedFormat = r.actual;
    if (r.title && !match.title) u.title = r.title;
    return u;
  }).filter((u) => Object.keys(u).length > 1);
  const adds = addExtras ? plan.filter((x) => x.add).map(({ r, p }) => ({ projectId: p.id, date: r.posted, postedAt: r.posted, status: "Posted", source: "Unplanned", format: r.actual || r.format || "Reel", link: r.link, postTime: r.time, title: r.title, platform: splitList(p.platforms)[0] || "Instagram" })) : [];
  async function apply() {
    setBusy(true); setErr("");
    try { const res = await api("/api/content-bulk", { method: "POST", body: { updates, adds } }); toast(`Updated ${res.updated}${res.added ? `, added ${res.added}` : ""}`); onClose(); await w.reload(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const nAdd = plan.filter((x) => x.add).length;
  return (
    <Modal title="Bulk update posted dates" onClose={onClose} wide>
      <p className="hint">Paste rows from a sheet or CSV. Columns can be in any order if the first row has headers, e.g. <b>Client, Planned date, Format, Posted date, Link, Time, Delay reason</b>. Without headers the order is Client, Planned date, Format, Posted date, Link. Dates like 5 Nov, Nov 5, 05/11/2026 or 2026-11-05 all work.</p>
      <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Client\tPlanned date\tFormat\tPosted date\tLink\nWintex\t2 Nov\tCarousel\t5 Nov\thttps://instagram.com/p/…"} />
      {plan.length > 0 && (
        <div className="bulk-prev">
          {plan.map((x, i) => (
            <div key={i} className={`bp ${x.error ? "bad" : x.add ? "add" : "ok"}`}>
              <span>{x.p ? x.p.name : x.r.project || "?"}</span>
              <span>{x.r.planned ? fmtShort(x.r.planned) : "–"} → {x.r.posted ? fmtShort(x.r.posted) : "–"}</span>
              <span>{x.error ? x.error : x.add ? "Not in the calendar: add as an unplanned post?" : `${postTitle(x.match)} (${x.match.format})${x.r.posted && x.r.planned && x.r.posted > x.r.planned ? ` · ${lateText(Math.round((parseISO(x.r.posted) - parseISO(x.r.planned)) / 864e5))}` : ""}`}</span>
            </div>
          ))}
        </div>
      )}
      {nAdd > 0 && <label className="check"><input type="checkbox" checked={addExtras} onChange={(e) => setAddExtras(e.target.checked)} /> Add the {nAdd} unmatched {nAdd === 1 ? "row" : "rows"} as unplanned posts</label>}
      {err && <div className="banner">{err}</div>}
      <div className="row"><button className="btn primary" disabled={busy || (!updates.length && !adds.length)} onClick={apply}>Update {updates.length} {updates.length === 1 ? "post" : "posts"}{adds.length ? ` and add ${adds.length}` : ""}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
