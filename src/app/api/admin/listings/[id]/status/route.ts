import { changeListingStatus } from "@/modules/listings/server/listing-admin";
import { body, idParam, listingFailure, listingReply, listingStaff } from "@/modules/listings/server/listing-admin-http";
import { parseStatusChange } from "@/modules/listings/listing-admin-fields";

export const dynamic = "force-dynamic";

// Activate, deactivate, archive (confirmed) or restore: ADMIN only.
export async function PATCH(request: Request, context: RouteContext<"/api/admin/listings/[id]/status">) {
  try {
    const actor = await listingStaff(request, "admin", true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return listingReply(404, { error: "Listing not found" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const change = parseStatusChange(data);
    if (!change.ok) return listingReply(change.status, { error: change.error });
    return listingReply(200, await changeListingStatus(actor, id, change.value));
  } catch (error) {
    return listingFailure(error);
  }
}
