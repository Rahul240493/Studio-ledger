"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { api } from "./util";
import { ToastHost, Modal, Thinking, useToast } from "./ui";
import { Overview, LogView, AskView, LedgerView, EntryModal } from "./Finance";
import { ProjectsView, ProjectPage } from "./Projects";
import { ScheduleView, EventModal } from "./Schedule";
import { PeopleView } from "./People";
import { TeamView } from "./Team";
import { TodayView } from "./Today";
import { WorkOverview } from "./Work";
import { TicketsView, TicketModal, DeadlinesCalendar } from "./Tickets";
import { ContentView, PostModal } from "./Content";
import { TeamWorkView } from "./TeamWork";
import { WorkCtx, Seg } from "./workui";
import { ConnectView } from "./Connect";

const ic = (d, extra) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}{extra}</svg>;
const I = {
  work: ic(<><circle cx="12" cy="12" r="2.6" /><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-24 12 12)" /></>),
  money: ic(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>),
  ledger: ic(<><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>),
  log: ic(<path d="M12 5v14M5 12h14" strokeWidth="2.2" />),
  schedule: ic(<><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  projects: ic(<><rect x="4" y="4" width="6.5" height="6.5" /><rect x="13.5" y="4" width="6.5" height="6.5" /><rect x="4" y="13.5" width="6.5" height="6.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" /></>),
  tickets: ic(<><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" /><path d="M14 7v10" strokeDasharray="1.6 2" /></>),
  content: ic(<><rect x="3.5" y="5.5" width="17" height="13" /><path d="M10.2 9.2v5.6l4.6-2.8z" /></>),
  teamwork: ic(<><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6" /><circle cx="17" cy="9.8" r="2.4" /><path d="M15.8 14.6c2.2.2 3.9 1.6 4.6 3.9" /></>),
  crew: ic(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>),
  today: ic(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  ask: ic(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  team: ic(<><rect x="5" y="10" width="14" height="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  more: ic(<path d="M4 7h16M4 12h16M4 17h16" />),
  claude: ic(<><path d="M9 7 4 12l5 5M15 7l5 5-5 5" /></>),
  refresh: ic(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>),
};

const WORK_NAV = [["work", "Studio"], ["today", "Today"], ["projects", "Projects"], ["tickets", "Tickets"], ["schedule", "Schedule"], ["content", "Content"], ["teamwork", "Team"], ["crew", "Crew & talent"], ["claude", "Connect Claude"]];
const MONEY_NAV = [["money", "Money"], ["ledger", "Ledger"], ["log", "Log"], ["ask", "Ask the books"], ["team", "Team access"]];
const PARTNER_BOTTOM = [["work", "Studio"], ["tickets", "Tickets"], ["log", "Log"], ["today", "Today"], ["more", "More"]];
const EMPLOYEE_BOTTOM = [["today", "Today"], ["work", "Studio"], ["tickets", "Tickets"], ["content", "Content"], ["more", "More"]];
const MONEY_VIEWS = new Set(MONEY_NAV.map((x) => x[0]));
const ALL_VIEWS = new Set([...WORK_NAV, ...MONEY_NAV].map((x) => x[0]).concat(["project"]));

export default function App() {
  return <ToastHost><Shell /></ToastHost>;
}

function Shell() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [route, setRoute] = useState(null);
  const [menu, setMenu] = useState(false);
  const [entry, setEntry] = useState(null);
  const [ev, setEv] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [post, setPost] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setSyncing(true);
    try { const d = await api("/api/bootstrap"); setData(d); setErr(""); }
    catch (e) { setErr(e.message); }
    setSyncing(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || route) return;
    const q = new URLSearchParams(window.location.search);
    let want = q.get("tab");
    if (want === "overview") want = "money";
    if (want && ALL_VIEWS.has(want) && (data.me.isPartner || !MONEY_VIEWS.has(want))) setRoute({ view: want, id: q.get("id") || undefined });
    else setRoute({ view: data.me.isPartner ? "work" : "today" });
  }, [data, route]);
  useEffect(() => { const f = () => document.visibilityState === "visible" && load(); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [load]);

  const go = useCallback((r, keepScroll) => {
    const next = typeof r === "string" ? { view: r } : r;
    setRoute(next); setMenu(false);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", next.view); if (next.id) u.searchParams.set("id", next.id); else u.searchParams.delete("id"); window.history.replaceState(null, "", u); } catch {}
    if (!keepScroll) window.scrollTo(0, 0);
  }, []);

  const projectById = useMemo(() => Object.fromEntries((data?.projects || []).map((p) => [p.id, p])), [data]);
  const ctx = useMemo(() => data && route && {
    data, route, go, reload: load, projectById,
    ticketFilter: route.filter, contentStatus: route.status,
    openTicket: (t) => setTicket(t || {}), openPost: (c) => setPost(c || {}), openEvent: (e) => setEv(e), openEntry: (e) => setEntry(e),
    patchProject: async (id, patch) => {
      setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch, platforms: Array.isArray(patch.platforms) ? patch.platforms.join(",") : patch.platforms ?? p.platforms, teamPocs: Array.isArray(patch.teamPocs) ? patch.teamPocs.join(",") : patch.teamPocs ?? p.teamPocs } : p)) }));
      try { await api(`/api/projects/${id}`, { method: "PUT", body: patch }); } catch (e) { toast(e.message); }
      load();
    },
  }, [data, route, go, load, projectById, toast]);

  if (!data || !route) return (
    <main className="wrap boot">{err ? <div className="banner"><b>Can't load.</b> {err}<div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={load}>Try again</button><button className="btn ghost" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div></div> : <Thinking>Loading the studio…</Thinking>}</main>
  );
  const isP = data.me.isPartner;
  const view = !isP && MONEY_VIEWS.has(route.view) ? "today" : route.view;
  const current = view === "project" ? "projects" : view;
  const bottom = isP ? PARTNER_BOTTOM : EMPLOYEE_BOTTOM;
  const navBtn = ([k, l]) => <button key={k} className="nav-btn" aria-current={current === k ? "page" : undefined} onClick={() => go({ view: k })}>{I[k]}<span>{l}</span></button>;
  const live = data.projects.filter((p) => ["Active", "Onboarding"].includes(p.pipeline || "Active")).slice(0, 12);

  return (
    <WorkCtx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="logos side-logos" aria-label="The Madking Studios and Space & Gravity"><img src="/logos/mk-logo.png" alt="The Madking Studios" /><span className="logo-sep" aria-hidden="true" /><img src="/logos/sg-logo.png" alt="Space & Gravity" /></div>
          <div className="brand side-brand">Studio Ledger<small>{isP ? "Partner" : "Team"}</small></div>
          <nav className="side-nav" aria-label="Work">{WORK_NAV.map(navBtn)}</nav>
          {isP && <><p className="side-h">Money · partners only</p><nav className="side-nav" aria-label="Money">{MONEY_NAV.map(navBtn)}</nav></>}
          {live.length > 0 && <><p className="side-h">Live projects</p>
            <div className="side-nav">{live.map((p) => <button key={p.id} className="side-proj" aria-current={view === "project" && route.id === p.id ? "page" : undefined} onClick={() => go({ view: "project", id: p.id })}><span className="pdot" style={{ "--c": p.color || "var(--muted)", width: 9, height: 9 }} /><span>{p.name}</span></button>)}</div></>}
          <div className="side-foot"><span className="hint">{data.me.email}</span><button className="btn ghost" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div>
        </aside>

        <div className="main-col">
          <header className="top"><div className="wrap">
            <div className="top-brand row-brand"><div className="logos top-logos" aria-label="The Madking Studios and Space & Gravity"><img src="/logos/mk-logo.png" alt="The Madking Studios" /><span className="logo-sep" aria-hidden="true" /><img src="/logos/sg-logo.png" alt="Space & Gravity" /></div><div className="brand">Studio Ledger<small>{isP ? "Partner" : "Team"}</small></div></div>
            <div className="sync">
              <span className="hide-sm">{syncing ? "Syncing…" : ""}</span>
              {isP && <button className="iconbtn" aria-label="Ask the books" onClick={() => go({ view: "ask" })}>{I.ask}</button>}
              <button className="iconbtn" aria-label="Refresh" onClick={load}>{I.refresh}</button>
              <button className="iconbtn only-sm" aria-label="Menu" onClick={() => setMenu(true)}>{I.more}</button>
            </div>
          </div></header>

          <main className="wrap"><section>
            {err && <div className="banner"><b>Not synced.</b> {err}</div>}
            {data.needsSetup && isP && <div className="banner"><b>Sheet needs setting up.</b> Some tabs are missing. <button className="btn" style={{ marginLeft: 8 }} onClick={async () => { await api("/api/setup", { method: "POST" }).catch((e) => setErr(e.message)); load(); }}>Add tabs</button></div>}
            {view === "work" && <WorkOverview />}
            {view === "today" && <TodayView data={data} reload={load} />}
            {view === "projects" && <ProjectsView />}
            {view === "project" && <ProjectPage key={route.id} />}
            {view === "tickets" && <TicketsView key={JSON.stringify(route.filter || {})} />}
            {view === "schedule" && <ScheduleTabs data={data} reload={load} openEvent={setEv} />}
            {view === "content" && <ContentView key={route.status || ""} />}
            {view === "teamwork" && <TeamWorkView />}
            {view === "crew" && <PeopleView data={data} reload={load} />}
            {view === "claude" && <ConnectView me={data.me} />}
            {view === "money" && isP && <Overview data={data} openEntry={setEntry} go={(t) => go({ view: t === "projects" ? "projects" : t })} />}
            {view === "ledger" && isP && <LedgerView data={data} openEntry={setEntry} />}
            {view === "log" && isP && <LogView data={data} reload={load} />}
            {view === "ask" && isP && <AskView data={data} />}
            {view === "team" && isP && <TeamView data={data} reload={load} />}
          </section></main>
        </div>
      </div>

      <nav className="tabs" aria-label="Sections"><div className="in" style={{ gridTemplateColumns: `repeat(${bottom.length},1fr)` }}>
        {bottom.map(([k, l]) => (
          <button key={k} className={k === "log" ? "log" : ""} aria-current={(k === "more" ? menu : current === k && !menu) ? "page" : undefined} onClick={() => (k === "more" ? setMenu(true) : go({ view: k }))}>
            {k === "log" ? <span className="k">{I.log}</span> : I[k]}<span>{l}</span>
          </button>))}
      </div></nav>

      {menu && (
        <Modal title="Menu" onClose={() => setMenu(false)}>
          <p className="side-h">Work</p>
          <div className="menu-grid">{WORK_NAV.map(navBtn)}</div>
          {isP && <><p className="side-h">Money · partners only</p><div className="menu-grid">{MONEY_NAV.map(navBtn)}</div></>}
          {data.sheetUrl && <a className="btn ghost" href={data.sheetUrl} target="_blank" rel="noopener">Open Google Sheet</a>}
          <div className="hint">Signed in as {data.me.email}</div>
          <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>
        </Modal>
      )}
      {entry && <EntryModal entry={entry} data={data} onClose={() => setEntry(null)} reload={load} />}
      {ev && <EventModal ev={ev} data={data} onClose={() => setEv(null)} reload={load} />}
      {ticket && <TicketModal t={ticket} onClose={() => setTicket(null)} />}
      {post && <PostModal c={post} onClose={() => setPost(null)} />}
    </WorkCtx.Provider>
  );
}

// Schedule page: shoots and meetings (synced to Google Calendar) or ticket deadlines.
function ScheduleTabs(props) {
  const [mode, setMode] = useState("shoots");
  return (
    <>
      <Seg options={[["shoots", "Shoots & meetings"], ["deadlines", "Ticket deadlines"]]} value={mode} onChange={setMode} />
      {mode === "shoots" ? <ScheduleView {...props} /> : <DeadlinesCalendar />}
    </>
  );
}
