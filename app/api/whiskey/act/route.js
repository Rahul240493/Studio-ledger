// Carries out an action Whiskey proposed, after the partner taps Confirm.
import "@/lib/settings";
import { requirePartner, handle } from "@/lib/access";
import { verify, friendlyGoogleError } from "@/lib/whiskey/gaccount";
import { runAction } from "@/lib/whiskey/tools";

export const maxDuration = 30;
export const POST = handle(async (req) => {
  const me = await requirePartner();
  const { ticket } = await req.json();
  const t = verify(ticket);
  if (!t) return Response.json({ error: "This card has expired. Ask Whiskey again." }, { status: 400 });
  if (t.by !== me.email) return Response.json({ error: "Only the partner who asked can confirm this." }, { status: 403 });
  try { return { message: await runAction({ email: me.email, name: me.name }, t.kind, t.payload) }; }
  catch (e) { const f = friendlyGoogleError(e); if (f) return Response.json({ error: f }, { status: 502 }); throw e; }
});
