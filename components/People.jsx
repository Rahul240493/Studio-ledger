"use client";
import { useState } from "react";
import { PEOPLE_KINDS, DEPARTMENTS } from "@/lib/config";
import { api, rs, today, fmtDate } from "./util";
import { Modal, Field, Select, Confirm, useToast } from "./ui";

export function PeopleView({ data, reload }) {
  const [kind, setKind] = useState("All");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  let L = data.people.filter((p) => kind === "All" || p.kind === kind);
  if (q) { const s = q.toLowerCase(); L = L.filter((p) => `${p.name} ${p.role} ${p.department} ${p.phone} ${p.email}`.toLowerCase().includes(s)); }
  L.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="row spread"><h2>People</h2><button className="btn primary" onClick={() => setEdit({ kind: "Crew" })}>Add person</button></div>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, phone" />
      <div className="chips">{["All", ...PEOPLE_KINDS].map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}</div>
      <div className="panel flush">
        {L.length ? <div className="list">{L.map((p) => {
          const next = data.schedule.filter((e) => String(e.crew).split(",").includes(p.id) && (e.endDate || e.date) >= today()).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
          return (
            <button key={p.id} className="item" onClick={() => setEdit(p)}>
              <span className="t">{p.name}</span><span className="a small">{data.me.isPartner && p.rate ? rs(p.rate) + (p.rateUnit ? " / " + p.rateUnit : "") : ""}</span>
              <span className="s">{[p.kind, p.role || p.department, p.phone].filter(Boolean).join(" · ")}</span><span className="g">{next ? "Booked " + fmtDate(next.date) : ""}</span>
            </button>);
        })}</div> : <div className="empty">{data.people.length ? "No one matches." : "Add your regular crew, talent and vendors so you can book them on shoot days and print call sheets."}</div>}
      </div>
      {edit && <PersonForm p={edit} data={data} onClose={() => setEdit(null)} reload={reload} />}
    </>
  );
}

function PersonForm({ p, data, onClose, reload }) {
  const toast = useToast();
  const isP = data.me.isPartner;
  const [f, setF] = useState({ name: "", department: "", role: "", phone: "", email: "", rate: "", rateUnit: "day", notes: "", ...p });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const booked = p.id ? data.schedule.filter((e) => String(e.crew).split(",").includes(p.id)).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  async function save() {
    setBusy(true);
    try { if (p.id) await api(`/api/people/${p.id}`, { method: "PUT", body: f }); else await api("/api/people", { method: "POST", body: f }); toast("Saved"); onClose(); await reload(); }
    catch (e) { toast(e.message); }
    setBusy(false);
  }
  async function del() { setBusy(true); try { await api(`/api/people/${p.id}`, { method: "DELETE" }); toast("Removed"); onClose(); await reload(); } catch (e) { toast(e.message); setBusy(false); } }
  return (
    <Modal title={p.id ? p.name : "Add person"} onClose={onClose}>
      <div className="grid">
        <Field label="Name" wide><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Kind"><Select value={f.kind} options={PEOPLE_KINDS} onChange={set("kind")} /></Field>
        <Field label="Department"><Select value={f.department} options={DEPARTMENTS} onChange={set("department")} blank="—" /></Field>
        <Field label="Role"><input value={f.role} onChange={set("role")} placeholder="DOP, Gaffer, Lead actor…" /></Field>
        <Field label="Phone"><input type="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email" wide><input type="email" value={f.email} onChange={set("email")} /></Field>
        {isP && <Field label="Rate (₹) · partners only"><input inputMode="decimal" value={f.rate || ""} onChange={set("rate")} /></Field>}
        {isP && <Field label="Per"><Select value={f.rateUnit} options={["day", "shift", "project", "hour", "month"]} onChange={set("rateUnit")} /></Field>}
        <Field label="Notes" wide><textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      {f.phone && <div className="hint">Call or WhatsApp: <span className="sel">{f.phone}</span></div>}
      <div className="row spread"><button className="btn primary" onClick={save} disabled={busy}>Save</button>{p.id && <button className="btn danger" onClick={() => setConfirm(true)}>Remove</button>}</div>
      {confirm && <Confirm text="Remove this person from the directory? Past schedule entries keep their bookings." action="Remove" onYes={del} onNo={() => setConfirm(false)} />}
      {booked.length > 0 && <><h3>Bookings</h3><div className="hint">{booked.slice(0, 12).map((e) => `${fmtDate(e.date)} · ${e.project || e.title}`).join("  ·  ")}</div></>}
    </Modal>
  );
}
