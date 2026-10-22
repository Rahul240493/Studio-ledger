import { requirePartner, handle } from "@/lib/access";
import { readTab } from "@/lib/google";
import { queryFilter } from "@/lib/claude";

export const POST = handle(async (req) => {
  await requirePartner();
  const { q } = await req.json();
  if (!q || !String(q).trim()) return Response.json({ error: "Ask a question first." }, { status: 400 });
  const projects = await readTab("Projects").catch(() => []);
  return { filter: await queryFilter({ q: String(q).slice(0, 500), projects }) };
});
