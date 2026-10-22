"use client";
import { useEffect, useMemo, useState } from "react";
import { EVENT_KINDS } from "@/lib/config";
import { api, ym, ymd, today, fmtDate, fmtTime, monthLabel, shiftMonth, segOf } from "./util";
import { Modal, Field, Select, Confirm, useToast } from "./ui";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function covers(e, d) { return e.date === d || (e.endDate && e.date <= d && d <= e.endDate); }

export function ScheduleView({ data, reload, openEvent }) {
  const [month, setMonth] = useState(ym(new Date()));
  const [sel, setSel] = useState(today());
  const [ext, setExt] = useState([]);
  const [view, setView] = useState("month");
  const projSeg = useMemo(() => Object.fromEntries(data.projects.map((p) => [p.name, p.segment])), [data.projects]);

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1); const lead = (first.getDay() + 6) % 7;
    const start = new Date(y, m - 1, 1 - lead);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return ymd(d); });
  }, [month]);

  useEffect(() => {
    if (!data.calendar) return;
    let live = true;
    api(`/api/calendar?from=${days[0]}&to=${days[41]}`).then((r) => live && setExt(r.events || [])).catch(() => live && setExt([]));
    return () => { live = false; };
  }, [days, data.calendar]);

  const all = [...data.schedule, ...ext];
  const onDay = (d) => all.filter((e) => covers(e, d)).sort((a, b) => (a.start || a.callTime || "") < (b.start || b.callTime || "") ? -1 : 1);
  const upcoming = all.filter((e) => (e.endDate || e.date) >= today()).sort((a, b) => (a.date + (a.start || "") < b.date + (b.start || "") ? -1 : 1)).slice(0, 40);
  const cls = (e) => (e.external ? "ext" : segOf(projSeg[e.project]).cls || "none");

  return (
    <>
      <div className="row spread">
        <h2>Schedule</h2>
        <div className="row">
          <div className="typeflip">{["month", "list"].map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === "month" ? "Month" : "Upcoming"}</button>)}</div>
          <button className="btn primary" onClick={() => openEvent({ date: sel >= today() ? sel : today(), kind: "Shoot" })}>Add</button>
        </div>
      </div>
      {!data.calendar && <div className="banner">Google Calendar isn't connected yet, so entries are saved to the Sheet only. Add GOOGLE_CALENDAR_ID in Vercel to sync.</div>}
      {view === "month" ? (
        <>
          <div className="monthbar">
            <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
            <h2 className="month">{monthLabel(month)}</h2>
            <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
            <button className="btn ghost" onClick={() => { setMonth(ym(new Date())); setSel(today()); }}>Today</button>
          </div>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
            {days.map((d) => {
              const ev = onDay(d); const out = d.slice(0, 7) !== month;
              return (
                <button key={d} className={`day${out ? " out" : ""}${d === today() ? " today" : ""}${d === sel ? " sel" : ""}`} onClick={() => setSel(d)} aria-label={`${fmtDate(d)}, ${ev.length} items`}>
                  <span className="dn">{Number(d.slice(8))}</span>
                  <span className="evs">{ev.slice(0, 3).map((e) => <i key={e.id} className={cls(e)}><span>{e.title}</span></i>)}{ev.length > 3 && <em>+{ev.length - 3}</em>}</span>
                </button>
              );
            })}
          </div>
          <div className="panel flush">
            <div className="phead"><h3>{fmtDate(sel, { weekday: "long", day: "numeric", month: "long" })}</h3><button className="btn ghost" onClick={() => openEvent({ date: sel, kind: "Shoot" })}>Add</button></div>
            <EventList list={onDay(sel)} cls={cls} openEvent={openEvent} empty="Nothing on this day." />
          </div>
        </>
      ) : (
        <div className="panel flush"><EventList list={upcoming} cls={cls} openEvent={openEvent} withDate empty="Nothing coming up. Tap Add to schedule a shoot, recce or meeting." /></div>
      )}
      <div className="legend">{[["mk", "Madking"], ["sg", "Space & Gravity"], ["ext", "Google Calendar"]].map(([c, l]) => <span key={c}><i className={`seg-dot ${c}`} />{l}</span>)}</div>
    </>
  );
}

function EventList({ list, cls, openEvent, withDate, empty }) {
  if (!list.length) return <div className="empty">{empty}</div>;
  return (
    <div className="list">{list.map((e) => (
      <button key={e.id} className="item" onClick={() => (e.external ? window.open(e.link, "_blank", "noopener") : openEvent(e))}>
        <span className="t"><i className={`seg-dot ${cls(e)}`} />{e.kind && !e.external ? e.kind + " · " : ""}{e.title}</span>
        <span className="a small">{withDate ? fmtDate(e.date) : e.start ? fmtTime(e.start) : "All day"}</span>
        <span className="s">{[e.project, e.callTime && "Call " + fmtTime(e.callTime), withDate && e.start && fmtTime(e.start), e.location, e.external && "From Google Calendar"].filter(Boolean).join(" · ") || "—"}</span><span className="g" />
      </button>))}
    </div>
  );
}

export function EventModal({ ev, data, onClose, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", project: "", kind: "Shoot", date: today(), endDate: "", start: "", end: "", callTime: "", location: "", notes: "", ...ev, crew: ev.crew ? String(ev.crew).split(",").filter(Boolean) : [] });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pick, setPick] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const people = data.people;
  const crew = f.crew.map((id) => people.find((p) => p.id === id)).filter(Boolean);
  async function save() {
    setBusy(true);
    try {
      const r = ev.id ? await api(`/api/schedule/${ev.id}`, { method: "PUT", body: f }) : await api("/api/schedule", { method: "POST", body: f });
      toast(r.warning || (data.calendar ? "Saved and added to Google Calendar" : "Saved")); onClose(); await reload();
    } catch (e) { toast(e.message); }
    setBusy(false);
  }
  async function del() { setBusy(true); try { await api(`/api/schedule/${ev.id}`, { method: "DELETE" }); toast("Removed from the schedule"); onClose(); await reload(); } catch (e) { toast(e.message); setBusy(false); } }
  return (
    <Modal title={ev.id ? "Edit schedule" : "Add to schedule"} onClose={onClose}>
      <div className="grid">
        <Field label="Title" wide><input value={f.title} onChange={set("title")} placeholder="Day 1 · Temple exteriors" /></Field>
        <Field label="Kind"><Select value={f.kind} options={EVENT_KINDS} onChange={set("kind")} /></Field>
        <Field label="Project"><Select value={f.project} options={data.projects.map((p) => p.name)} onChange={set("project")} blank="No project" /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={set("date")} /></Field>
        <Field label="Until (multi-day)"><input type="date" value={f.endDate} min={f.date} onChange={set("endDate")} /></Field>
        <Field label="Call time"><input type="time" value={f.callTime} onChange={set("callTime")} /></Field>
        <Field label="Start"><input type="time" value={f.start} onChange={set("start")} /></Field>
        <Field label="End"><input type="time" value={f.end} onChange={set("end")} /></Field>
        <Field label="Location"><input value={f.location} onChange={set("location")} /></Field>
        <Field label="Notes" wide><textarea rows={3} value={f.notes} onChange={set("notes")} placeholder="Scenes, equipment, parking, contacts" /></Field>
      </div>
      <div className="col">
        <h3>Crew & talent</h3>
        {crew.length ? <div className="chips">{crew.map((p) => <button key={p.id} className="chip" aria-pressed="true" onClick={() => setF({ ...f, crew: f.crew.filter((x) => x !== p.id) })}>{p.name}{p.role ? " · " + p.role : ""} ✕</button>)}</div> : <div className="hint">No one assigned yet.</div>}
        {people.length ? (
          <div className="row nowrap"><select value={pick} onChange={(e) => setPick(e.target.value)} className="grow"><option value="">Add someone from the directory…</option>{people.filter((p) => !f.crew.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? " · " + p.role : p.department ? " · " + p.department : ""}</option>)}</select>
            <button className="btn" disabled={!pick} onClick={() => { setF({ ...f, crew: [...f.crew, pick] }); setPick(""); }}>Add</button></div>
        ) : <div className="hint">Add people under People to assign them here.</div>}
      </div>
      <div className="row spread">
        <div className="row"><button className="btn primary" onClick={save} disabled={busy}>{ev.id ? "Save changes" : "Add to schedule"}</button>
          {ev.id && <a className="btn" href={`/callsheet/${ev.id}`} target="_blank" rel="noopener">Call sheet</a>}</div>
        {ev.id && <button className="btn danger" onClick={() => setConfirm(true)}>Delete</button>}
      </div>
      {confirm && <Confirm text="Remove this from the schedule and Google Calendar?" action="Remove" onYes={del} onNo={() => setConfirm(false)} />}
    </Modal>
  );
}
