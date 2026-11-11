// Server-side rules applied whenever content posts are saved (app, bulk update, Claude connector).
import { istToday } from "./ist";
import { isPosted } from "./posts";

// Fill in the posted date when someone marks a post Posted without one.
export function postedDefaults(next, old) {
  const t = istToday();
  if (next.status === "Posted" && !next.postedAt) {
    // New rows logged as already posted are usually back-filled: assume they went out on their date.
    next.postedAt = !old ? (next.date < t ? next.date : t) : old.status !== "Posted" ? t : old.postedAt || next.date;
  }
  if (next.linkedTo === next.id) next.linkedTo = "";
  return next;
}

// When a post fulfils/replaces a planned slot, mark that slot "Moved" (unless it went out itself).
// Returns the slot rows that need writing.
export function slotUpdates(saved, allRows) {
  const byId = Object.fromEntries(allRows.map((r) => [r.id, r]));
  const out = [];
  for (const r of saved) {
    if (!r.linkedTo) continue;
    const slot = byId[r.linkedTo];
    if (!slot || slot.projectId !== r.projectId) { r.linkedTo = ""; continue; }
    if (!isPosted(slot) && slot.status !== "Moved") out.push({ ...slot, status: "Moved" });
  }
  return out;
}
