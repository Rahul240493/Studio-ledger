import { redirect } from "next/navigation";
import { currentUser } from "@/lib/access";
import { readTab } from "@/lib/google";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
const fmtDate = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "");
const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };

export default async function CallSheet({ params }) {
  try { await currentUser(); } catch { redirect("/login"); }
  const [schedule, people, projects] = await Promise.all([readTab("Schedule"), readTab("People"), readTab("Projects").catch(() => [])]);
  const ev = schedule.find((e) => e.id === params.id);
  if (!ev) return <main className="callsheet"><p>That schedule entry no longer exists.</p></main>;
  const proj = projects.find((p) => p.name === ev.project);
  const crew = String(ev.crew || "").split(",").map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const byDept = {};
  crew.forEach((p) => { const d = p.kind === "Talent" ? "Cast" : p.department || p.kind || "Crew"; (byDept[d] ||= []).push(p); });
  const company = proj?.segment || "";
  return (
    <main className="callsheet">
      <div className="cs-actions"><PrintButton /></div>
      <header className="cs-head">
        <div><div className="cs-co">{company || "Studio Ledger"}</div><h1>{ev.project || ev.title}</h1><div className="cs-sub">{ev.kind}{ev.project ? " · " + ev.title : ""}</div></div>
        <div className="cs-call"><span>Crew call</span><b>{fmtTime(ev.callTime) || fmtTime(ev.start) || "TBC"}</b></div>
      </header>
      <section className="cs-grid">
        <div><span>Date</span><b>{fmtDate(ev.date)}{ev.endDate ? " – " + fmtDate(ev.endDate) : ""}</b></div>
        <div><span>Shoot hours</span><b>{ev.start ? fmtTime(ev.start) + (ev.end ? " – " + fmtTime(ev.end) : "") : "TBC"}</b></div>
        <div><span>Location</span><b>{ev.location || "TBC"}</b></div>
        {proj?.client && <div><span>Client</span><b>{proj.client}</b></div>}
      </section>
      {ev.notes && <section className="cs-notes"><h2>Notes</h2><p>{ev.notes}</p></section>}
      <section>
        <h2>Crew &amp; cast ({crew.length})</h2>
        {crew.length ? (
          <table className="cs-table"><thead><tr><th>Department</th><th>Name</th><th>Role</th><th>Phone</th></tr></thead>
            <tbody>{Object.entries(byDept).flatMap(([d, ps]) => ps.map((p, i) => <tr key={p.id}><td>{i === 0 ? d : ""}</td><td>{p.name}</td><td>{p.role}</td><td>{p.phone}</td></tr>))}</tbody></table>
        ) : <p>No one assigned yet.</p>}
      </section>
      <footer className="cs-foot">Generated {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · Studio Ledger</footer>
    </main>
  );
}
