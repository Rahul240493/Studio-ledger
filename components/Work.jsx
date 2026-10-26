"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RING_OF, RING_LABEL, EARLY, C_STATUS, PR_RANK } from "@/lib/config";
import { useWork, Dot } from "./workui";
import { TicketLine } from "./Tickets";
import { OutputRows } from "./Content";
import { isOpen, parseISO, today0, daysBetween, byDeadline, sortTickets, plural, dueInfo, splitList, MONTHS, weekStart, addDaysD, isoDate, fmtShort, output, pipelineOf, sortProjects, ymNow, projColor } from "./workdata";
import { DEF_TF } from "./Tickets";

const statusCls = (s) => "st-" + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
export const StatusPill = ({ s }) => <span className={`pill ${statusCls(s)}`}>{s}</span>;

export function WorkOverview() {
  const w = useWork();
  const ps = sortProjects(w.data.projects), ts = w.data.tickets, t0 = today0();
  const open = ts.filter(isOpen);
  const overdue = open.filter((t) => { const d = parseISO(t.deadline); return d && d < t0; }).sort(byDeadline);
  const week = open.filter((t) => { const d = parseISO(t.deadline); return d && d >= t0 && daysBetween(t0, d) <= 7; }).sort(sortTickets("deadline"));
  const noDl = open.filter((t) => !parseISO(t.deadline));
  const active = ps.filter((p) => pipelineOf(p) === "Active");
  const delivered = ps.filter((p) => pipelineOf(p) === "Delivered");
  const ym = ymNow(), mi = Number(ym.slice(5)) - 1;
  const rets = ps.filter((p) => p.engagement === "Retainer" && ["Active", "Onboarding"].includes(pipelineOf(p)));
  const pipe = ps.filter((p) => EARLY.concat(["Onboarding", "On hold"]).includes(pipelineOf(p)));
  const att = overdue.concat(week).slice(0, 8);
  const line = `${active.length} active ${plural(active.length, "project")}, ${open.length} open ${plural(open.length, "ticket")}${overdue.length ? `, ${overdue.length} overdue` : ""}.`;
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Studio</h2><p className="hint">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. {line}</p></div>
        <div className="row"><button className="btn" onClick={() => w.openPost({})}>New post</button><button className="btn primary" onClick={() => w.openTicket({})}>New ticket</button></div>
      </div>

      <section className="panel col">
        <div className="row spread"><h3>Orbit</h3><span className="hint">Live work sits at the core, leads further out. Select a planet to open its page.</span></div>
        {ps.length ? <Orbit projects={ps.filter((p) => RING_OF[pipelineOf(p)])} open={open} /> : <div className="empty-box"><p>No projects yet.</p><p>Add your first project to see it here.</p><div><button className="btn primary" onClick={() => w.go({ view: "projects", newProject: true })}>New project</button></div></div>}
        <div className="legend"><span>Dashed ring: open P1 or overdue work.</span>{delivered.length > 0 && <span>Delivered: {delivered.map((p) => p.name).join(", ")}</span>}</div>
      </section>

      <div className="ov-grid">
        <section className="panel col">
          <div className="row spread"><h3>Needs attention</h3><button className="link" onClick={() => w.go({ view: "tickets" })}>All tickets</button></div>
          {att.length ? <div className="rows">{att.map((t) => <TicketLine key={t.id} t={t} />)}</div> : <p className="muted">Nothing overdue or due in the next 7 days.</p>}
          {noDl.length > 0 && <button className="nudge" onClick={() => w.go({ view: "tickets", filter: { ...DEF_TF, due: "none" } })}>{noDl.length} open {plural(noDl.length, "ticket")} {noDl.length === 1 ? "has" : "have"} no deadline yet. Set them.</button>}
        </section>
        <section className="panel col">
          <h3>Retainer output, {MONTHS[mi]}</h3>
          <p className="hint">Posts on the content calendar against each retainer's monthly scope. Carousels count as statics.</p>
          {rets.length ? rets.map((p) => (
            <div key={p.id} className="ret-row">
              <button className="ret-name" onClick={() => w.go({ view: "project", id: p.id, tab: "content" })}><Dot p={p} />{p.name}{pipelineOf(p) === "Onboarding" && <StatusPill s="Onboarding" />}</button>
              <OutputRows p={p} ym={ym} /> {!(Number(p.reels) || Number(p.statics)) && <p className="muted">Set the monthly scope on the project page.</p>}
            </div>)) : <p className="muted">No active retainers.</p>}
        </section>
      </div>

      <Insights />

      <section className="panel flush">
        <div className="phead"><h3>Pipeline</h3><button className="link" onClick={() => w.go({ view: "projects" })}>All projects</button></div>
        {pipe.length ? <div className="list">{pipe.map((p) => {
          const next = open.filter((t) => t.projectId === p.id).sort(sortTickets("priority"))[0];
          const di = next ? dueInfo(next.deadline) : null;
          return (
            <button key={p.id} className="item" onClick={() => w.go({ view: "project", id: p.id })}>
              <span className="t"><Dot p={p} />{p.name}</span><span className="a"><StatusPill s={pipelineOf(p)} /></span>
              <span className="s">{next ? `Next: ${next.title}${di.cls === "none" ? ", no deadline" : ", " + di.text.toLowerCase()}` : "No next step yet"}</span><span className="g" />
            </button>); })}</div> : <div className="empty">No leads or paused projects.</div>}
      </section>
    </>
  );
}

/* ---------- orbit ---------- */
function useWidth(ref) {
  const [wd, setWd] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setWd(e[0].contentRect.width));
    ro.observe(ref.current); return () => ro.disconnect();
  }, [ref]);
  return wd;
}
function layoutOrbit(ps, narrow) {
  const L = narrow
    ? { W: 480, H: 660, cx: 240, cy: 330, rx: [0, 92, 142, 186, 224], ry: [0, 108, 166, 220, 272], font: 16, mode: "below" }
    : { W: 1000, H: 440, cx: 500, cy: 220, rx: [0, 150, 224, 290, 352], ry: [0, 76, 114, 150, 184], font: 15, mode: "side" };
  const textW = (str) => String(str || "").length * L.font * 0.56;
  const labelPos = (n, ang, lp) => {
    const x = L.cx + L.rx[n.k] * Math.cos(ang), y = L.cy + L.ry[n.k] * Math.sin(ang);
    const r = n.r * (0.86 + (0.14 * (Math.sin(ang) + 1)) / 2), c = Math.cos(ang), f = L.font;
    let mode = lp;
    if (mode === "auto") mode = L.mode === "side" && c > 0.3 ? "right" : L.mode === "side" && c < -0.3 ? "left" : "below";
    let tx = 0, ty = 0, anchor = "middle";
    if (mode === "right") { tx = r + 8; ty = 5; anchor = "start"; }
    else if (mode === "left") { tx = -r - 8; ty = 5; anchor = "end"; }
    else { ty = mode === "above" ? -r - 7 : r + f + 3; if (x > L.W - 90) { anchor = "end"; tx = r; } else if (x < 90) { anchor = "start"; tx = -r; } }
    return { x, y, r, tx, ty, anchor };
  };
  const boxesFor = (n, ang, lp) => {
    const q = labelPos(n, ang, lp), wdt = textW(n.p.name), f = L.font;
    const x0 = q.anchor === "start" ? q.x + q.tx : q.anchor === "end" ? q.x + q.tx - wdt : q.x + q.tx - wdt / 2;
    const by = q.y + q.ty;
    return [[q.x - q.r - 3, q.y - q.r - 3, q.x + q.r + 3, q.y + q.r + 3], [x0, by - f * 0.8, x0 + wdt, by + f * 0.3]];
  };
  const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const outside = (b) => Math.max(0, -b[0]) + Math.max(0, b[2] - L.W) + Math.max(0, -b[1]) + Math.max(0, b[3] - L.H);
  const placed = [[L.cx - 24, L.cy - 24, L.cx + 24, L.cy + 24]];
  for (let k = 1; k <= 4; k++) { const wl = RING_LABEL[k].length * 12.5 * 0.56; placed.push([L.cx - wl / 2 - 6, L.cy - L.ry[k] - 20, L.cx + wl / 2 + 6, L.cy - L.ry[k] + 14]); }
  const rings = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of ps) rings[RING_OF[pipelineOf(p)]].push(p);
  const nodes = [];
  for (let k = 1; k <= 4; k++) {
    const arr = rings[k]; if (!arr.length) continue;
    const ringNodes = arr.map((p) => { const size = (Number(p.reels) || 0) + (Number(p.statics) || 0); return { p, k, r: p.engagement === "Retainer" ? 8 + Math.min(10, size / 2.2) : 7.5 }; });
    const step = 360 / arr.length; let best = null;
    const opts = L.mode === "side" ? ["auto", "below", "above"] : ["below", "above"];
    for (let o = 0; o < step; o += 3) {
      let score = 0; const chosen = [];
      ringNodes.forEach((nd, i) => {
        const ang = ((-90 + step / 2 + i * step + o) * Math.PI) / 180; let pick = null;
        opts.forEach((lp, oi) => {
          const bx = boxesFor(nd, ang, lp); let sc = oi * 2;
          for (const part of bx) { for (const q of placed) sc += overlap(part, q); for (const c of chosen) for (const cb of c.bx) sc += overlap(part, cb); sc += outside(part) * 60; }
          if (!pick || sc < pick.sc) pick = { sc, lp, bx };
        });
        chosen.push(pick); score += pick.sc;
      });
      if (!best || score < best.score - 0.5) best = { score, o, chosen };
    }
    ringNodes.forEach((nd, i) => { nd.ang = ((-90 + step / 2 + i * step + best.o) * Math.PI) / 180; nd.lp = best.chosen[i].lp; nodes.push(nd); placed.push(...best.chosen[i].bx); });
  }
  return { L, nodes, labelPos };
}
let orbitPlayed = false;
function Orbit({ projects, open }) {
  const w = useWork();
  const wrap = useRef(null);
  const width = useWidth(wrap);
  const narrow = width < 640;
  const { L, nodes, labelPos } = useMemo(() => layoutOrbit(projects, narrow), [projects, narrow]);
  const [t, setT] = useState(orbitPlayed ? 1 : 0);
  useEffect(() => {
    if (orbitPlayed || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) { setT(1); orbitPlayed = true; return; }
    let raf; const start = performance.now();
    const f = (now) => { const v = Math.min(1, (now - start) / 1500); setT(v); if (v < 1) raf = requestAnimationFrame(f); else orbitPlayed = true; };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, []);
  const e = 1 - Math.pow(1 - t, 3);
  const t0 = today0();
  const alert = {};
  for (const tk of open) { const d = parseISO(tk.deadline); if (tk.priority === "P1" || (d && d < t0)) alert[tk.projectId] = true; }
  const placed = nodes.map((n) => ({ n, q: labelPos(n, n.ang - 0.9 * (1 - e), n.lp || "auto") })).sort((a, b) => a.q.y - b.q.y);
  return (
    <div ref={wrap}>
      <svg viewBox={`0 0 ${L.W} ${L.H}`} className="orbit" role="group" aria-label="Projects arranged by pipeline stage">
        <defs><radialGradient id="sun"><stop offset="0%" stopColor="var(--ink)" stopOpacity=".5" /><stop offset="100%" stopColor="var(--ink)" stopOpacity="0" /></radialGradient></defs>
        {[1, 2, 3, 4].map((k) => (
          <g key={k}><ellipse className={`ring${k === 4 ? " outer" : ""}`} cx={L.cx} cy={L.cy} rx={L.rx[k]} ry={L.ry[k]} />
            <text className="ring-label" x={L.cx} y={L.cy - L.ry[k] - 7} textAnchor="middle">{RING_LABEL[k]}</text></g>
        ))}
        <circle cx={L.cx} cy={L.cy} r={46} fill="url(#sun)" />
        <circle cx={L.cx} cy={L.cy} r={15} fill="var(--ink)" />
        {placed.map(({ n, q }) => {
          const p = n.p; const openN = open.filter((x) => x.projectId === p.id).length;
          const go = () => w.go({ view: "project", id: p.id });
          return (
            <g key={p.id} className={`planet${alert[p.id] ? " alert" : ""}${pipelineOf(p) === "On hold" ? " dim" : ""}`} transform={`translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`}
              tabIndex={0} role="link" aria-label={`${p.name}, ${pipelineOf(p)}, ${openN} open ${plural(openN, "ticket")}`} onClick={go} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), go())}>
              <title>{`${p.name}: ${pipelineOf(p)}, ${openN} open ${plural(openN, "ticket")}`}</title>
              <circle className="halo" r={q.r + 5} /><circle className="body" r={q.r} fill={projColor(p)} />
              <text fontSize={L.font} x={q.tx.toFixed(1)} y={q.ty.toFixed(1)} textAnchor={q.anchor}>{p.name}</text>
            </g>);
        })}
      </svg>
    </div>
  );
}

/* ---------- insights ---------- */
const prioCounts = (arr) => { const c = { P1: 0, P2: 0, P3: 0 }; for (const t of arr) c[PR_RANK[t.priority] != null ? t.priority : "P2"]++; return c; };
const prParts = (c) => [{ v: c.P1, fill: "var(--p1)" }, { v: c.P2, fill: "var(--p2)" }, { v: c.P3, fill: "var(--p3)" }];
const prTotal = (c) => c.P1 + c.P2 + c.P3;
const prTip = (name, c) => `${name}: ${prTotal(c)} open (${c.P1} P1, ${c.P2} P2, ${c.P3} P3)`;
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
function Legend({ items }) { return <div className="chart-legend">{items.map(([l, c, k]) => <span key={l}><i className={k || ""} style={{ "--c": c }} />{l}</span>)}</div>; }
const PrLegend = () => <Legend items={[["P1 High", "var(--p1)"], ["P2 Medium", "var(--p2)"], ["P3 Low", "var(--p3)"]]} />;
function Chart({ title, sub, children, legend }) {
  return <section className="panel chart"><div className="row spread"><h3>{title}</h3>{sub && <span className="hint">{sub}</span>}</div>{children}{legend}</section>;
}
function StackedBars({ rows, rowH = 28, labelW = 140 }) {
  const W = 400, pad = 4, hasDot = rows.some((r) => r.dot);
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.v, 0)));
  const x0 = labelW + 10, bw = W - x0 - 30, H = pad * 2 + rows.length * rowH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      {rows.map((r, i) => {
        const y = pad + i * rowH, cy = y + rowH / 2, total = r.parts.reduce((a, p) => a + p.v, 0);
        let x = x0;
        return (
          <g key={i} className={`hit${r.onClick ? " clickable" : ""}`} onClick={r.onClick} role={r.onClick ? "button" : "img"} tabIndex={r.onClick ? 0 : -1} aria-label={r.tip}>
            <title>{r.tip}</title>
            <rect className="hl" x={-6} y={y + 1} width={W + 12} height={rowH - 2} fill="transparent" />
            {r.dot && <circle cx={5} cy={cy} r={4} fill={r.dot} />}
            <text className="lbl" x={hasDot ? 16 : 0} y={cy + 4.5}>{clip(r.label, hasDot ? 17 : 19)}</text>
            <rect x={x0} y={cy - 5} width={bw} height={10} fill="var(--sunk)" />
            {r.parts.map((p, j) => { if (!p.v) return null; const wd = (p.v / max) * bw; const el = <rect key={j} x={x.toFixed(1)} y={cy - 5} width={(wd + 0.5).toFixed(1)} height={10} fill={p.fill} />; x += wd; return el; })}
            <text className="val" x={(x0 + (total / max) * bw + 7).toFixed(1)} y={cy + 4.5}>{total}</text>
          </g>);
      })}
    </svg>
  );
}
function YTicks({ max, L, R, base, ph }) {
  const ticks = max <= 1 ? [0, 1] : [0, Math.ceil(max / 2), max];
  return ticks.map((tv) => { const y = base - (tv / max) * ph; return <g key={tv}><line className={tv ? "grid-line" : "axis"} x1={L} x2={R} y1={y} y2={y} /><text x={L - 7} y={y + 4} textAnchor="end">{tv}</text></g>; });
}

function Insights() {
  const w = useWork();
  const ps = w.data.projects, ts = w.data.tickets, open = ts.filter(isOpen), content = w.data.content;
  return (
    <section className="col">
      <h3>Insights</h3>
      <div className="chart-grid">
        <RetainerGauge ps={ps} content={content} />
        <DeadlineChart open={open} />
        <ProjectLoad open={open} />
        <TeamLoad open={open} />
        <ContentPipeline content={content} />
        <Flow ts={ts} />
      </div>
    </section>
  );
}

function RetainerGauge({ ps, content }) {
  const now = new Date(), ym = ymNow(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), left = dim - now.getDate();
  const sub = `${MONTHS[now.getMonth()]}, ${left} ${plural(left, "day")} left`;
  const rets = ps.filter((p) => p.engagement === "Retainer" && ["Active", "Onboarding"].includes(pipelineOf(p)));
  const R = { t: 0, pl: 0, po: 0 }, St = { t: 0, pl: 0, po: 0 };
  for (const p of rets) { const o = output(content, p, ym); R.t += o.reels.target; R.pl += o.reels.planned; R.po += o.reels.posted; St.t += o.statics.target; St.pl += o.statics.planned; St.po += o.statics.posted; }
  const target = R.t + St.t;
  if (!target) return <Chart title="Retainer output" sub={sub}><p className="muted">Set the monthly scope on active retainers to track output here.</p></Chart>;
  const posted = R.po + St.po, planned = R.pl + St.pl, cx = 96, cy = 100;
  const ring = (r, d, label) => {
    const pPl = d.t ? Math.min(100, (d.pl / d.t) * 100) : 0, pPo = d.t ? Math.min(100, (d.po / d.t) * 100) : 0;
    const arc = (pv, op) => (pv > 0 ? <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ink)" strokeOpacity={op} strokeWidth={11} pathLength={100} strokeDasharray={`${pv.toFixed(2)} 100`} transform={`rotate(-90 ${cx} ${cy})`} /> : null);
    return <g key={label}><title>{`${label}: ${d.po} posted, ${d.pl} planned, of ${d.t} this month`}</title><circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--sunk)" strokeWidth={11} />{arc(pPl, 0.3)}{arc(pPo, 1)}</g>;
  };
  const expected = Math.round((target * now.getDate()) / dim), behind = expected - posted, toPlan = Math.max(0, target - planned);
  let y = 44; const lines = [];
  const line = (label, d) => { lines.push(<g key={label}><text className="lbl" x={206} y={y}>{label}</text><text x={206} y={y + 19}>{`${d.po} posted, ${d.pl} planned of ${d.t}`}</text></g>); y += 50; };
  if (R.t) line(St.t ? "Reels, outer ring" : "Reels", R);
  if (St.t) line(R.t ? "Statics, inner ring" : "Statics", St);
  return (
    <Chart title="Retainer output" sub={sub} legend={<Legend items={[["Posted", "var(--ink)"], ["Planned", "var(--ink)", "soft"]]} />}>
      <svg viewBox="0 0 400 200">
        {R.t > 0 && ring(84, R, "Reels")}{St.t > 0 && ring(R.t ? 61 : 84, St, "Statics")}
        <text className="big" x={cx} y={cy + 9} textAnchor="middle">{Math.round((posted / target) * 100)}%</text>
        <text x={cx} y={cy + 28} textAnchor="middle">posted</text>
        {lines}
        <text className={behind > 0 ? "val bad" : "val"} x={206} y={y + 2}>{behind > 0 ? `${behind} ${plural(behind, "post")} behind pace` : "On pace for the month"}</text>
        <text x={206} y={y + 21}>{toPlan ? `${toPlan} still to plan` : "Fully planned"}</text>
      </svg>
    </Chart>
  );
}

function DeadlineChart({ open }) {
  const w = useWork();
  const t0 = today0(), ws = weekStart(t0);
  const cols = [{ key: "overdue", label: "Overdue", items: open.filter((t) => { const d = parseISO(t.deadline); return d && d < t0; }) }];
  for (let i = 0; i < 6; i++) { const a = addDaysD(ws, i * 7), b = addDaysD(a, 7); cols.push({ key: "w" + i, label: i === 0 ? "This wk" : fmtShort(isoDate(a)), start: a, items: open.filter((t) => { const d = parseISO(t.deadline); return d && d >= t0 && d >= a && d < b; }) }); }
  const noDl = open.filter((t) => !parseISO(t.deadline)).length;
  const counts = cols.map((c) => c.items.length);
  const sub = noDl ? `${noDl} open without a deadline` : "Open tickets, next six weeks";
  if (!counts.some(Boolean)) return <Chart title="Deadlines ahead" sub={sub}><p className="muted">Nothing due in the next six weeks.</p></Chart>;
  const max = Math.max(...counts), W = 400, H = 200, L = 26, Rr = 4, T = 20, B = 28, pw = W - L - Rr, ph = H - T - B, base = T + ph;
  const cw = pw / cols.length, bw = Math.min(26, cw * 0.55);
  return (
    <Chart title="Deadlines ahead" sub={sub} legend={<Legend items={[["Client deliverable", "var(--ink)"], ["Internal", "var(--muted)"], ["Overdue", "var(--p1)"]]} />}>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <YTicks max={max} L={L} R={W - Rr} base={base} ph={ph} />
        {cols.map((c, i) => {
          const n = c.items.length, client = c.items.filter((t) => t.kind === "Client deliverable").length, internal = n - client;
          const x = L + i * cw + (cw - bw) / 2, hC = (client / max) * ph, hI = (internal / max) * ph;
          const tip = c.key === "overdue" ? `${n} overdue ${plural(n, "ticket")}` : `${i === 1 ? "This week" : "Week of " + c.label}: ${n} due (${client} client, ${internal} internal)`;
          const click = c.key === "overdue" ? () => w.go({ view: "tickets", filter: { ...DEF_TF, due: "overdue" } }) : () => w.go({ view: "schedule" });
          return (
            <g key={c.key} className="hit clickable" onClick={click} role="button" tabIndex={0} aria-label={tip}><title>{tip}</title>
              <rect className="hl" x={L + i * cw + 2} y={T - 16} width={cw - 4} height={ph + B + 14} fill="transparent" />
              {c.key === "overdue" ? (n > 0 && <rect x={x} y={base - hC - hI} width={bw} height={hC + hI} fill="var(--p1)" />) : <>
                {internal > 0 && <rect x={x} y={base - hI} width={bw} height={hI} fill="var(--muted)" />}
                {client > 0 && <rect x={x} y={base - hI - hC} width={bw} height={hC} fill="var(--ink)" />}</>}
              {n > 0 && <text className={c.key === "overdue" ? "val bad" : "val"} x={x + bw / 2} y={base - hC - hI - 6} textAnchor="middle">{n}</text>}
              <text className={c.key === "overdue" && n ? "bad" : ""} x={x + bw / 2} y={H - 7} textAnchor="middle">{c.label}</text>
            </g>);
        })}
      </svg>
    </Chart>
  );
}

function ProjectLoad({ open }) {
  const w = useWork();
  const ids = [...new Set(open.map((t) => t.projectId))].filter((id) => w.projectById[id]);
  const rows = ids.map((id) => ({ id, p: w.projectById[id], c: prioCounts(open.filter((t) => t.projectId === id)) })).sort((a, b) => prTotal(b.c) - prTotal(a.c) || b.c.P1 - a.c.P1);
  const sub = rows.length > 8 ? `Top 8 of ${rows.length} projects` : `${open.length} open ${plural(open.length, "ticket")}`;
  if (!rows.length) return <Chart title="Open tickets by project" sub={sub}><p className="muted">No open tickets.</p></Chart>;
  return <Chart title="Open tickets by project" sub={sub} legend={<PrLegend />}><StackedBars rows={rows.slice(0, 8).map((r) => ({ label: r.p.name, dot: projColor(r.p), parts: prParts(r.c), tip: prTip(r.p.name, r.c), onClick: () => w.go({ view: "project", id: r.id, tab: "tickets" }) }))} /></Chart>;
}

function TeamLoad({ open }) {
  const w = useWork();
  const rows = w.data.members.map((m) => ({ email: m.email, name: m.name, c: prioCounts(open.filter((t) => splitList(t.pocs).includes(m.email))) })).filter((r) => prTotal(r.c) > 0).sort((a, b) => prTotal(b.c) - prTotal(a.c) || b.c.P1 - a.c.P1);
  const un = open.filter((t) => !splitList(t.pocs).length);
  const shown = rows.slice(0, un.length ? 7 : 8);
  if (un.length) shown.push({ email: "__none", name: "Unassigned", c: prioCounts(un) });
  const parts = []; if (rows.length) parts.push(`${rows.length} with open work`); if (un.length) parts.push(`${un.length} unassigned`);
  if (!shown.length) return <Chart title="Team load" sub="Open tickets per person"><p className="muted">No open tickets.</p></Chart>;
  return <Chart title="Team load" sub={parts.join(", ")} legend={<PrLegend />}><StackedBars rows={shown.map((r) => ({ label: r.name, parts: prParts(r.c), tip: prTip(r.name, r.c), onClick: () => w.go({ view: "tickets", filter: { ...DEF_TF, person: r.email } }) }))} /></Chart>;
}

const C_RAMP = { Idea: "var(--line)", Scripting: "var(--line)", Shoot: "var(--muted)", Edit: "var(--muted)", "Client review": "var(--muted)", Approved: "var(--ink2)", Scheduled: "var(--ink2)", Delayed: "var(--late2)", Posted: "var(--ink)" };
function ContentPipeline({ content }) {
  const w = useWork();
  const ym = ymNow(), items = content.filter((c) => c.date?.slice(0, 7) === ym);
  const sub = `${items.length} ${plural(items.length, "post")} in ${MONTHS[Number(ym.slice(5)) - 1]}`;
  if (!items.length) return <Chart title="Content pipeline" sub={sub}><p className="muted">No posts on this month's content calendar yet.</p></Chart>;
  return <Chart title="Content pipeline" sub={sub}><StackedBars rowH={23} labelW={100} rows={C_STATUS.map((st) => { const n = items.filter((c) => (c.status || "Idea") === st).length; return { label: st, parts: [{ v: n, fill: C_RAMP[st] }], tip: `${st}: ${n} ${plural(n, "post")}`, onClick: () => w.go({ view: "content", status: st }) }; })} /></Chart>;
}

function Flow({ ts }) {
  const N = 8, ws = weekStart(today0()), end = addDaysD(ws, 7);
  const weeks = []; for (let i = N - 1; i >= 0; i--) weeks.push(addDaysD(ws, -7 * i));
  const idx = (v) => { if (!v) return -1; const d = new Date(v); if (isNaN(d) || d >= end || d < weeks[0]) return -1; for (let i = N - 1; i >= 0; i--) if (d >= weeks[i]) return i; return -1; };
  const opened = new Array(N).fill(0), closed = new Array(N).fill(0);
  for (const t of ts) { const a = idx(t.createdAt); if (a >= 0) opened[a]++; if (t.status === "Done") { const b = idx(t.doneAt); if (b >= 0) closed[b]++; } }
  const so = opened.reduce((a, b) => a + b, 0), sc = closed.reduce((a, b) => a + b, 0);
  const sub = `${sc} closed, ${so} opened in 8 weeks`;
  if (!so && !sc) return <Chart title="Opened vs closed" sub={sub}><p className="muted">Tickets opened and closed each week will chart here.</p></Chart>;
  const max = Math.max(1, ...opened, ...closed), W = 400, H = 190, L = 26, Rr = 12, T = 14, B = 26, pw = W - L - Rr, ph = H - T - B, base = T + ph;
  const X = (i) => L + (i * pw) / (N - 1), Y = (v) => base - (v / max) * ph;
  const pts = (a) => a.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const cl = pts(closed), half = pw / (N - 1) / 2;
  return (
    <Chart title="Opened vs closed" sub={sub} legend={<Legend items={[["Closed", "var(--ink)", "line"], ["Opened", "var(--muted)", "dash"]]} />}>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <YTicks max={max} L={L} R={W - Rr} base={base} ph={ph} />
        <path d={`M${X(0).toFixed(1)},${base} L${cl.join(" L")} L${X(N - 1).toFixed(1)},${base} Z`} fill="var(--ink)" fillOpacity={0.07} />
        <path d={`M${pts(opened).join(" L")}`} fill="none" stroke="var(--muted)" strokeWidth={1.6} strokeDasharray="4 4" />
        <path d={`M${cl.join(" L")}`} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
        {weeks.map((wk, i) => (
          <g key={i} className="hit"><title>{`${i === N - 1 ? "This week" : "Week of " + fmtShort(isoDate(wk))}: ${opened[i]} opened, ${closed[i]} closed`}</title>
            <rect x={X(i) - half} y={T} width={half * 2} height={ph} fill="transparent" />
            <circle cx={X(i)} cy={Y(opened[i])} r={2.5} fill="var(--muted)" /><circle cx={X(i)} cy={Y(closed[i])} r={3.2} fill="var(--ink)" />
            {i % 2 === 1 && <text x={X(i)} y={H - 6} textAnchor={i === N - 1 ? "end" : "middle"}>{i === N - 1 ? "This wk" : fmtShort(isoDate(wk))}</text>}
          </g>))}
      </svg>
    </Chart>
  );
}
