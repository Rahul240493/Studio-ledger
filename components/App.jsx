"use client";
import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { api } from "./util";
import { ToastHost, Modal, Thinking } from "./ui";
import { Overview, LogView, AskView, LedgerView, EntryModal } from "./Finance";
import { ProjectsView } from "./Projects";
import { ScheduleView, EventModal } from "./Schedule";
import { PeopleView } from "./People";
import { TeamView } from "./Team";
import { TodayView } from "./Today";

const I = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>,
  ledger: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>,
  log: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  schedule: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  projects: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="14" /><path d="M3 10h18M7 6l2-3M12 6l2-3M17 6l2-3" /></svg>,
  people: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .8 3.1 2.6 3.5 5.2" /></svg>,
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  ask: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>,
};
const PARTNER_TABS = [["overview", "Money"], ["ledger", "Ledger"], ["log", "Log"], ["today", "Today"], ["schedule", "Schedule"], ["projects", "Projects"]];
const EMPLOYEE_TABS = [["today", "Today"], ["schedule", "Schedule"], ["projects", "Projects"], ["people", "People"]];

export default function App() {
  return <ToastHost><Shell /></ToastHost>;
}

function Shell() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(null);
  const [menu, setMenu] = useState(false);
  const [entry, setEntry] = useState(null);
  const [ev, setEv] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setSyncing(true);
    try { const d = await api("/api/bootstrap"); setData(d); setErr(""); }
    catch (e) { setErr(e.message); }
    setSyncing(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || tab) return;
    const want = new URLSearchParams(window.location.search).get("tab");
    const allowed = [...(data.me.isPartner ? PARTNER_TABS : EMPLOYEE_TABS).map((t) => t[0]), "people", "team", "ask"];
    setTab(allowed.includes(want) && (data.me.isPartner || !["team", "ask"].includes(want)) ? want : data.me.isPartner ? "overview" : "today");
  }, [data, tab]);
  useEffect(() => { const f = () => document.visibilityState === "visible" && load(); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [load]);

  const go = (t) => { setTab(t); setMenu(false); window.scrollTo(0, 0); };

  if (!data) return (
    <main className="wrap boot">{err ? <div className="banner"><b>Can't load.</b> {err}<div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={load}>Try again</button><button className="btn ghost" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div></div> : <Thinking>Loading the books…</Thinking>}</main>
  );
  const isP = data.me.isPartner;
  const tabs = isP ? PARTNER_TABS : EMPLOYEE_TABS;
  const finance = ["overview", "ledger", "log", "ask", "team"];
  const view = !isP && finance.includes(tab) ? "today" : tab;

  return (
    <>
      <header className="top"><div className="wrap">
        <div className="brand">Studio Ledger<small>{isP ? "Partner" : "Team"}</small></div>
        <div className="sync">
          <span className="hide-sm">{syncing ? "Syncing…" : ""}</span>
          {isP && <button className="iconbtn" aria-label="Ask the books" onClick={() => go("ask")}>{I.ask}</button>}
          <button className="iconbtn" aria-label="Refresh" onClick={load}>{I.refresh}</button>
          <button className="iconbtn" aria-label="Menu" onClick={() => setMenu(true)}>{I.menu}</button>
        </div>
      </div></header>

      <main className="wrap"><section>
        {err && <div className="banner"><b>Not synced.</b> {err}</div>}
        {data.needsSetup && isP && <div className="banner"><b>Sheet needs setting up.</b> Some tabs are missing. <button className="btn" style={{ marginLeft: 8 }} onClick={async () => { await api("/api/setup", { method: "POST" }).catch((e) => setErr(e.message)); load(); }}>Add tabs</button></div>}
        {view === "overview" && isP && <Overview data={data} openEntry={setEntry} go={go} />}
        {view === "ledger" && isP && <LedgerView data={data} openEntry={setEntry} />}
        {view === "log" && isP && <LogView data={data} reload={load} />}
        {view === "ask" && isP && <AskView data={data} />}
        {view === "today" && <TodayView data={data} reload={load} />}
        {view === "schedule" && <ScheduleView data={data} reload={load} openEvent={setEv} />}
        {view === "projects" && <ProjectsView data={data} reload={load} openEvent={setEv} />}
        {view === "people" && <PeopleView data={data} reload={load} />}
        {view === "team" && isP && <TeamView data={data} reload={load} />}
      </section></main>

      <nav className="tabs" aria-label="Sections"><div className="in" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
        {tabs.map(([k, l]) => (
          <button key={k} className={k === "log" ? "log" : ""} aria-current={view === k ? "page" : undefined} onClick={() => go(k)}>
            {k === "log" ? <span className="k">{I.log}</span> : I[k]}<span>{l}</span>
          </button>))}
      </div></nav>

      {menu && (
        <Modal title="Menu" onClose={() => setMenu(false)}>
          <div className="list bordered">
            {isP && <button className="item" onClick={() => go("ask")}><span className="t">Ask the books</span><span className="a" /><span className="s">Questions about spend and income</span><span className="g" /></button>}
            {isP && <button className="item" onClick={() => go("people")}><span className="t">People</span><span className="a" /><span className="s">Talent, crew and vendors</span><span className="g" /></button>}
            {isP && <button className="item" onClick={() => go("team")}><span className="t">Team access</span><span className="a" /><span className="s">Who can sign in</span><span className="g" /></button>}
            {data.sheetUrl && <a className="item" href={data.sheetUrl} target="_blank" rel="noopener"><span className="t">Open Google Sheet</span><span className="a" /><span className="s">The raw ledger</span><span className="g" /></a>}
          </div>
          <div className="hint">Signed in as {data.me.email}</div>
          <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>
        </Modal>
      )}
      {entry && <EntryModal entry={entry} data={data} onClose={() => setEntry(null)} reload={load} />}
      {ev && <EventModal ev={ev} data={data} onClose={() => setEv(null)} reload={load} />}
    </>
  );
}
