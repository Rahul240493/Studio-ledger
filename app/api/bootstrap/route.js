import { currentUser, handle } from "@/lib/access";
import { readTabs } from "@/lib/google";
import { projectFor, personFor } from "@/lib/sanitize";
import { calendarEnabled } from "@/lib/calendar";
import { istToday, addDays } from "@/lib/ist";
import { LATE_AFTER_DEFAULT } from "@/lib/config";
import { membersFrom, partnerEmails } from "@/lib/members";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const me = await currentUser();
  const tabs = ["Projects", "Schedule", "People", "Daily", "Team", "Tickets", "Content", "Updates", ...(me.isPartner ? ["Ledger"] : [])];
  const d = await readTabs(tabs);
  const needsSetup = tabs.some((t) => d[t] === null);
  const today = istToday();
  // Partners see the whole team for the last 62 days; everyone else sees only their own last 30 days.
  const since = addDays(today, me.isPartner ? -62 : -30);
  const daily = (d.Daily || []).filter((r) => r.date >= since && (me.isPartner || r.email.toLowerCase() === me.email));
  const pset = new Set(partnerEmails());
  const members = membersFrom(d.Team);
  const meRow = members.find((m) => m.email === me.email);
  if (meRow) me.name = meRow.name;
  return {
    me,
    needsSetup,
    calendar: calendarEnabled(),
    today,
    lateAfter: process.env.LATE_AFTER || LATE_AFTER_DEFAULT,
    daily,
    members,
    projects: (d.Projects || []).map((p) => projectFor(p, me.isPartner)),
    schedule: d.Schedule || [],
    people: (d.People || []).map((p) => personFor(p, me.isPartner)),
    tickets: d.Tickets || [],
    content: d.Content || [],
    updates: d.Updates || [],
    ledger: me.isPartner ? d.Ledger || [] : undefined,
    team: me.isPartner ? (d.Team || []).filter((t) => !pset.has(String(t.email).toLowerCase())).map(({ mcpKey, ...t }) => t) : undefined,
    partners: me.isPartner ? [...pset] : undefined,
    sheetUrl: me.isPartner && process.env.GOOGLE_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit` : undefined,
  };
});
