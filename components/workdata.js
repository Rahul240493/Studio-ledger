"use client";
// Shared helpers for the work tracker: projects, tickets, posts, team.
import { PR_RANK, PIPE_ORDER } from "@/lib/config";

export const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseISO(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  return isNaN(x) ? null : x;
}
export function today0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export function addDaysD(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export const daysBetween = (a, b) => Math.round((b - a) / 864e5);

// Post timing for the content calendar:
// "ontime" (green) = posted on or before its date; "late1" (orange) = 1 day late;
// "late2" (red) = 2+ days (over 48 hours) late. Unposted posts count as late once
// their date has passed; a post marked "Delayed" is at least orange.
export const TIMING_LABEL = { ontime: "Posted on time", late1: "1 day late", late2: "Over 48 hours late" };
export function postTiming(c, todayStr = isoDate(new Date())) {
  const due = parseISO(c.date);
  if (!due) return "";
  const grade = (n) => (n <= 0 ? "" : n === 1 ? "late1" : "late2");
  if (c.status === "Posted") {
    const at = parseISO(String(c.postedAt || "").slice(0, 10)) || due;
    return grade(daysBetween(due, at)) || "ontime";
  }
  const late = grade(daysBetween(due, parseISO(todayStr)));
  return c.status === "Delayed" ? late || "late1" : late;
}
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtShort = (s) => { const d = parseISO(s); return d ? `${d.getDate()} ${MON[d.getMonth()]}` : ""; };
export const plural = (n, w) => (n === 1 ? w : w + "s");
export const inMonth = (s, ym) => typeof s === "string" && s.slice(0, 7) === ym;
export const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export function dueInfo(s, done) {
  const d = parseISO(s);
  if (!d) return { text: "No deadline", cls: "none" };
  if (done) return { text: fmtShort(s), cls: "" };
  const n = daysBetween(today0(), d);
  if (n < 0) return { text: n === -1 ? "1 day overdue" : `${-n} days overdue`, cls: "over" };
  if (n === 0) return { text: "Due today", cls: "soon" };
  if (n === 1) return { text: "Tomorrow", cls: "soon" };
  if (n <= 7) return { text: `In ${n} days`, cls: "soon" };
  return { text: fmtShort(s), cls: "" };
}

export const isOpen = (t) => t.status !== "Done";
export const byDeadline = (a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999"));
export function sortTickets(mode) {
  return (a, b) => {
    const o = Number(!isOpen(a)) - Number(!isOpen(b)); if (o) return o;
    const pr = (PR_RANK[a.priority] ?? 1) - (PR_RANK[b.priority] ?? 1);
    const dl = byDeadline(a, b);
    return mode === "priority" ? pr || dl : dl || pr;
  };
}
export const splitList = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
export const projColor = (p) => (p && p.color) || "var(--muted)";
export const pipelineOf = (p) => p.pipeline || "Active";
export const sortProjects = (ps) => [...ps].sort((a, b) => PIPE_ORDER.indexOf(pipelineOf(a)) - PIPE_ORDER.indexOf(pipelineOf(b)) || a.name.localeCompare(b.name));
export function initials(name) { return String(name || "?").trim().split(/\s+/).map((w) => w[0] || "").slice(0, 2).join("").toUpperCase() || "?"; }

export function scopeText(p) {
  const parts = []; const r = Number(p.reels) || 0, st = Number(p.statics) || 0;
  if (r) parts.push(`${r} ${plural(r, "reel")}`);
  if (st) parts.push(`${st} ${plural(st, "static")}`);
  let t = parts.join(", ");
  if (t && p.engagement === "Retainer") t += " a month";
  if (p.otherScope) t = t ? `${t}, ${p.otherScope}` : p.otherScope;
  return t;
}

// Posts planned and posted against a project's scope, for one month (retainers) or in total.
export function output(content, p, ym) {
  const items = content.filter((c) => c.projectId === p.id && (!ym || inMonth(c.date, ym)));
  const isStatic = (c) => c.format === "Static" || c.format === "Carousel";
  const reels = items.filter((c) => c.format === "Reel"), statics = items.filter(isStatic);
  return {
    reels: { planned: reels.length, posted: reels.filter((c) => c.status === "Posted").length, target: Number(p.reels) || 0 },
    statics: { planned: statics.length, posted: statics.filter((c) => c.status === "Posted").length, target: Number(p.statics) || 0 },
  };
}

export const memberMap = (data) => Object.fromEntries((data.members || []).map((m) => [m.email, m]));
export const ymNow = () => isoDate(new Date()).slice(0, 7);

// Standard ticket sets. Retainer cycle dates are relative to the 1st of the month.
export function monthlyTickets(p, ym) {
  const [y, m] = ym.split("-").map(Number);
  const D = new Date(y, m - 1, 1), last = new Date(y, m, 0), mon = MONTHS[m - 1];
  const r = Number(p.reels) || 0, st = Number(p.statics) || 0;
  const at = (n) => isoDate(addDaysD(D, n));
  const out = [
    { title: `${mon} content plan and calendar`, kind: "Internal", priority: "P1", deadline: at(-10) },
    { title: `Client sign-off on ${mon} content plan`, kind: "Client deliverable", priority: "P1", deadline: at(-5) },
  ];
  if (r) out.push({ title: `Shoot for ${mon} reels`, kind: "Internal", priority: "P2", deadline: at(3) });
  if (st) out.push({ title: `Design ${st} ${plural(st, "static")} for ${mon}`, kind: "Internal", priority: "P2", deadline: at(7) });
  if (r) { const a = Math.ceil(r / 2); out.push({ title: `Edit ${a} ${plural(a, "reel")}, batch 1`, kind: "Internal", priority: "P2", deadline: at(9) }); }
  out.push({ title: "Client review, batch 1", kind: "Client deliverable", priority: "P2", deadline: at(12) });
  if (r > 1) { const b = Math.floor(r / 2); out.push({ title: `Edit ${b} ${plural(b, "reel")}, batch 2`, kind: "Internal", priority: "P2", deadline: at(19) }); }
  out.push({ title: "Client review, batch 2", kind: "Client deliverable", priority: "P2", deadline: at(22) });
  out.push({ title: `${mon} performance report`, kind: "Client deliverable", priority: "P3", deadline: isoDate(last) });
  return out;
}
export function relTickets(tpl, start) {
  const D = parseISO(start) || today0();
  return tpl.map(([title, kind, priority, off]) => ({ title, kind, priority, deadline: isoDate(addDaysD(D, off)) }));
}
export function contentSlots(p, ym) {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const r = Number(p.reels) || 0, st = Number(p.statics) || 0;
  const pos = [];
  for (let i = 0; i < r; i++) pos.push({ f: "Reel", x: (i + 0.5) / r });
  for (let j = 0; j < st; j++) pos.push({ f: "Static", x: (j + 0.5) / st + 0.0001 });
  pos.sort((a, b) => a.x - b.x);
  const platform = splitList(p.platforms)[0] || "Instagram";
  return pos.map((o) => ({ format: o.f, date: isoDate(new Date(y, m - 1, Math.min(days, 1 + Math.floor(o.x * days)))), status: "Idea", title: "", platform }));
}
