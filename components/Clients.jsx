"use client";
import { useMemo, useState } from "react";
import { useWork, Dot, MonthNav, monthLabelOf } from "./workui";
import { PostTable, usePostIndex } from "./Content";
import { sortProjects, ymNow } from "./workdata";
import { clientTally, bucketOf, scopeFor, todayIST } from "@/lib/posts";

const COLS = [
  ["due", "Due so far"], ["ontime", "On time"], ["late", "Posted late"], ["notPosted", "Not posted"], ["skipped", "Skipped / moved"], ["extras", "Unplanned extras"],
];
const BUCKET_TABS = [["all", "All posts"], ["ontime", "On time"], ["late", "Posted late"], ["notPosted", "Not posted"], ["skipped", "Skipped / moved"], ["extras", "Unplanned extras"], ["upcoming", "Upcoming"]];

// Every client with content: delivery to date, and this month's scope.
export function ClientsView() {
  const w = useWork();
  const idx = usePostIndex();
  const [ym, setYm] = useState(ymNow());
  const [open, setOpen] = useState(null); // { id, bucket }
  const today = todayIST();
  const rows = useMemo(() => {
    const withPosts = new Set(w.data.content.map((c) => c.projectId));
    return sortProjects(w.data.projects).filter((p) => withPosts.has(p.id) || (p.engagement === "Retainer" && (Number(p.reels) || Number(p.statics))))
      .map((p) => {
        const posts = w.data.content.filter((c) => c.projectId === p.id);
        const t = clientTally(posts, today);
        return { p, posts, t, scope: scopeFor(p, w.data.content, ym) };
      });
  }, [w.data, ym, today]);
  if (open) {
    const r = rows.find((x) => x.p.id === open.id);
    if (r) return <ClientDetail r={r} ym={ym} setYm={setYm} bucket={open.bucket} setBucket={(b) => setOpen({ ...open, bucket: b })} onBack={() => setOpen(null)} idx={idx} />;
  }
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Client summary</h2><p className="hint">Calendar posts due up to today and how they went out. Click a number to see those posts.</p></div>
      </div>
      {!rows.length && <div className="empty-box"><p>No client content yet.</p></div>}
      {rows.length > 0 && (
        <div className="ctable" role="table">
          <div className="ctr head" role="row"><span>Client</span>{COLS.map(([, l]) => <span key={l}>{l}</span>)}<span>Avg delay</span></div>
          {rows.map(({ p, t }) => (
            <div key={p.id} className="ctr" role="row">
              <button className="cname linkish" onClick={() => setOpen({ id: p.id, bucket: "all" })}><Dot p={p} size={9} />{p.name}</button>
              {COLS.map(([k, l]) => {
                const n = k === "skipped" ? t.skipped + t.moved : t[k];
                const cls = k === "late" && n ? "warn" : k === "notPosted" && n ? "bad" : k === "ontime" && n ? "good" : "";
                return <button key={k} data-l={l} className={`cnum ${cls}`} disabled={!n} onClick={() => setOpen({ id: p.id, bucket: k === "due" ? "all" : k })}>{n}</button>;
              })}
              <span data-l="Avg delay" className="muted">{t.late ? `${(t.lateDays / t.late).toFixed(1).replace(/\.0$/, "")} days` : "–"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="page-head" style={{ marginTop: 18 }}>
        <div><h3>Monthly scope</h3><p className="hint">Retainer scope against what went live that month (by the format it went out as; carousels count as statics). Backlog is scope missed in earlier months.</p></div>
      </div>
      <MonthNav ym={ym} setYm={setYm} />
      <ScopeTable rows={rows.filter((r) => r.scope.reels.scope || r.scope.statics.scope)} ym={ym} onOpen={(id) => setOpen({ id, bucket: "all" })} />
    </>
  );
}

function ScopeTable({ rows, ym, onOpen }) {
  if (!rows.length) return <div className="empty-box"><p>No retainer scope set. Add reels and statics per month on a project's Overview.</p></div>;
  return (
    <div className="stable" role="table">
      <div className="str head" role="row"><span>Client</span><span>Type</span><span>Scope</span><span>Delivered</span><span>Remaining</span><span>Backlog in</span><span>Total owed</span></div>
      {rows.flatMap(({ p, scope }) => ["reels", "statics"].filter((k) => scope[k].scope || scope[k].delivered || scope[k].backlog).map((k, i) => {
        const s = scope[k];
        return (
          <div key={p.id + k} className="str" role="row">
            <span data-l="Client">{i === 0 ? <button className="linkish" onClick={() => onOpen(p.id)}><Dot p={p} size={9} />{p.name}</button> : ""}</span>
            <span data-l="Type">{k === "reels" ? "Reels" : "Statics + carousels"}</span>
            <span data-l="Scope">{s.scope}</span>
            <span data-l="Delivered"><Meter v={s.delivered} of={s.scope} />{s.delivered}</span>
            <span data-l="Remaining" className={s.remaining ? "" : "muted"}>{s.remaining}</span>
            <span data-l="Backlog in" className={s.backlog ? "warn" : "muted"}>{s.backlog}</span>
            <span data-l="Total owed" className={s.owed ? "strong" : "muted"}>{s.owed}</span>
          </div>
        );
      }))}
    </div>
  );
}
const Meter = ({ v, of }) => <i className="meter" aria-hidden="true"><b style={{ width: `${of ? Math.min(100, (v / of) * 100) : v ? 100 : 0}%` }} /></i>;

function ClientDetail({ r, ym, setYm, bucket, setBucket, onBack, idx }) {
  const w = useWork();
  const { p, posts, t } = r;
  const today = todayIST();
  const scope = scopeFor(p, w.data.content, ym);
  const list = bucket === "all" ? posts : posts.filter((c) => {
    const b = bucketOf(c, idx.links, idx.byId, today);
    if (bucket === "skipped") return b === "skipped" || b === "moved";
    if (bucket === "extras") return b === "extras";
    if (bucket === "late") return b === "late" || (b === "replacement" && idx.byId[c.linkedTo] && bucketOf(idx.byId[c.linkedTo], idx.links, idx.byId, today) === "late");
    return b === bucket;
  });
  const reasons = Object.entries(t.reasons).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="page-head">
        <div><button className="linkish" onClick={onBack}>← All clients</button><h2 className="page-title"><Dot p={p} size={12} /> {p.name}</h2></div>
        <div className="row"><button className="btn ghost" onClick={() => w.go({ view: "project", id: p.id })}>Project page</button><button className="btn" onClick={() => w.openPost({ projectId: p.id, source: "Ad-hoc", date: today, requestedOn: today })}>Ad-hoc request</button></div>
      </div>
      <div className="kpis">
        {[["due", "Due so far", t.due], ["ontime", "On time", t.ontime], ["late", "Posted late", t.late], ["notPosted", "Not posted", t.notPosted], ["skipped", "Skipped / moved", t.skipped + t.moved], ["extras", "Unplanned extras", t.extras]].map(([k, l, n]) => (
          <button key={k} className={`kpi${bucket === k || (k === "due" && bucket === "all") ? " on" : ""} ${k === "late" && n ? "warn" : k === "notPosted" && n ? "bad" : ""}`} onClick={() => setBucket(k === "due" ? "all" : k)}><b>{n}</b><span>{l}</span></button>
        ))}
      </div>
      {t.late > 0 && <p className="hint">Average delay {(t.lateDays / t.late).toFixed(1).replace(/\.0$/, "")} days. {reasons.length ? "Causes: " + reasons.map(([k, n]) => `${k} ${n}`).join(" · ") : ""}</p>}
      {(scope.reels.scope || scope.statics.scope) > 0 && (
        <div className="card">
          <div className="row spread"><h3>Retainer scope</h3><MonthNav ym={ym} setYm={setYm} /></div>
          <div className="scope-grid">
            {["reels", "statics"].filter((k) => scope[k].scope || scope[k].delivered).map((k) => {
              const s = scope[k];
              return (
                <div key={k} className="scope-card">
                  <div className="muted">{k === "reels" ? "Reels" : "Statics + carousels"}</div>
                  <div className="big">{s.delivered}<small> / {s.scope}</small></div>
                  <Meter v={s.delivered} of={s.scope} />
                  <div className="hint">{s.remaining} remaining this month{s.backlog ? ` · ${s.backlog} backlog from earlier months · ${s.owed} owed in total` : ""}</div>
                </div>
              );
            })}
          </div>
          <p className="hint">Planned this month: {scope.planned.reels} reels, {scope.planned.statics} statics/carousels{scope.extras ? ` · ${scope.extras} ad-hoc/unplanned` : ""}{scope.other ? ` · ${scope.other} other formats delivered` : ""}. Backlog counted since {monthLabelOf(scope.since)}.</p>
        </div>
      )}
      <div className="chips" role="group" aria-label="Show">{BUCKET_TABS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={bucket === k} onClick={() => setBucket(k)}>{l}</button>)}</div>
      <PostTable posts={list} showProject={false} empty="No posts in this group." />
    </>
  );
}
