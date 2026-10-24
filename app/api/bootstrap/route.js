import { currentUser, handle } from "@/lib/access";
import { readTab } from "@/lib/google";
import { projectFor, personFor } from "@/lib/sanitize";
import { calendarEnabled } from "@/lib/calendar";
import { istToday, addDays } from "@/lib/ist";
import { LATE_AFTER_DEFAULT } from "@/lib/config";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const me = await currentUser();
  const safe = (p) => p.catch((e) => { if (/Unable to parse range/i.test(e.message || "")) return null; throw e; });
  const [projects, schedule, people, daily, ledger, team] = await Promise.all([
    safe(readTab("Projects")), safe(readTab("Schedule")), safe(readTab("People")), safe(readTab("Daily")),
    me.isPartner ? safe(readTab("Ledger")) : Promise.resolve([]),
    me.isPartner ? safe(readTab("Team")) : Promise.resolve([]),
  ]);
  const needsSetup = [projects, schedule, people, daily, ledger, team].some((x) => x === null);
  const today = istToday();
  // Partners see the whole team for the last 62 days; everyone else sees only their own last 30 days.
  const since = addDays(today, me.isPartner ? -62 : -30);
  const dailyRows = (daily || []).filter((d) => d.date >= since && (me.isPartner || d.email.toLowerCase() === me.email));
  return {
    me,
    needsSetup,
    calendar: calendarEnabled(),
    today,
    lateAfter: process.env.LATE_AFTER || LATE_AFTER_DEFAULT,
    daily: dailyRows,
    projects: (projects || []).map((p) => projectFor(p, me.isPartner)),
    schedule: schedule || [],
    people: (people || []).map((p) => personFor(p, me.isPartner)),
    ledger: me.isPartner ? ledger || [] : undefined,
    team: me.isPartner ? team || [] : undefined,
    partners: me.isPartner ? (process.env.PARTNER_EMAILS || "").split(/[,\s]+/).filter(Boolean) : undefined,
    sheetUrl: me.isPartner && process.env.GOOGLE_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit` : undefined,
  };
});
