import { currentUser, handle, uid } from "@/lib/access";
import { appendRows, readTab } from "@/lib/google";
import { cleanEvent } from "@/lib/records";
import { upsertEvent } from "@/lib/calendar";
import { crewNames } from "@/lib/crew";

export const POST = handle(async (req) => {
  const me = await currentUser();
  const ev = { ...cleanEvent(await req.json()), id: uid("S"), createdBy: me.name, createdAt: new Date().toISOString() };
  let warning;
  try { ev.calendarEventId = await upsertEvent(ev, await crewNames(ev.crew)); }
  catch (e) { console.error(e); warning = "Saved, but it couldn't be added to Google Calendar. Check the calendar is shared with the app."; }
  await appendRows("Schedule", [ev]);
  return { ok: true, warning };
});
