import { saveListingCommercial } from "@/modules/listings/server/listing-admin";
import { body, idParam, listingFailure, listingReply, listingStaff } from "@/modules/listings/server/listing-admin-http";
import { parseCommercialPatch } from "@/modules/listings/listing-admin-fields";

export const dynamic = "force-dynamic";

// Prices, taxes, capacity and booking policies: ADMIN only.
export async function PATCH(request: Request, context: RouteContext<"/api/admin/listings/[id]/commercial">) {
  try {
    const actor = await listingStaff(request, "admin", true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return listingReply(404, { error: "Listing not found" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const patch = parseCommercialPatch(data);
    if (!patch.ok) return listingReply(patch.status, { error: patch.error });
    return listingReply(200, await saveListingCommercial(actor, id, patch.value));
  } catch (error) {
    return listingFailure(error);
  }
}
