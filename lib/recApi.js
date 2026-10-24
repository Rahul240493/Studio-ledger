import { cleanTicket, cleanContent, cleanUpdate } from "./records";

// The tracker's record types. All signed-in team members can create, edit and delete them.
export const KINDS = {
  tickets: { tab: "Tickets", prefix: "T", clean: cleanTicket },
  content: { tab: "Content", prefix: "C", clean: cleanContent },
  updates: { tab: "Updates", prefix: "U", clean: cleanUpdate },
};
export function kindOf(k) {
  const d = KINDS[k];
  if (!d) { const e = new Error("Unknown record type."); e.status = 404; throw e; }
  return d;
}
