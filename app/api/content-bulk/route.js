// Bulk update of content posts (posted dates, links, times, delay reasons...) and optional new unplanned posts.
// Everything is written in at most three Google requests, so pasting a month of posted dates doesn't hit the quota.
import { currentUser, handle, uid } from "@/lib/access";
import { readTab, updateRows, appendRows } from "@/lib/google";
import { cleanContent } from "@/lib/records";
import { postedDefaults, slotUpdates } from "@/lib/contentRules";

export const POST = handle(async (req) => {
  const me = await currentUser();
  const { updates = [], adds = [] } = await req.json();
  if (updates.length > 400 || adds.length > 200) return Response.json({ error: "Too many rows at once. Split it into smaller pastes." }, { status: 400 });
  const all = await readTab("Content");
  const byId = Object.fromEntries(all.map((r) => [r.id, r]));
  const changed = [];
  for (const u of updates) {
    const old = byId[u.id];
    if (!old) continue;
    const next = { ...old, ...cleanContent({ ...old, ...u }) };
    changed.push(postedDefaults(next, old));
  }
  const now = Date.now();
  const added = adds.map((x, i) => postedDefaults({ ...cleanContent({ source: "Unplanned", ...x }), id: uid("C") + i, createdBy: me.name, createdAt: new Date(now + i).toISOString() }, null));
  const slots = slotUpdates([...changed, ...added], all).filter((s) => !changed.some((c) => c.id === s.id));
  if (changed.length || slots.length) await updateRows("Content", [...changed, ...slots]);
  if (added.length) await appendRows("Content", added);
  return { ok: true, updated: changed.length, added: added.length };
});
