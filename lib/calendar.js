import { calendarApi } from "./google";

const CAL = () => process.env.GOOGLE_CALENDAR_ID || "";
export const calendarEnabled = () => !!CAL();
const TZ = "Asia/Kolkata";

function addDays(d, n) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

function body(ev, crewNames) {
  const timed = ev.start && /^\d{1,2}:\d{2}$/.test(ev.start);
  const lastDay = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
  const lines = [
    ev.project && `Project: ${ev.project}`,
    ev.callTime && `Call time: ${ev.callTime}`,
    crewNames.length && `Crew: ${crewNames.join(", ")}`,
    ev.notes,
    process.env.NEXTAUTH_URL && `Open in Studio Ledger: ${process.env.NEXTAUTH_URL}/?tab=schedule`,
  ].filter(Boolean);
  return {
    summary: `${ev.kind ? "[" + ev.kind + "] " : ""}${ev.project ? ev.project + " · " : ""}${ev.title}`,
    location: ev.location || undefined,
    description: lines.join("\n"),
    start: timed ? { dateTime: `${ev.date}T${ev.start.padStart(5, "0")}:00`, timeZone: TZ } : { date: ev.date },
    end: timed
      ? { dateTime: `${lastDay}T${(ev.end && /^\d{1,2}:\d{2}$/.test(ev.end) ? ev.end : ev.start).padStart(5, "0")}:00`, timeZone: TZ }
      : { date: addDays(lastDay, 1) },
    extendedProperties: { private: { ledgerId: ev.id } },
  };
}

export async function upsertEvent(ev, crewNames = []) {
  if (!calendarEnabled()) return "";
  const api = calendarApi();
  const requestBody = body(ev, crewNames);
  if (requestBody.end.dateTime && requestBody.end.dateTime <= requestBody.start.dateTime) {
    // No end time given: make it a one-hour block.
    const [h, m] = ev.start.split(":").map(Number);
    const eh = Math.min(23, h + 1);
    requestBody.end = { dateTime: `${ev.date}T${String(eh).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`, timeZone: TZ };
  }
  if (ev.calendarEventId) {
    try {
      await api.events.update({ calendarId: CAL(), eventId: ev.calendarEventId, requestBody });
      return ev.calendarEventId;
    } catch (e) { if (e.code !== 404 && e.code !== 410) throw e; }
  }
  const res = await api.events.insert({ calendarId: CAL(), requestBody });
  return res.data.id;
}

export async function removeEvent(eventId) {
  if (!calendarEnabled() || !eventId) return;
  try { await calendarApi().events.delete({ calendarId: CAL(), eventId }); }
  catch (e) { if (e.code !== 404 && e.code !== 410) throw e; }
}

// Events added directly in Google Calendar (not created by this app), for the month view.
export async function externalEvents(from, to) {
  if (!calendarEnabled()) return [];
  const res = await calendarApi().events.list({
    calendarId: CAL(), timeMin: new Date(from + "T00:00:00+05:30").toISOString(), timeMax: new Date(addDays(to, 1) + "T00:00:00+05:30").toISOString(),
    singleEvents: true, orderBy: "startTime", maxResults: 250,
  });
  return (res.data.items || [])
    .filter((e) => !e.extendedProperties?.private?.ledgerId && e.status !== "cancelled")
    .map((e) => {
      const sd = e.start?.date || toIST(e.start?.dateTime).d;
      const ed = e.end?.date ? addDays(e.end.date, -1) : toIST(e.end?.dateTime).d;
      return { id: "g_" + e.id, external: true, title: e.summary || "(no title)", kind: "Calendar", date: sd, endDate: ed !== sd ? ed : "",
        start: e.start?.dateTime ? toIST(e.start.dateTime).t : "", end: e.end?.dateTime ? toIST(e.end.dateTime).t : "", location: e.location || "", notes: e.description || "", link: e.htmlLink };
    });
}
function toIST(iso) {
  if (!iso) return { d: "", t: "" };
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (k) => p.find((x) => x.type === k)?.value;
  return { d: `${g("year")}-${g("month")}-${g("day")}`, t: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}
