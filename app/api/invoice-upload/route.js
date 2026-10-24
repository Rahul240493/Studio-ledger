import { put } from "@vercel/blob";
import { requirePartner, handle } from "@/lib/access";

export const maxDuration = 30;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Stores an invoice in private Blob storage. Works with Vercel's store connection (BLOB_STORE_ID)
// or a classic BLOB_READ_WRITE_TOKEN.
export const POST = handle(async (req) => {
  await requirePartner();
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return Response.json({ error: "No file received." }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a photo (JPG/PNG) or a PDF." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return Response.json({ error: "That file is over 4 MB. For PDFs, try a smaller export; photos are shrunk automatically." }, { status: 413 });
  const safe = (file.name || "invoice").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const blob = await put(`invoices/${date}-${safe}`, file, { access: "private", addRandomSuffix: true, contentType: file.type });
  return { pathname: blob.pathname, contentType: file.type };
});
