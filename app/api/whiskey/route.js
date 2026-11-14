// Whiskey: the partners' studio voice assistant. Claude with tools over work and money.
import "@/lib/settings";
import { requirePartner, handle } from "@/lib/access";
import { client, MODEL } from "@/lib/claude";
import { readTabs } from "@/lib/google";
import { TOOLS, runTool, prepareAction, CONFIRM_TOOLS } from "@/lib/whiskey/tools";
import { sign } from "@/lib/whiskey/ticket";
import { configured as titanAccounts } from "@/lib/whiskey/titan";
import { istParts } from "@/lib/ist";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CACHED_TOOLS = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t));

function systemPrompt({ me, team, projects }) {
  const now = istParts();
  const mail = titanAccounts().map((a) => `${a.short} mailbox ${a.email}`).join("; ") || "no mailbox set up yet; if asked, say the partners need to add the Titan mailbox details in Vercel";
  return `You are Whiskey, the in-house voice assistant of The Madking Studios and Space & Gravity Studios (Hyderabad). You work for the five partners only, and you are talking with ${me.name} (${me.email}), a partner.
Madking Studios makes films, short films, music videos and OTT content. Space & Gravity makes ad films, brand films, documentaries, digital marketing and AI content. "Office" is the shared office both companies pay for.
Partners: Rahul Chinthala (Head of Production & Operations), Harshith Potluri (CEO), Varun Vadlapatla (Business Head), Praneeth Margam (Head of Design & Strategy), SS Manoj (Managing Partner).
Team: ${team.map((t) => `${t.name}${t.title ? " (" + t.title + ")" : ""}`).join(", ") || "none listed"}.
Live projects: ${projects.filter((p) => !["Delivered", "Lost"].includes(p.pipeline)).map((p) => `${p.name} [${p.segment === "Madking Studios" ? "Madking" : p.segment === "Space & Gravity" ? "S&G" : p.segment}${p.client ? ", client " + p.client : ""}]`).join("; ") || "none"}.
Now: ${now.date} ${now.time} IST. Indian financial year runs 1 April to 31 March.
Company mail (Titan): ${mail}. Calendars: the studio Google Calendar (the dashboard schedule syncs to it) plus each Titan mailbox's calendar. You have no access to Google Drive.

How to behave:
- Your replies are read aloud. Default to 1–3 short spoken sentences. Lead with the answer. Only use a short list or table when they ask for detail or a breakdown; it will be shown on screen.
- Never guess numbers, dates, names or statuses: look them up with tools. If a tool fails, say what failed in one sentence.
- Money: say amounts the Indian way (₹2.4 lakh, ₹45,000, ₹1.2 crore). Ledger amounts are before GST. Mention which company when it matters.
- Things that change the books, send email, add a Titan calendar event or invite people, or delete anything are only proposed: call the propose_* tool, then tell the partner in one sentence what is on the card and to tap Confirm. Never say it's done until they confirm.
- Tickets, content posts, project briefs, updates and the studio schedule you may change directly when asked; then confirm in one sentence what you did.
- If something is ambiguous (which project, which client, which person), ask one short question rather than guessing.
- Speak like a sharp, warm studio producer. No filler, no "As an AI". Reply in the language they use (English, Hindi or Telugu); keep names and numbers clear.
- For "brief me" / "good morning" / "what's on today", call morning_briefing and give the 4–6 things that matter most, most urgent first.`;
}

const asText = (x) => { const s = typeof x === "string" ? x : JSON.stringify(x); return s.length > 24000 ? s.slice(0, 24000) + "…(truncated)" : s; };

export const POST = handle(async (req) => {
  const me = await requirePartner();
  const { messages = [] } = await req.json();
  const history = messages.slice(-20).filter((m) => m && m.text && (m.role === "user" || m.role === "assistant")).map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length) return Response.json({ error: "Say something to Whiskey." }, { status: 400 });

  const d = await readTabs(["Team", "Projects"]);
  const system = [{ type: "text", text: systemPrompt({ me, team: (d.Team || []).filter((t) => t.role !== "Partner"), projects: d.Projects || [] }), cache_control: { type: "ephemeral" } }];
  const user = { email: me.email, name: me.name };
  const convo = [...history];
  const actions = [], used = [];
  let reply = "";
  for (let turn = 0; turn < 10; turn++) {
    const res = await client().messages.create({ model: MODEL(), max_tokens: 1500, system, tools: CACHED_TOOLS, messages: convo });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const calls = res.content.filter((b) => b.type === "tool_use");
    if (!calls.length || res.stop_reason !== "tool_use") { reply = text; break; }
    convo.push({ role: "assistant", content: res.content });
    const results = await Promise.all(calls.map(async (c) => {
      used.push(c.name);
      try {
        if (CONFIRM_TOOLS.has(c.name)) {
          const card = prepareAction(c.name, c.input || {});
          const ticket = sign({ by: me.email, kind: card.kind, payload: card.payload }, 30);
          actions.push({ id: c.id, ticket, kind: card.kind, title: card.title, lines: card.lines, body: card.body, danger: !!card.danger });
          return { type: "tool_result", tool_use_id: c.id, content: "Prepared and shown to the partner as a card with Confirm / Cancel. NOT done yet." };
        }
        const out = await runTool(user, c.name, c.input || {});
        return { type: "tool_result", tool_use_id: c.id, content: asText(out) };
      } catch (e) {
        const msg = e.message || "That didn't work.";
        if (!e.status) console.error("Whiskey tool error", c.name, e);
        return { type: "tool_result", tool_use_id: c.id, content: msg, is_error: true };
      }
    }));
    convo.push({ role: "user", content: results });
    if (text) reply = text;
  }
  return { reply: reply || "Done.", actions, tools: [...new Set(used)] };
});
