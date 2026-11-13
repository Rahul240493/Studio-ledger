import { requirePartner, handle } from "@/lib/access";
import { readTab } from "@/lib/google";
import { parseEntries } from "@/lib/claude";
import { get } from "@vercel/blob";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  await requirePartner();
  const { text, file } = await req.json();
  if (!text && !file) return Response.json({ error: "Say what was spent, or attach an invoice." }, { status: 400 });
  let filePart = null;
  if (file?.pathname) {
    const res = await get(file.pathname, { access: "private" });
    if (!res) return Response.json({ error: "The uploaded invoice couldn't be found." }, { status: 404 });
    const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
    const mediaType = file.contentType === "application/pdf" ? "application/pdf" : ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.contentType) ? file.contentType : "image/jpeg";
    filePart = { mediaType, base64: buf.toString("base64") };
  }
  const [projects, ledger] = await Promise.all([readTab("Projects").catch(() => []), readTab("Ledger").catch(() => [])]);
  // Names already used in the books, so spoken/typed variants map to the same project or client.
  const known = new Set(projects.map((p) => p.name.toLowerCase()));
  const extra = [];
  for (const e of ledger) {
    if (!e.project || e.project === "General" || known.has(e.project.toLowerCase())) continue;
    known.add(e.project.toLowerCase());
    extra.push({ name: e.project, segment: e.segment, type: "from the ledger" });
  }
  const parties = [...new Set(ledger.filter((e) => e.type === "Income" && e.party).map((e) => e.party))];
  const entries = await parseEntries({ text, projects: [...projects, ...extra], parties, file: filePart });
  return { entries };
});
