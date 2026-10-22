import { requirePartner, handle } from "@/lib/access";
import { ensureTabs } from "@/lib/google";
export const POST = handle(async () => { await requirePartner(); return await ensureTabs(); });
