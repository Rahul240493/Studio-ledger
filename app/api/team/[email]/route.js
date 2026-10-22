import { requirePartner, handle, clearTeamCache } from "@/lib/access";
import { deleteRow } from "@/lib/google";
export const DELETE = handle(async (req, { params }) => {
  await requirePartner();
  await deleteRow("Team", decodeURIComponent(params.email));
  clearTeamCache();
  return { ok: true };
});
