"use client";
import { useState } from "react";
import { api } from "./util";
import { Confirm, useToast } from "./ui";

export function TeamView({ data, reload }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(null);
  async function add(e) {
    e.preventDefault(); setBusy(true);
    try { await api("/api/team", { method: "POST", body: { email, name } }); toast("Added. They can sign in with that Google account now."); setEmail(""); setName(""); await reload(); }
    catch (err) { toast(err.message); }
    setBusy(false);
  }
  async function del(m) {
    try { await api(`/api/team/${encodeURIComponent(m.email)}`, { method: "DELETE" }); toast("Access removed"); setRemove(null); await reload(); } catch (e) { toast(e.message); }
  }
  async function setup() {
    setBusy(true);
    try { const r = await api("/api/setup", { method: "POST" }); toast(r.created?.length ? "Added tabs: " + r.created.join(", ") : "Sheet tabs are up to date"); await reload(); } catch (e) { toast(e.message); }
    setBusy(false);
  }
  return (
    <>
      <h2>Team access</h2>
      <div className="panel col">
        <h3>Partners</h3>
        <div className="hint">Partners see everything, including all finances. This list is set in Vercel (PARTNER_EMAILS) so it can't be changed from inside the app.</div>
        <div className="chips">{data.partners.map((p) => <span key={p} className="chip static">{p}</span>)}</div>
      </div>
      <div className="panel col">
        <h3>Employees</h3>
        <div className="hint">Employees see projects, plans, the schedule and the people directory. They never see amounts, budgets, invoices or rates.</div>
        <form className="grid" onSubmit={add}>
          <label className="f">Google email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></label>
          <label className="f">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="wide"><button className="btn primary" disabled={busy}>Give access</button></div>
        </form>
        {data.team.length ? <div className="list bordered">{data.team.map((m) => (
          <div key={m.email} className="item static"><span className="t">{m.name || m.email}</span><span className="a"><button className="btn ghost danger" onClick={() => setRemove(m)}>Remove</button></span><span className="s">{m.email}</span><span className="g" /></div>
        ))}</div> : <div className="hint">No employees added yet.</div>}
        {remove && <Confirm text={`Remove access for ${remove.email}? They'll be signed out within a minute.`} action="Remove access" onYes={() => del(remove)} onNo={() => setRemove(null)} />}
      </div>
      <div className="panel col">
        <h3>Google Sheet</h3>
        <div className="hint">Adds any missing tabs (Ledger, Projects, Schedule, People, Team) and refreshes their headings. Your data isn't touched.</div>
        <div className="row"><button className="btn" onClick={setup} disabled={busy}>Check Sheet tabs</button>{data.sheetUrl && <a className="btn ghost" href={data.sheetUrl} target="_blank" rel="noopener">Open Sheet</a>}</div>
      </div>
    </>
  );
}
