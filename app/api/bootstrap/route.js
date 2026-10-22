import { currentUser, handle } from "@/lib/access";
import { readTab } from "@/lib/google";
import { projectFor, personFor } from "@/lib/sanitize";
import { calendarEnabled } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const me = await currentUser();
  const safe = (p) => p.catch((e) => { if (/Unable to parse range/i.test(e.message || "")) return null; throw e; });
  const [projects, schedule, people, ledger, team] = await Promise.all([
    safe(readTab("Projects")), safe(readTab("Schedule")), safe(readTab("People")),
    me.isPartner ? safe(readTab("Ledger")) : Promise.resolve([]),
    me.isPartner ? safe(readTab("Team")) : Promise.resolve([]),
  ]);
  const needsSetup = [projects, schedule, people, ledger, team].some((x) => x === null);
  return {
    me,
    needsSetup,
    calendar: calendarEnabled(),
    projects: (projects || []).map((p) => projectFor(p, me.isPartner)),
    schedule: schedule || [],
    people: (people || []).map((p) => personFor(p, me.isPartner)),
    ledger: me.isPartner ? ledger || [] : undefined,
    team: me.isPartner ? team || [] : undefined,
    partners: me.isPartner ? (process.env.PARTNER_EMAILS || "").split(/[,\s]+/).filter(Boolean) : undefined,
    sheetUrl: me.isPartner && process.env.GOOGLE_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit` : undefined,
  };
});
