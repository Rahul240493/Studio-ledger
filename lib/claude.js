import Anthropic from "@anthropic-ai/sdk";
import { SEGMENTS, EXPENSE_CATS, INCOME_CATS, MODES } from "./config";

const MODEL = () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
let _client;
const client = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error("Voice and invoice reading need ANTHROPIC_API_KEY in Vercel."), { status: 500 });
  return (_client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
};

function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function context(projects) {
  const list = projects.length
    ? projects.map((p) => `- ${p.name} | ${p.segment} | ${p.type}${p.client ? " | client: " + p.client : ""}`).join("\n")
    : "(no projects created yet)";
  return `Today is ${todayIST()} (India, amounts in INR).
Segments (pick exactly one per entry):
- "${SEGMENTS[0].key}": ${SEGMENTS[0].work}
- "${SEGMENTS[1].key}": ${SEGMENTS[1].work}
- "${SEGMENTS[2].key}": ${SEGMENTS[2].work}
Expense categories: ${EXPENSE_CATS.join("; ")}
Income categories: ${INCOME_CATS.join("; ")}
Payment modes: ${MODES.join("; ")}
Known projects (name | segment | type):
${list}`;
}

function parseJson(text) {
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = Math.min(...["[", "{"].map((c) => (t.indexOf(c) < 0 ? Infinity : t.indexOf(c))));
  const b = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (a < Infinity && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw Object.assign(new Error("Couldn't understand Claude's reply. Try again."), { status: 502 });
}

async function ask(content, maxTokens = 2500) {
  const msg = await client().messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJson(text);
}

const PARSE_RULES = `Rules:
- One entry per distinct payment or receipt. "Lunch 3,200 and fuel 1,800" is two entries.
- Indian amounts: 40k = 40000, 1.5 lakh / 1.5L = 150000, 2 crore / 2 Cr = 20000000.
- "amount" is the value BEFORE GST. "plus 18% GST" means amount is the stated figure and gstRate 18. "including GST" or "inclusive" means back the GST out (amount = total / (1 + rate/100)). No GST mentioned and no invoice: gstRate 0, gst 0. For invoices read the taxable value, CGST+SGST or IGST, and total exactly as printed.
- type: "Expense" for money going out, "Income" for money coming in (client payments, advances, rights).
- segment: infer from the project when it matches a known project; office/shared costs (rent, internet, electricity, office supplies, staff salaries) are "Office". If you cannot tell, use null.
- project: an exact known project name when it matches (fuzzy-match spoken names), "General" for overheads or office costs, otherwise the project name as spoken.
- category: exactly one from the lists. AI tools, subscriptions and credits (Midjourney, Runway, ChatGPT, Claude, ElevenLabs, Kling, Higgsfield, Adobe etc.) are "AI Credits & Software".
- status: Expense "Paid" unless still due ("Payable"); Income "Received" unless still pending/invoiced ("Pending").
- date: YYYY-MM-DD. Resolve "yesterday", "last Friday" against today. Default today; for an invoice use the invoice date.
- description: short and clean (max ~8 words). party: who was paid or who paid us.
- missing: field names you had to guess or could not find (e.g. ["segment"]).

Reply with only a JSON array, e.g.
[{"type":"Expense","date":"2026-10-22","segment":"Space & Gravity","project":"Araku Coffee Ad","category":"Talent & Crew Remuneration","description":"Lead talent fee","party":"Ravi Kumar","amount":40000,"gstRate":0,"gst":0,"total":40000,"mode":"UPI","status":"Paid","invoiceNo":"","gstin":"","missing":[]}]`;

export async function parseEntries({ text, projects, file }) {
  const intro = `You turn a film production company partner's spoken notes${file ? " and the attached invoice" : ""} into ledger entries.\n${context(projects)}\n\n${PARSE_RULES}\n\n${file ? "The partner's note about this invoice (may be empty):" : "The partner said:"}\n"""${text || ""}"""`;
  const content = [];
  if (file) {
    if (file.mediaType === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } });
    else content.push({ type: "image", source: { type: "base64", media_type: file.mediaType, data: file.base64 } });
  }
  content.push({ type: "text", text: intro });
  const out = await ask(content, 4000);
  const arr = Array.isArray(out) ? out : Array.isArray(out?.entries) ? out.entries : [out];
  return arr.filter((x) => x && typeof x === "object");
}

export async function queryFilter({ q, projects }) {
  const prompt = `A film production partner asks a question about their ledger. Convert it into a filter. Do not answer it.
${context(projects)}

Reply with only one JSON object:
{"title": short heading for the result table,
 "type": "Expense" | "Income" | "Any",
 "segments": [] (empty = all) using exact segment names,
 "categories": [] (empty = all) using exact category names,
 "projects": [] (empty = all) using exact known project names,
 "dateFrom": "YYYY-MM-DD" or null, "dateTo": "YYYY-MM-DD" or null,
 "keywords": [] lowercase words to match in description or payee, only when categories can't express it,
 "status": "Paid" | "Payable" | "Received" | "Pending" | null,
 "groupBy": null | "category" | "project" | "segment" | "party" | "month"}
"This month" means the 1st of the current month to today. "Last month" is the full previous calendar month. "This year" means the Indian financial year (1 April to 31 March) unless they say calendar year. Money "owed to us" means Income with status Pending. What "we owe" means Expense with status Payable.

Question: """${q}"""`;
  return ask(prompt, 800);
}
