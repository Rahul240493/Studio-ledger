"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { MONTHS, MON, isoDate, parseISO, initials, projColor, fmtShort } from "./workdata";

// App-wide actions for the work views: navigation and the shared editors.
export const WorkCtx = createContext(null);
export const useWork = () => useContext(WorkCtx);

export function Seg({ options, value, onChange, cls = "" }) {
  return (
    <div className={`seg2 ${cls}`} role="group">
      {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o];
        return <button key={v} type="button" data-v={v} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>; })}
    </div>
  );
}

export const Dot = ({ p, size = 10 }) => <span className="pdot" style={{ "--c": projColor(p), width: size, height: size }} aria-hidden="true" />;
export const Pri = ({ v }) => <i className={`pr ${v || "P2"}`} aria-label={v || "P2"} />;

export function Avatar({ m, lg }) {
  const name = m ? m.name : "Unknown";
  return <span className={`av${lg ? " lg" : ""}`} title={name + (m?.title ? ", " + m.title : "")} aria-label={name}>{initials(name)}</span>;
}
export function Avatars({ emails, members, max = 4 }) {
  const list = emails.map((e) => members[e]).filter(Boolean);
  if (!list.length) return <span className="faint">Unassigned</span>;
  return <span className="avs">{list.slice(0, max).map((m) => <Avatar key={m.email} m={m} />)}{list.length > max && <span className="more-av">+{list.length - max}</span>}</span>;
}

// Toggle chips for choosing people (POCs, owners).
export function PeoplePicker({ value, onChange, members }) {
  const sel = new Set(value);
  return (
    <div className="chips">
      {members.map((m) => (
        <button key={m.email} type="button" className="chip person" aria-pressed={sel.has(m.email)} title={m.title}
          onClick={() => { const n = new Set(sel); n.has(m.email) ? n.delete(m.email) : n.add(m.email); onChange([...n]); }}>
          <Avatar m={m} />{m.name}
        </button>
      ))}
      {!members.length && <span className="hint">Add people under Menu → Team access.</span>}
    </div>
  );
}

export function MonthNav({ ym, setYm }) {
  const [y, m] = ym.split("-").map(Number);
  const shift = (d) => setYm(isoDate(new Date(y, m - 1 + d, 1)).slice(0, 7));
  const now = isoDate(new Date()).slice(0, 7);
  return (
    <div className="monthbar">
      <button className="iconbtn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
      <h2 className="month">{MONTHS[m - 1]} {y}</h2>
      <button className="iconbtn" onClick={() => shift(1)} aria-label="Next month">›</button>
      {ym !== now && <button className="btn ghost" onClick={() => setYm(now)}>This month</button>}
    </div>
  );
}

// Month grid on wide screens, agenda list on phones. items: [{key, date, node}]
export function MonthGrid({ ym, items, onAdd, emptyText = "Nothing scheduled this month." }) {
  const [openDay, setOpenDay] = useState(null);
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const tKey = isoDate(new Date());
  const by = useMemo(() => { const o = {}; for (const it of items) if (it.date?.slice(0, 7) === ym) (o[it.date] ||= []).push(it); return o; }, [items, ym]);
  const keys = Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  const withItems = keys.filter((k) => by[k]);
  return (
    <>
      <div className="agenda only-sm">
        {withItems.length ? withItems.map((k) => { const d = parseISO(k); return (
          <div key={k} className={`agenda-day${k === tKey ? " is-today" : ""}`}>
            <div className="agenda-date"><b>{d.getDate()}</b><span>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}</span></div>
            <div className="agenda-items">{by[k].map((it) => <span key={it.key}>{it.node}</span>)}</div>
          </div>); }) : <div className="empty">{emptyText}</div>}
      </div>
      <div className="mgrid only-lg">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={"l" + i} className="mcell out" aria-hidden="true" />)}
        {keys.map((k) => { const its = by[k] || []; return (
          <div key={k} className={`mcell${k === tKey ? " is-today" : ""}${onAdd ? " can-add" : ""}`} onClick={(e) => { if (onAdd && e.target === e.currentTarget) onAdd(k); }}>
            <div className="daynum"><b>{Number(k.slice(8))}</b>{onAdd && <button className="add-day" aria-label={`Add on ${fmtShort(k)}`} onClick={() => onAdd(k)}>+</button>}</div>
            {its.slice(0, 3).map((it) => <span key={it.key}>{it.node}</span>)}
            {its.length > 3 && <button className="more" onClick={() => setOpenDay(k)}>+{its.length - 3} more</button>}
          </div>); })}
        {Array.from({ length: (7 - ((lead + days) % 7)) % 7 }, (_, i) => <div key={"t" + i} className="mcell out" aria-hidden="true" />)}
      </div>
      {openDay && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpenDay(null)}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="row spread"><h2>{fmtShort(openDay)}</h2><button className="btn ghost" onClick={() => setOpenDay(null)}>Close</button></div>
            <div className="col tight">{(by[openDay] || []).map((it) => <span key={it.key}>{it.node}</span>)}</div>
            {onAdd && <div className="row"><button className="btn" onClick={() => { const d = openDay; setOpenDay(null); onAdd(d); }}>Add on this day</button></div>}
          </div>
        </div>
      )}
    </>
  );
}

export const monthLabelOf = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
export { MON };
