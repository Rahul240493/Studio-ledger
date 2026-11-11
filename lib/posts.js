// One definition of a content post's delivery, shared by the app, the API and the Claude connector.
//
// A post row has a PLANNED date (`date`) and, once it goes live, a POSTED date (`postedAt`).
// The posted date is independent of the workflow status: a post can be "Delayed" and still have gone live.
// Calendar slots can be "Skipped" (won't happen) or "Moved" (fulfilled by another post that links to it via `linkedTo`).
// Ad-hoc client requests and unplanned posts are "extras": they never count as missed slots.

const DAY = 864e5;
const ymd = (v) => { const s = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };
export const dayDiff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / DAY);
export const todayIST = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);

export const EXTRA_SOURCES = ["Ad-hoc", "Unplanned"];
export const isExtra = (c) => EXTRA_SOURCES.includes(c.source);
// The day it went live ("" if not yet). Old rows marked Posted without a date count as posted on their planned date.
export const postedDay = (c) => ymd(c.postedAt) || (c.status === "Posted" ? ymd(c.date) : "");
export const isPosted = (c) => !!postedDay(c);
export const actualFormat = (c) => c.postedFormat || c.format;
export const isStaticFormat = (f) => f === "Static" || f === "Carousel"; // carousels count as statics for scope

// slot id -> the post that fulfils/replaces it
export function linkIndex(posts) {
  const m = {};
  for (const c of posts) if (c.linkedTo) m[c.linkedTo] = c;
  return m;
}

// Delivery state of one post.
// state: "ontime" | "late" | "overdue" | "delayed" | "upcoming" | "skipped" | "moved"
// days: days late (posted late) or overdue; due: the date it was due; live: the day it went live (or "")
export function delivery(c, links = {}, byId = {}, today = todayIST()) {
  const slot = c.linkedTo ? byId[c.linkedTo] : null;
  const due = ymd(slot?.date) || ymd(c.date);
  const live = postedDay(c);
  const rep = links[c.id];
  if (rep && rep.id !== c.id) {
    // This slot was fulfilled by another post: judge it by that post.
    const rl = postedDay(rep);
    if (rl) { const d = due ? Math.max(0, dayDiff(due, rl)) : 0; return { state: d > 0 ? "late" : "ontime", days: d, due, live: rl, via: rep }; }
    return { state: "moved", days: 0, due, live: "", via: rep };
  }
  if (live) { const d = due ? Math.max(0, dayDiff(due, live)) : 0; return { state: d > 0 ? "late" : "ontime", days: d, due, live, slot }; }
  if (c.status === "Skipped") return { state: "skipped", days: 0, due, live: "" };
  if (c.status === "Moved") return { state: "moved", days: 0, due, live: "" };
  const over = due ? dayDiff(due, today) : 0;
  if (over > 0) return { state: "overdue", days: over, due, live: "", slot };
  if (c.status === "Delayed") return { state: "delayed", days: 0, due, live: "", slot };
  return { state: "upcoming", days: 0, due, live: "", slot };
}

export const DELIVERY_LABEL = { ontime: "Posted on time", late: "Posted late", overdue: "Overdue, not posted", delayed: "Delayed", upcoming: "Upcoming", skipped: "Skipped", moved: "Moved / replaced" };
export const lateText = (n) => (n === 1 ? "1 day late" : `${n} days late`);

// Per-client tally of calendar slots due up to `today`, plus unplanned extras.
export function clientTally(posts, today = todayIST()) {
  const links = linkIndex(posts), byId = Object.fromEntries(posts.map((c) => [c.id, c]));
  const t = { due: 0, ontime: 0, late: 0, notPosted: 0, skipped: 0, moved: 0, extras: 0, upcoming: 0, lateDays: 0, reasons: {} };
  for (const c of posts) {
    if (isExtra(c)) {
      if (!c.linkedTo && isPosted(c)) t.extras++;
      continue;
    }
    const d = delivery(c, links, byId, today);
    if (!d.due || d.due > today) { if (d.state !== "skipped") t.upcoming++; continue; }
    t.due++;
    if (d.state === "ontime") t.ontime++;
    else if (d.state === "late") { t.late++; t.lateDays += d.days; const r = (d.via || c).delayReason || c.delayReason || "Not given"; t.reasons[r] = (t.reasons[r] || 0) + 1; }
    else if (d.state === "skipped") t.skipped++;
    else if (d.state === "moved") t.moved++;
    else t.notPosted++;
  }
  return t;
}
// Which tally bucket a post falls in (used to open "the late ones", "the extras", ...).
export function bucketOf(c, links, byId, today = todayIST()) {
  if (isExtra(c)) return c.linkedTo ? "replacement" : isPosted(c) ? "extras" : "extra-pending";
  const d = delivery(c, links, byId, today);
  if (!d.due || d.due > today) return "upcoming";
  return { ontime: "ontime", late: "late", skipped: "skipped", moved: "moved" }[d.state] || "notPosted";
}

const ymOf = (s) => String(s || "").slice(0, 7);
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

// Monthly scope tracker for a retainer: delivered (by the month it went live, by the format it went out as),
// remaining this month, and backlog carried over from earlier months.
export function scopeFor(project, posts, ym) {
  const scope = { reels: Number(project.reels) || 0, statics: Number(project.statics) || 0 };
  const mine = posts.filter((c) => c.projectId === project.id);
  const deliveredIn = (m) => {
    const out = { reels: 0, statics: 0, other: 0 };
    for (const c of mine) {
      if (ymOf(postedDay(c)) !== m) continue;
      const f = actualFormat(c);
      if (f === "Reel") out.reels++; else if (isStaticFormat(f)) out.statics++; else out.other++;
    }
    return out;
  };
  const months = mine.map((c) => ymOf(c.date)).concat(mine.map((c) => ymOf(postedDay(c)))).filter(Boolean).sort();
  // Backlog counts from the first month this client has posts (or the project start, if that's later).
  const first = months[0] || ym, ps = ymOf(project.start);
  const firstMonth = ps && ps > first ? ps : first;
  const carry = { reels: 0, statics: 0 };
  for (let m = firstMonth; m < ym; m = nextYm(m)) {
    const d = deliveredIn(m);
    carry.reels = Math.max(0, carry.reels + scope.reels - d.reels);
    carry.statics = Math.max(0, carry.statics + scope.statics - d.statics);
  }
  const d = deliveredIn(ym);
  const row = (k) => ({ scope: scope[k], delivered: d[k], remaining: Math.max(0, scope[k] - d[k]), backlog: carry[k], owed: Math.max(0, scope[k] + carry[k] - d[k]) });
  const planned = mine.filter((c) => ymOf(c.date) === ym && !isExtra(c));
  return {
    reels: row("reels"), statics: row("statics"), other: d.other,
    planned: { reels: planned.filter((c) => c.format === "Reel").length, statics: planned.filter((c) => isStaticFormat(c.format)).length },
    extras: mine.filter((c) => isExtra(c) && ymOf(postedDay(c) || c.date) === ym).length,
    since: firstMonth,
  };
}
