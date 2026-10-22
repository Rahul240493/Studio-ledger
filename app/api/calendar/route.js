import { currentUser, handle } from "@/lib/access";
import { externalEvents } from "@/lib/calendar";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  await currentUser();
  const u = new URL(req.url); const from = u.searchParams.get("from"), to = u.searchParams.get("to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) return Response.json({ error: "Bad range." }, { status: 400 });
  try { return { events: await externalEvents(from, to) }; } catch (e) { console.error(e); return { events: [], warning: "Couldn't read Google Calendar." }; }
});
