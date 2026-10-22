import { handleUpload } from "@vercel/blob/client";
import { requirePartner } from "@/lib/access";

// Issues short-lived upload tokens so invoices go straight from the phone to private Blob storage.
export async function POST(request) {
  const body = await request.json();
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        await requirePartner();
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 400 });
  }
}
