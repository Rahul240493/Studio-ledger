import { currentUser, handle } from "@/lib/access";
import { readTab, updateRow, deleteRow } from "@/lib/google";
import { cleanEvent } from "@/lib/records";
import { upsertEvent, removeEvent } from "@/lib/calendar";
import { crewNames } from "@/lib/crew";

export const PUT = handle(async (req, { params }) => {
  await currentUser();
  const old = (await readTab("Schedule")).find((e) => e.id === params.id);
  if (!old) return Response.json({ error: "That schedule entry no longer exists." }, { status: 404 });
  const ev = { ...old, ...cleanEvent({ ...old, ...(await req.json()) }) };
  let warning;
  try { ev.calendarEventId = await upsertEvent(ev, await crewNames(ev.crew)); }
  catch (e) { console.error(e); warning = "Saved, but Google Calendar couldn't be updated."; }
  await updateRow("Schedule", old.id, ev);
  return { ok: true, warning };
});
export const DELETE = handle(async (req, { params }) => {
  await currentUser();
  const old = (await readTab("Schedule")).find((e) => e.id === params.id);
  if (old) { await removeEvent(old.calendarEventId).catch(console.error); await deleteRow("Schedule", old.id); }
  return { ok: true };
});
