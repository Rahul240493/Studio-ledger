import { requirePartner, handle } from "@/lib/access";
export const dynamic = "force-dynamic";
import { get } from "@vercel/blob";

// Streams a private invoice to signed-in partners only.
export const GET = handle(async (req) => {
  await requirePartner();
  const p = new URL(req.url).searchParams.get("p");
  if (!p) return Response.json({ error: "No file given." }, { status: 400 });
  const res = await get(p, { access: "private" });
  if (!res) return Response.json({ error: "Invoice not found." }, { status: 404 });
  return new Response(res.stream, { headers: { "content-type": res.blob?.contentType || "application/octet-stream", "cache-control": "private, no-store" } });
});
