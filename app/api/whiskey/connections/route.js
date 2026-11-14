// What Whiskey is connected to (no secrets), and a live test of each connection.
import "@/lib/settings";
import { requirePartner, handle } from "@/lib/access";
import { ACCOUNTS, configured, checkAccount } from "@/lib/whiskey/titan";
import { calendarEnabled, studioEvents } from "@/lib/calendar";
import { istToday } from "@/lib/ist";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const summary = () => {
  const on = Object.fromEntries(configured().map((a) => [a.key, a.email]));
  return {
    mailboxes: Object.values(ACCOUNTS).map((a) => ({ key: a.key, name: a.short, email: on[a.key] || "", env: a.env })),
    studioCalendar: calendarEnabled(),
  };
};

export const GET = handle(async () => { await requirePartner(); return summary(); });

export const POST = handle(async () => {
  await requirePartner();
  const s = summary();
  const checks = await Promise.all(s.mailboxes.filter((m) => m.email).map((m) => checkAccount(m.key).catch((e) => ({ mailbox: m.name, email: m.email, mail: e.message }))));
  let studio = "not set up";
  if (s.studioCalendar) { try { const n = (await studioEvents(istToday(), istToday())).length; studio = `OK · ${n} event${n === 1 ? "" : "s"} today`; } catch (e) { studio = e.message; } }
  return { ...s, checks, studio };
});
