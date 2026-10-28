"use client";
import { useEffect, useState } from "react";
import { api } from "./util";
import { Confirm, useToast } from "./ui";

// "Connect Claude": a private link that lets someone's own Claude work with projects, tickets and the content calendar.
export function ConnectView({ me }) {
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api("/api/connector").then(setSt).catch((e) => toast(e.message)); }, [toast]);
  async function make() {
    setBusy(true); setConfirm(false);
    try { const r = await api("/api/connector", { method: "POST" }); setUrl(r.url); setSt({ connected: true, since: new Date().toISOString() }); }
    catch (e) { toast(e.message); }
    setBusy(false);
  }
  async function revoke() {
    setBusy(true);
    try { await api("/api/connector", { method: "DELETE" }); setUrl(""); setSt({ connected: false }); toast("Link turned off"); } catch (e) { toast(e.message); }
    setBusy(false);
  }
  async function copy() { try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast("Select the link and copy it"); } }
  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Connect Claude</h2>
        <p className="hint">Use your own Claude to add content calendars, assign tickets, update posts and project briefs. It has no access to finances.</p></div></div>
      <div className="card col">
        <h3>What your Claude can do</h3>
        <ul className="plain-list">
          <li>Read a client's content calendar (a sheet, PDF or screenshot) and add the posts to the calendar</li>
          <li>Create tickets and assign them to people, change status, priority and deadlines</li>
          <li>Mark posts as Posted or Delayed, move dates, add links and notes</li>
          <li>Post project updates and edit project briefs (objective, scope, team)</li>
          <li>Read the project list, team and shoot schedule</li>
        </ul>
        <p className="hint">It can't see or change the ledger, budgets, income, expenses or crew rates{me.isPartner ? ", even with your partner account" : ""}.</p>
      </div>
      <div className="card col">
        <h3>Your private link</h3>
        {url ? (
          <>
            <p className="hint">Copy it now. For safety it is shown only once. Don't share it: anyone with it can act as you.</p>
            <div className="row"><input readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0 }} aria-label="Your Claude link" /><button className="btn primary" onClick={copy}>Copy</button></div>
          </>
        ) : st?.connected ? (
          <p className="hint">You have a link from {new Date(st.since).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Lost it? Make a new one; the old one stops working.</p>
        ) : <p className="hint">You haven't made a link yet.</p>}
        <div className="row">
          <button className="btn primary" disabled={busy || !st} onClick={() => (st?.connected ? setConfirm(true) : make())}>{st?.connected ? "Make a new link" : "Make my link"}</button>
          {st?.connected && <button className="btn ghost" disabled={busy} onClick={revoke}>Turn off</button>}
        </div>
      </div>
      <div className="card col">
        <h3>Add it to Claude</h3>
        <ol className="plain-list num">
          <li>Open Claude (claude.ai or the app) and go to <b>Customize → Connectors</b>.</li>
          <li>Click <b>+ Add</b>, then <b>Add custom connector</b>.</li>
          <li>Name it <b>Studio Ledger</b>, paste your link as the URL and continue.</li>
          <li>For authentication choose <b>No sign in</b> (the link itself identifies you), then <b>Add</b>.</li>
          <li>In a chat, turn on Studio Ledger from the connectors menu and ask, e.g. "Add this November content calendar for Wintex" with the sheet attached.</li>
        </ol>
        <p className="hint">On a Claude Team or Enterprise plan, an owner adds custom connectors under Organization settings → Connectors.</p>
      </div>
      {confirm && <Confirm text="Make a new link? Your current link will stop working, and you'll need to update it in Claude." action="Make new link" onYes={make} onNo={() => setConfirm(false)} />}
    </>
  );
}
