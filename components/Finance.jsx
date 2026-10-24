"use client";
import { useId, useMemo, useState } from "react";
import { SEGMENTS, EXPENSE_CATS, INCOME_CATS, MODES } from "@/lib/config";
import { api, rs, rsx, rsShort, r2, num, ym, today, fmtDate, monthLabel, shiftMonth, segOf } from "./util";
import { Modal, Field, Select, Thinking, Confirm, useToast, useSpeech } from "./ui";

const sums = (list) => { let inc = 0, exp = 0, gi = 0, ge = 0; for (const e of list) { if (e.type === "Income") { inc += e.amount; gi += e.gst; } else { exp += e.amount; ge += e.gst; } } return { inc, exp, gi, ge, net: inc - exp }; };

export function EntryRow({ e, onOpen }) {
  const s = segOf(e.segment);
  return (
    <button className="item" onClick={() => onOpen(e)}>
      <span className="t">{e.description || e.category}</span>
      <span className={`a${e.type === "Income" ? " in" : ""}`}>{e.type === "Income" ? "+" : ""}{rs(e.total)}</span>
      <span className="s"><i className={`seg-dot ${s.cls}`} />{fmtDate(e.date)} · {e.project || "General"} · {e.party || e.category}</span>
      <span className="g">{e.gst ? "GST " + rs(e.gst) : ""}</span>
    </button>
  );
}

/* ---------------- Overview ---------------- */
export function Overview({ data, openEntry, go }) {
  const [month, setMonth] = useState(ym(new Date()));
  const [seg, setSeg] = useState("All");
  const L = data.ledger;
  const list = L.filter((e) => e.date?.slice(0, 7) === month);
  const all = sums(list);
  const exp = list.filter((e) => e.type !== "Income" && (seg === "All" || e.segment === seg));
  const byCat = {};
  exp.forEach((e) => { const c = e.category || "Uncategorised"; byCat[c] ||= { t: 0, seg: {} }; byCat[c].t += e.amount; byCat[c].seg[e.segment] = (byCat[c].seg[e.segment] || 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1].t - a[1].t);
  const max = cats.length ? cats[0][1].t : 1;
  const pending = L.filter((e) => e.type === "Income" && e.status === "Pending").sort((a, b) => (a.date < b.date ? -1 : 1));
  const payable = L.filter((e) => e.type !== "Income" && e.status === "Payable").sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = [...L].sort((a, b) => ((b.loggedAt || "") < (a.loggedAt || "") ? -1 : 1)).slice(0, 6);
  const overBudget = data.projects.filter((p) => p.budget && spentOn(L, p) > p.budget * 0.85);
  const now = ym(new Date());
  return (
    <>
      <div className="monthbar">
        <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <h2 className="month">{monthLabel(month)}</h2>
        <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= now} aria-label="Next month">›</button>
      </div>
      <div className="segs">
        {SEGMENTS.map((s) => { const t = sums(list.filter((e) => e.segment === s.key)); return (
          <div key={s.key} className={`seg ${s.cls}`}>
            <div className="name">{s.key}</div>
            {s.key !== "Office" && <div className="kv"><span className="k">In</span><span className="v">{rsShort(t.inc)}</span></div>}
            <div className="kv"><span className="k">Out</span><span className="v">{rsShort(t.exp)}</span></div>
            {s.key === "Office"
              ? <div className="kv"><span className="k">GST paid</span><span className="v">{rsShort(t.ge)}</span></div>
              : <div className="kv"><span className="k">Net</span><span className="net">{rsShort(t.net)}</span></div>}
          </div>); })}
      </div>
      <div className="totalline"><span>Combined in <b>{rs(all.inc)}</b></span><span>out <b>{rs(all.exp)}</b></span><span>GST paid <b>{rs(all.ge)}</b></span><span>GST collected <b>{rs(all.gi)}</b></span><span>Amounts excl. GST</span></div>

      {overBudget.length > 0 && (
        <div className="panel flush"><div className="phead"><h3>Budgets to watch</h3></div>
          {overBudget.map((p) => { const sp = spentOn(L, p); return (
            <button key={p.id} className="item" onClick={() => go("projects")}>
              <span className="t">{p.name}</span><span className="a">{Math.round((sp / p.budget) * 100)}%</span>
              <span className="s">{rs(sp)} of {rs(p.budget)}</span><span className="g">{sp > p.budget ? <b className="danger-text">Over</b> : ""}</span>
            </button>); })}
        </div>)}

      <div className="panel col">
        <h3>Where the money went</h3>
        <div className="chips">{["All", ...SEGMENTS.map((s) => s.key)].map((s) => <button key={s} className="chip" aria-pressed={seg === s} onClick={() => setSeg(s)}>{s === "All" ? "All" : segOf(s).short}</button>)}</div>
        <div className="bars">
          {cats.length ? cats.map(([c, o]) => (
            <div key={c} className="bar"><span>{c}</span><span className="num">{rs(o.t)}</span>
              <div className="track" style={{ width: Math.max(3, (o.t / max) * 100) + "%" }}>
                {SEGMENTS.map((s) => o.seg[s.key] ? <i key={s.key} className={`fill ${s.cls}`} style={{ flex: o.seg[s.key] }} /> : null)}
              </div></div>))
            : <div className="muted">No expenses logged for {monthLabel(month)}{seg !== "All" ? " in " + seg : ""}.</div>}
        </div>
        {cats.length > 0 && seg === "All" && <div className="legend">{SEGMENTS.map((s) => <span key={s.key}><i className={`seg-dot ${s.cls}`} />{s.short}</span>)}</div>}
      </div>

      <div className="panel flush"><div className="phead"><h3>Clients yet to pay</h3><span className="num muted">{rs(pending.reduce((a, e) => a + e.total, 0))}</span></div>
        {pending.length ? <div className="list">{pending.map((e) => <EntryRow key={e.id} e={e} onOpen={openEntry} />)}</div> : <div className="empty">Nothing pending. Income logged as pending shows here until it's marked received.</div>}</div>
      {payable.length > 0 && <div className="panel flush"><div className="phead"><h3>We still owe</h3><span className="num muted">{rs(payable.reduce((a, e) => a + e.total, 0))}</span></div><div className="list">{payable.map((e) => <EntryRow key={e.id} e={e} onOpen={openEntry} />)}</div></div>}
      <div className="panel flush"><div className="phead"><h3>Latest entries</h3></div>
        {recent.length ? <div className="list">{recent.map((e) => <EntryRow key={e.id} e={e} onOpen={openEntry} />)}</div> : <div className="empty">Nothing logged yet. Tap Log and say something like “Paid 12k to the gaffer for the Araku shoot, Space and Gravity, UPI.”</div>}</div>
    </>
  );
}
export const spentOn = (L, p) => L.filter((e) => e.type !== "Income" && e.project === p.name).reduce((a, e) => a + e.amount, 0);
export const receivedOn = (L, p) => L.filter((e) => e.type === "Income" && e.project === p.name && e.status !== "Pending").reduce((a, e) => a + e.amount, 0);

/* ---------------- Entry editor card ---------------- */
export function blankEntry(x = {}, extra = {}) {
  const type = x.type === "Income" ? "Income" : "Expense";
  const d = { type, date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : today(), segment: SEGMENTS.some((s) => s.key === x.segment) ? x.segment : "",
    project: x.project || "General", category: x.category || "", description: x.description || "", party: x.party || "",
    amount: r2(num(x.amount)), gstRate: num(x.gstRate), gst: r2(num(x.gst)), mode: x.mode || "", status: x.status || (type === "Income" ? "Received" : "Paid"),
    invoiceNo: x.invoiceNo || "", gstin: x.gstin || "", missing: Array.isArray(x.missing) ? x.missing : [], ...extra };
  if (d.gstRate && !d.gst) d.gst = r2((d.amount * d.gstRate) / 100);
  if (d.gst && !d.gstRate && d.amount) d.gstRate = r2((d.gst / d.amount) * 100);
  d.total = r2(d.amount + d.gst);
  return d;
}
export function validate(d) { const m = []; if (!d.segment) m.push("segment"); if (!d.category) m.push("category"); if (!(num(d.amount) > 0)) m.push("amount"); if (!d.date) m.push("date"); return m; }

export function EntryCard({ d, onChange, onRemove, projects }) {
  const s = segOf(d.segment);
  const need = (f) => (d.missing || []).includes(f) || (f === "segment" && !d.segment);
  const set = (patch, field) => {
    const n = { ...d, ...patch, missing: (d.missing || []).filter((x) => x !== field) };
    if (["amount", "gstRate", "gst"].includes(field)) {
      const a = r2(num(n.amount)), rate = num(n.gstRate);
      if (field === "gst") n.gstRate = a ? r2((num(n.gst) / a) * 100) : 0; else n.gst = r2((a * rate) / 100);
      n.total = r2(a + num(n.gst));
    }
    onChange(n);
  };
  const cats = d.type === "Income" ? INCOME_CATS : EXPENSE_CATS;
  const statuses = d.type === "Income" ? ["Received", "Pending"] : ["Paid", "Payable"];
  const projOpts = ["General", ...projects.filter((p) => !d.segment || p.segment === d.segment).map((p) => p.name)];
  const listId = useId();
  const inp = (f, props = {}) => <input value={d[f] ?? ""} onChange={(e) => set({ [f]: e.target.value }, f)} {...props} />;
  return (
    <div className={`card ${s.cls}`}>
      <div className="row spread">
        <div className="typeflip">{["Expense", "Income"].map((t) => <button key={t} aria-pressed={d.type === t} onClick={() => set({ type: t, category: "", status: t === "Income" ? "Received" : "Paid" }, "type")}>{t}</button>)}</div>
        {onRemove && <button className="btn ghost danger" onClick={onRemove}>Remove</button>}
      </div>
      <div>
        <div className="seg-toggle">{SEGMENTS.map((x) => <button key={x.key} aria-pressed={d.segment === x.key} onClick={() => set({ segment: x.key, project: x.key === "Office" ? "General" : d.project }, "segment")}>{x.short}</button>)}</div>
        {!d.segment && <div className="hint danger-text" style={{ marginTop: 6 }}>Pick which company this belongs to.</div>}
      </div>
      <div className="grid">
        <Field label="Description" wide need={need("description")}>{inp("description")}</Field>
        <Field label={d.type === "Income" ? "Received from" : "Paid to"}>{inp("party")}</Field>
        <Field label="Date" need={need("date")}>{inp("date", { type: "date" })}</Field>
        <Field label="Project" need={need("project")}>{inp("project", { list: listId })}<datalist id={listId}>{projOpts.map((p) => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Category" need={need("category")}><Select value={d.category} options={cats} onChange={(v) => set({ category: v }, "category")} /></Field>
        <Field label="Amount excl. GST (₹)" need={need("amount")}>{inp("amount", { inputMode: "decimal" })}</Field>
        <Field label="GST %">{inp("gstRate", { inputMode: "decimal" })}</Field>
        <Field label="GST (₹)">{inp("gst", { inputMode: "decimal" })}</Field>
        <Field label="Mode"><Select value={d.mode} options={MODES} onChange={(v) => set({ mode: v }, "mode")} /></Field>
        <Field label="Status"><Select value={d.status} options={statuses} onChange={(v) => set({ status: v }, "status")} /></Field>
        <Field label="Invoice no.">{inp("invoiceNo")}</Field>
        <Field label="Vendor GSTIN">{inp("gstin")}</Field>
      </div>
      {d.project && d.project !== "General" && !projects.some((p) => p.name === d.project) && <div className="hint">“{d.project}” isn't a project yet. It'll still be saved; add it under Projects to track its budget.</div>}
      <div className="sum"><span>Total {d.type === "Income" ? "received" : "paid"}</span><b>{rsx(d.total)}</b></div>
    </div>
  );
}

/* ---------------- Log ---------------- */
// Phone photos are often 4–10 MB. Shrink them to a clear JPEG under ~1.5 MB before upload.
async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || (file.size < 1.5e6 && file.type === "image/jpeg")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export function LogView({ data, reload }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const speech = useSpeech(setText);

  async function read() {
    if (!text.trim() && !file) { setErr("Say or type what was spent, or attach an invoice."); return; }
    speech.stop(); setErr(""); setBusy(file ? "Uploading the invoice…" : "Reading…");
    try {
      let f = null;
      if (file) {
        const fd = new FormData();
        const ready = await shrinkImage(file);
        fd.append("file", ready, ready.name || file.name);
        const res = await fetch("/api/invoice-upload", { method: "POST", body: fd });
        const up = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(up.error || "Couldn't upload the invoice.");
        f = up;
        setBusy("Reading the invoice…");
      }
      const { entries } = await api("/api/parse", { method: "POST", body: { text, file: f } });
      if (!entries.length) throw new Error("Couldn't find any entries in that. Try adding the amount and who was paid.");
      setDrafts((d) => [...d, ...entries.map((x) => blankEntry(x, { note: text || (file ? "Invoice: " + file.name : ""), file: f?.pathname || "" }))]);
      setText(""); setFile(null);
    } catch (e) { setErr(e.message); }
    setBusy("");
  }
  async function save() {
    const checked = drafts.map((d) => ({ ...d, missing: validate(d) }));
    if (checked.some((d) => d.missing.length)) { setDrafts(checked); toast("Fill the fields marked in red first."); return; }
    setBusy("Saving…");
    try { const r = await api("/api/ledger", { method: "POST", body: { entries: drafts } }); toast(r.saved === 1 ? "Saved to the Sheet" : `${r.saved} entries saved to the Sheet`); setDrafts([]); await reload(); }
    catch (e) { toast(e.message); }
    setBusy("");
  }
  return (
    <>
      <div className="say">
        <h2>What was spent or received?</h2>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Paid 40k remuneration to Ravi for the Araku ad, plus 18% GST, bank transfer. Also crew lunch, 6,400 cash." />
        <div className="hint">{speech.supported ? "Tap Speak and talk naturally. Several items in one go is fine." : "Tap the mic on your keyboard and speak. Several items in one go is fine."}</div>
        {file && <div className="attach"><span className="file">Invoice: {file.name}</span><button className="btn ghost" onClick={() => setFile(null)}>Remove</button></div>}
        <div className="row">
          {speech.supported && <button className={`btn${speech.listening ? " live" : ""}`} onClick={() => (speech.listening ? speech.stop() : speech.start(text))}>{speech.listening ? "● Stop" : "Speak"}</button>}
          <button className="btn primary" onClick={read} disabled={!!busy}>Read it</button>
          <label className="btn" htmlFor="invoiceFile">Attach invoice</label>
          <input type="file" id="invoiceFile" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; if (f.type === "application/pdf" && f.size > 4 * 1024 * 1024) { toast("That PDF is over 4 MB. Try a photo of it instead."); return; } setFile(f); setErr(""); }} />
          <button className="btn ghost" onClick={() => setDrafts((d) => [...d, blankEntry({}, { note: "" })])}>Type it in</button>
        </div>
        {busy && <Thinking>{busy}</Thinking>}
        {err && <div className="banner">{err}</div>}
      </div>
      {drafts.length > 0 && (
        <>
          <div className="row spread"><h3>Check and save · {drafts.length} {drafts.length === 1 ? "entry" : "entries"}</h3><button className="btn ghost" onClick={() => setDrafts([])}>Discard</button></div>
          {drafts.map((d, i) => <EntryCard key={i} d={d} projects={data.projects} onChange={(n) => setDrafts((ds) => ds.map((x, j) => (j === i ? n : x)))} onRemove={() => setDrafts((ds) => ds.filter((_, j) => j !== i))} />)}
          <div className="row"><button className="btn primary" onClick={save} disabled={!!busy}>Save {drafts.length === 1 ? "entry" : "all " + drafts.length} to Sheet</button><button className="btn" onClick={() => setDrafts((d) => [...d, blankEntry({}, { note: "" })])}>Add another</button></div>
        </>
      )}
    </>
  );
}

/* ---------------- Edit an existing entry ---------------- */
export function EntryModal({ entry, data, onClose, reload }) {
  const toast = useToast();
  const [d, setD] = useState(() => blankEntry(entry, { id: entry.id }));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    const m = validate(d); if (m.length) { setD({ ...d, missing: m }); return; }
    setBusy(true);
    try { await api(`/api/ledger/${entry.id}`, { method: "PUT", body: d }); toast("Entry updated"); onClose(); await reload(); } catch (e) { toast(e.message); }
    setBusy(false);
  }
  async function del() { setBusy(true); try { await api(`/api/ledger/${entry.id}`, { method: "DELETE" }); toast("Entry deleted"); onClose(); await reload(); } catch (e) { toast(e.message); setBusy(false); } }
  return (
    <Modal title="Edit entry" onClose={onClose}>
      <EntryCard d={d} onChange={setD} projects={data.projects} />
      {entry.file && <div className="hint">Invoice attached · <a href={`/api/invoice?p=${encodeURIComponent(entry.file)}`} target="_blank" rel="noopener">Open invoice</a></div>}
      {entry.note && <div className="hint">Original note: “{entry.note}”</div>}
      <div className="hint">Logged by {entry.loggedBy || "—"}{entry.loggedAt ? " · " + new Date(entry.loggedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}</div>
      <div className="row spread"><button className="btn primary" onClick={save} disabled={busy}>Save changes</button><button className="btn danger" onClick={() => setConfirm(true)} disabled={busy}>Delete</button></div>
      {confirm && <Confirm text="Delete this entry from the Sheet?" action="Delete entry" onYes={del} onNo={() => setConfirm(false)} />}
    </Modal>
  );
}

/* ---------------- Ask ---------------- */
const ASK_CHIPS = ["AI subscriptions and credits this month", "Food expenses this month by project", "What do clients still owe us?", "Talent payments last month", "Office costs this month", "Income this financial year by segment"];
function applyFilter(L, f) {
  let r = L.slice();
  if (f.type === "Expense") r = r.filter((e) => e.type !== "Income"); else if (f.type === "Income") r = r.filter((e) => e.type === "Income");
  if (f.segments?.length) r = r.filter((e) => f.segments.includes(e.segment));
  if (f.categories?.length) r = r.filter((e) => f.categories.includes(e.category));
  if (f.projects?.length) { const ps = f.projects.map((p) => String(p).toLowerCase()); r = r.filter((e) => ps.includes(String(e.project).toLowerCase())); }
  if (f.dateFrom) r = r.filter((e) => e.date >= f.dateFrom); if (f.dateTo) r = r.filter((e) => e.date <= f.dateTo);
  if (f.status) r = r.filter((e) => e.status === f.status);
  if (f.keywords?.length) r = r.filter((e) => { const h = `${e.description} ${e.party} ${e.project} ${e.note}`.toLowerCase(); return f.keywords.some((k) => h.includes(String(k).toLowerCase())); });
  return r.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
export function AskView({ data }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const speech = useSpeech(setQ);
  async function ask(question) {
    const qq = (question ?? q).trim(); if (!qq) return; setQ(qq); speech.stop();
    setBusy(true); setErr(""); setRes(null);
    try { const { filter } = await api("/api/ask", { method: "POST", body: { q: qq } }); setRes({ filter, rows: applyFilter(data.ledger, filter) }); } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <div className="say"><h2>Ask the books</h2>
        <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How much did AI cost us this month?" />
          {speech.supported && <button type="button" className={`btn${speech.listening ? " live" : ""}`} onClick={() => (speech.listening ? speech.stop() : speech.start(""))}>{speech.listening ? "●" : "Speak"}</button>}
          <button className="btn primary" disabled={busy}>Ask</button>
        </form>
        <div className="hint">Answers come straight from the Sheet, so totals are exact.</div>
        <div className="chips">{ASK_CHIPS.map((c) => <button key={c} className="chip" onClick={() => ask(c)}>{c}</button>)}</div>
      </div>
      {busy && <Thinking>Looking through the ledger…</Thinking>}
      {err && <div className="banner">{err}</div>}
      {res && <AskResult r={res} />}
    </>
  );
}
function AskResult({ r }) {
  const { filter: f, rows: L } = r;
  const tA = L.reduce((a, e) => a + e.amount, 0), tG = L.reduce((a, e) => a + e.gst, 0), tT = L.reduce((a, e) => a + e.total, 0);
  const scope = [f.dateFrom || f.dateTo ? `${f.dateFrom ? fmtDate(f.dateFrom) : "start"} – ${f.dateTo ? fmtDate(f.dateTo) : "today"}` : "All dates", f.segments?.length ? f.segments.join(", ") : "All segments", f.categories?.length ? f.categories.join(", ") : null, f.status || null].filter(Boolean).join(" · ");
  const groups = useMemo(() => {
    if (!f.groupBy || !L.length) return null;
    const key = (e) => (f.groupBy === "month" ? e.date.slice(0, 7) : e[f.groupBy] || "—"); const g = {};
    L.forEach((e) => { const k = key(e); g[k] ||= { n: 0, a: 0, gst: 0, t: 0 }; g[k].n++; g[k].a += e.amount; g[k].gst += e.gst; g[k].t += e.total; });
    return Object.entries(g).sort((a, b) => b[1].t - a[1].t);
  }, [f, L]);
  return (
    <>
      <div className="panel col"><h3>{f.title || "Results"}</h3><div className="hint">{scope}</div>
        <div className="totalline"><span>{L.length} {L.length === 1 ? "entry" : "entries"}</span><span>Amount <b>{rsx(tA)}</b></span><span>GST <b>{rsx(tG)}</b></span><span>Total <b>{rsx(tT)}</b></span></div></div>
      {groups && <div className="tablewrap"><table><thead><tr><th>{f.groupBy}</th><th className="r">Entries</th><th className="r">Amount</th><th className="r">GST</th><th className="r">Total</th></tr></thead>
        <tbody>{groups.map(([k, v]) => <tr key={k}><td>{f.groupBy === "month" ? monthLabel(k) : k}</td><td className="r">{v.n}</td><td className="r">{rs(v.a)}</td><td className="r">{rs(v.gst)}</td><td className="r">{rs(v.t)}</td></tr>)}</tbody></table></div>}
      {L.length ? (
        <div className="tablewrap"><table><thead><tr><th>Date</th><th>Description</th><th>Paid to / from</th><th>Segment</th><th>Project</th><th>Category</th><th className="r">Amount</th><th className="r">GST</th><th className="r">Total</th></tr></thead>
          <tbody>{L.map((e) => <tr key={e.id}><td>{fmtDate(e.date)}</td><td className="wrap">{e.description}</td><td>{e.party}</td><td><i className={`seg-dot ${segOf(e.segment).cls}`} />{segOf(e.segment).short}</td><td>{e.project}</td><td>{e.category}</td><td className="r">{rsx(e.amount)}</td><td className="r">{rsx(e.gst)}</td><td className="r">{rsx(e.total)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={6}>Total</td><td className="r">{rsx(tA)}</td><td className="r">{rsx(tG)}</td><td className="r">{rsx(tT)}</td></tr></tfoot></table></div>
      ) : <div className="panel empty">No entries match. Try a wider date range or different words.</div>}
    </>
  );
}

/* ---------------- Ledger ---------------- */
export function LedgerView({ data, openEntry }) {
  const [seg, setSeg] = useState("All"); const [type, setType] = useState("All"); const [month, setMonth] = useState("All"); const [q, setQ] = useState("");
  const months = [...new Set(data.ledger.map((e) => e.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  let L = data.ledger.filter((e) => (seg === "All" || e.segment === seg) && (type === "All" || (type === "Income" ? e.type === "Income" : e.type !== "Income")) && (month === "All" || e.date?.slice(0, 7) === month));
  if (q) { const s = q.toLowerCase(); L = L.filter((e) => `${e.description} ${e.party} ${e.project} ${e.category}`.toLowerCase().includes(s)); }
  L.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const t = sums(L);
  const sheetUrl = data.sheetUrl;
  return (
    <>
      <div className="row spread"><h2>Ledger</h2>{sheetUrl && <a className="btn ghost" href={sheetUrl} target="_blank" rel="noopener">Open Sheet</a>}</div>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, payee, project" />
      <div className="chips">
        {["All", ...SEGMENTS.map((s) => s.key)].map((s) => <button key={s} className="chip" aria-pressed={seg === s} onClick={() => setSeg(s)}>{s === "All" ? "All" : segOf(s).short}</button>)}
        <span className="gap" />
        {["All", "Expense", "Income"].map((s) => <button key={s} className="chip" aria-pressed={type === s} onClick={() => setType(s)}>{s === "All" ? "In & out" : s}</button>)}
      </div>
      <div className="row"><label className="f inline">Month<select value={month} onChange={(e) => setMonth(e.target.value)}><option value="All">All time</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label></div>
      <div className="totalline"><span>{L.length} entries</span><span>In <b>{rs(t.inc)}</b></span><span>Out <b>{rs(t.exp)}</b></span><span>GST paid <b>{rs(t.ge)}</b></span></div>
      <div className="panel flush">{L.length ? <div className="list">{L.map((e) => <EntryRow key={e.id} e={e} onOpen={openEntry} />)}</div> : <div className="empty">{data.ledger.length ? "No entries match these filters." : "The ledger is empty. Entries you log appear here and in the Sheet."}</div>}</div>
    </>
  );
}
