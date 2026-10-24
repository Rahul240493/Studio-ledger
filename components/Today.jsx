"use client";
import { useMemo, useState } from "react";
import { api, fmtDate, shiftMonth, monthLabel } from "./util";
import { Field, useToast, useSpeech } from "./ui";

const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : "");
const first = (n) => String(n || "").split(/[\s@]/)[0];
function addDays(d, n) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function hoursNow(iso) { return Math.round(((Date.now() - new Date(iso)) / 36e5) * 10) / 10; }

// A textarea with a Speak button, for morning plans and evening reports.
function SpeakBox({ value, onChange, placeholder, rows = 4 }) {
  const speech = useSpeech(onChange);
  return (
    <div className="col tight">
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {speech.supported && <div className="row"><button type="button" className={`btn${speech.listening ? " live" : ""}`} onClick={() => (speech.listening ? speech.stop() : speech.start(value))}>{speech.listening ? "● Stop" : "Speak"}</button></div>}
    </div>
  );
}

export function TodayView({ data, reload }) {
  const toast = useToast();
  const mine = data.daily.find((d) => d.date === data.today && d.email.toLowerCase() === data.me.email);
  const [plan, setPlan] = useState("");
  const [projects, setProjects] = useState([]);
  const [done, setDone] = useState("");
  const [pending, setPending] = useState("");
  const [busy, setBusy] = useState(false);
  const hour = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  async function send(body, ok) {
    setBusy(true);
    try { await api("/api/daily", { method: "POST", body }); toast(ok); await reload(); setPlan(""); setDone(""); setPending(""); setProjects([]); }
    catch (e) { toast(e.message); }
    setBusy(false);
  }
  const toggle = (n) => setProjects((ps) => (ps.includes(n) ? ps.filter((x) => x !== n) : [...ps, n]));
  const active = data.projects.filter((p) => !["Delivered", "Released", "Paid", "Streaming"].includes(p.stage));

  return (
    <>
      <div className="row spread"><h2>{greet}, {first(data.me.name)}</h2><span className="muted small">{fmtDate(data.today, { weekday: "long", day: "numeric", month: "long" })}</span></div>

      {!mine && (
        <div className="card col">
          <h3>Check in</h3>
          <Field label="What will you work on today?"><SpeakBox value={plan} onChange={setPlan} placeholder="e.g. Edit the Araku ad first cut, sync with Harshith on the grade, prep the call sheet for Monday's shoot." /></Field>
          {active.length > 0 && <div className="col tight"><span className="hint">Projects (optional)</span>
            <div className="chips">{active.map((p) => <button key={p.id} className="chip" aria-pressed={projects.includes(p.name)} onClick={() => toggle(p.name)}>{p.name}</button>)}</div></div>}
          <div className="row"><button className="btn primary" disabled={busy || !plan.trim()} onClick={() => send({ action: "in", plan, projects }, "Checked in. Have a good day.")}>Check in now</button>
            <span className="hint">Check-ins after {data.lateAfter} are marked late.</span></div>
        </div>
      )}

      {mine && (
        <div className="card col">
          <div className="row spread"><h3>Today</h3>
            <span className="row tight-row">
              <span className="pill">In {clock(mine.checkIn)}</span>
              {mine.late && <span className="pill bad">Late</span>}
              {mine.checkOut ? <span className="pill">Out {clock(mine.checkOut)} · {mine.hours}h</span> : <span className="pill good">{hoursNow(mine.checkIn)}h so far</span>}
            </span>
          </div>
          <div className="col tight"><span className="eyebrow">Plan</span><p className="prose">{mine.plan}</p>{mine.projects && <span className="hint">{mine.projects}</span>}</div>
          {!mine.checkOut ? (
            <>
              <hr className="rule" />
              <h3>Check out</h3>
              <Field label="What got finished?"><SpeakBox value={done} onChange={setDone} rows={3} placeholder="What you completed today" /></Field>
              <Field label="What's still pending?"><SpeakBox value={pending} onChange={setPending} rows={3} placeholder="What carries over to tomorrow, and why" /></Field>
              <div className="row"><button className="btn primary" disabled={busy || !done.trim()} onClick={() => send({ action: "out", done, pending }, "Checked out. See you tomorrow.")}>Check out now</button></div>
            </>
          ) : (
            <>
              <div className="col tight"><span className="eyebrow">Finished</span><p className="prose">{mine.done}</p></div>
              {mine.pending && <div className="col tight"><span className="eyebrow">Pending</span><p className="prose">{mine.pending}</p></div>}
            </>
          )}
        </div>
      )}

      {data.me.isPartner ? <TeamDay data={data} /> : <MyHistory data={data} />}
    </>
  );
}

function MyHistory({ data }) {
  const past = data.daily.filter((d) => d.date < data.today).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!past.length) return null;
  return (
    <div className="panel flush"><div className="phead"><h3>Your last 30 days</h3><span className="muted small">{past.length} days</span></div>
      <div className="list">{past.map((d) => <DayRow key={d.id} d={d} title={fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })} />)}</div></div>
  );
}

function DayRow({ d, title }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dayrow">
      <button className="item" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="t">{title}</span>
        <span className="a small">{d.checkOut ? `${d.hours}h` : d.checkIn ? "In" : ""}</span>
        <span className="s">{d.checkIn ? `In ${clock(d.checkIn)}${d.checkOut ? " · Out " + clock(d.checkOut) : " · not checked out"}` : ""}{d.late ? " · Late" : ""}</span>
        <span className="g">{d.pending ? "Has pending" : ""}</span>
      </button>
      {open && (
        <div className="dayopen">
          <div><span className="eyebrow">Plan</span><p className="prose">{d.plan || "—"}</p>{d.projects && <span className="hint">{d.projects}</span>}</div>
          <div><span className="eyebrow">Finished</span><p className="prose">{d.done || "—"}</p></div>
          <div><span className="eyebrow">Pending</span><p className="prose">{d.pending || "—"}</p></div>
        </div>
      )}
    </div>
  );
}

function TeamDay({ data }) {
  const [day, setDay] = useState(data.today);
  const [view, setView] = useState("day");
  const rows = data.daily.filter((d) => d.date === day);
  const byEmail = Object.fromEntries(rows.map((r) => [r.email.toLowerCase(), r]));
  const team = data.team || [];
  const missing = team.filter((t) => !byEmail[t.email.toLowerCase()]);
  const isToday = day === data.today;
  const weekend = new Date(day + "T00:00:00").getDay() === 0;
  const counts = { in: rows.length, late: rows.filter((r) => r.late).length, out: rows.filter((r) => r.checkOut).length, missing: missing.length };
  const sorted = [...rows].sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
  return (
    <>
      <div className="row spread">
        <h2>Team</h2>
        <div className="typeflip">{[["day", "Day"], ["month", "Attendance"]].map(([v, l]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>)}</div>
      </div>
      {view === "day" ? (
        <>
          <div className="monthbar">
            <button className="iconbtn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">‹</button>
            <h2 className="month">{isToday ? "Today" : fmtDate(day, { weekday: "short", day: "numeric", month: "short" })}</h2>
            <button className="iconbtn" onClick={() => setDay(addDays(day, 1))} disabled={isToday} aria-label="Next day">›</button>
          </div>
          <div className="segs four">
            <div className="seg"><div className="kv"><span className="k">Checked in</span><span className="v">{counts.in}</span></div></div>
            <div className="seg"><div className="kv"><span className="k">Late</span><span className={`v${counts.late ? " danger-text" : ""}`}>{counts.late}</span></div></div>
            <div className="seg"><div className="kv"><span className="k">Checked out</span><span className="v">{counts.out}</span></div></div>
            <div className="seg"><div className="kv"><span className="k">Not in</span><span className={`v${counts.missing && !weekend ? " danger-text" : ""}`}>{counts.missing}</span></div></div>
          </div>
          {missing.length > 0 && <div className="panel col"><h3>{isToday ? "Not checked in yet" : "Didn't check in"}</h3><div className="chips">{missing.map((t) => <span key={t.email} className="chip static">{t.name || t.email}</span>)}</div></div>}
          <div className="panel flush">
            {sorted.length ? <div className="list">{sorted.map((d) => <DayRow key={d.id} d={d} title={d.name || d.email} />)}</div>
              : <div className="empty">{team.length ? "No one has checked in for this day." : "Add employees under Menu → Team access. Their daily check-ins will show here."}</div>}
          </div>
        </>
      ) : <Attendance data={data} />}
    </>
  );
}

function Attendance({ data }) {
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const people = useMemo(() => {
    const rows = data.daily.filter((d) => d.date.slice(0, 7) === month);
    const names = new Map();
    (data.team || []).forEach((t) => names.set(t.email.toLowerCase(), t.name || t.email));
    rows.forEach((r) => { if (!names.has(r.email.toLowerCase())) names.set(r.email.toLowerCase(), r.name || r.email); });
    return [...names.entries()].map(([email, name]) => {
      const mine = rows.filter((r) => r.email.toLowerCase() === email);
      const withHours = mine.filter((r) => r.hours);
      return { email, name, days: mine.length, late: mine.filter((r) => r.late).length, noOut: mine.filter((r) => !r.checkOut && r.date < data.today).length,
        avg: withHours.length ? Math.round((withHours.reduce((a, r) => a + r.hours, 0) / withHours.length) * 10) / 10 : 0 };
    }).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  }, [data, month]);
  const now = data.today.slice(0, 7);
  return (
    <>
      <div className="monthbar">
        <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <h2 className="month">{monthLabel(month)}</h2>
        <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= now} aria-label="Next month">›</button>
      </div>
      {people.length ? (
        <div className="tablewrap"><table><thead><tr><th>Name</th><th className="r">Days in</th><th className="r">Late</th><th className="r">No check-out</th><th className="r">Avg hours</th></tr></thead>
          <tbody>{people.map((p) => <tr key={p.email}><td>{p.name}</td><td className="r">{p.days}</td><td className={`r${p.late ? " danger-text" : ""}`}>{p.late}</td><td className="r">{p.noOut}</td><td className="r">{p.avg || "—"}</td></tr>)}</tbody></table></div>
      ) : <div className="panel empty">No attendance recorded for {monthLabel(month)}.</div>}
      <div className="hint">Shows the last two months. The full history is in the Daily tab of the Google Sheet.</div>
    </>
  );
}
