"use client";
import { useState } from "react";
import { GROUPS } from "@/lib/config";
import { api } from "./util";
import { Modal, Field, Select, useToast } from "./ui";
import { useWork, Avatar } from "./workui";
import { DEF_TF } from "./Tickets";
import { isOpen, parseISO, byDeadline, dueInfo, splitList } from "./workdata";

// Who is on the team and what's on their plate.
export function TeamWorkView() {
  const w = useWork();
  const [edit, setEdit] = useState(null);
  const open = w.data.tickets.filter(isOpen);
  const ms = w.data.members;
  const known = new Set(GROUPS);
  const groups = [...GROUPS, "Other"].map((g) => [g, ms.filter((m) => (g === "Other" ? !known.has(m.group) : m.group === g))]).filter((x) => x[1].length);
  const todayRows = Object.fromEntries((w.data.daily || []).filter((d) => d.date === w.data.today).map((d) => [d.email.toLowerCase(), d]));
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Team</h2><p className="hint">{ms.length} people. Select Tickets to see someone's open work.</p></div>
        {w.data.me.isPartner && <button className="btn primary" onClick={() => w.go({ view: "team" })}>Team access</button>}
      </div>
      {groups.map(([g, arr]) => (
        <section key={g} className="col tight">
          <h3 className="group-h">{g} <span className="count">{arr.length}</span></h3>
          <div className="mlist">{arr.map((m) => {
            const mine = open.filter((t) => splitList(t.pocs).includes(m.email));
            const p1 = mine.filter((t) => t.priority === "P1").length;
            const next = mine.filter((t) => parseISO(t.deadline)).sort(byDeadline)[0];
            const day = todayRows[m.email];
            return (
              <div key={m.email} className="mrow">
                <Avatar m={m} lg />
                <div className="m-id"><strong>{m.name}</strong><span>{m.title || (m.partner ? "Partner" : "")}</span></div>
                <span className="m-stat">{mine.length} open</span>
                <span className="m-p1">{p1 ? `${p1} P1` : ""}</span>
                <span className="m-next">{next ? `Next: ${next.title}, ${dueInfo(next.deadline).text.toLowerCase()}` : "Nothing due"}{w.data.me.isPartner && day ? ` · in ${new Date(day.checkIn).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}` : ""}</span>
                <div className="m-actions">
                  <button className="btn" onClick={() => w.go({ view: "tickets", filter: { ...DEF_TF, person: m.email } })}>Tickets</button>
                  {w.data.me.isPartner && <button className="btn ghost" onClick={() => setEdit(m)}>Edit</button>}
                </div>
              </div>);
          })}</div>
        </section>
      ))}
      {edit && <MemberModal m={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MemberModal({ m, onClose }) {
  const w = useWork();
  const toast = useToast();
  const [f, setF] = useState({ name: m.name, title: m.title, group: m.group });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api("/api/team", { method: "PUT", body: { email: m.email, ...f } }); toast("Saved"); onClose(); await w.reload(); } catch (e) { toast(e.message); }
    setBusy(false);
  }
  return (
    <Modal title={`Edit ${m.name}`} onClose={onClose}>
      <div className="grid">
        <Field label="Name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Job title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Editor, DOP, Producer…" /></Field>
        <Field label="Group"><Select value={f.group} options={GROUPS} onChange={(v) => setF({ ...f, group: v })} /></Field>
      </div>
      <div className="hint">{m.email}{m.partner ? " · partner" : ""}</div>
      <div className="row"><button className="btn primary" onClick={save} disabled={busy}>Save</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
