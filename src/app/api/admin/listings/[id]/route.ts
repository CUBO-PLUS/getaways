import { deleteListing, staffListingDetail } from "@/modules/listings/server/listing-admin";
import { body, idParam, listingFailure, listingReply, listingStaff } from "@/modules/listings/server/listing-admin-http";
import { parseDeletion } from "@/modules/listings/listing-admin-fields";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/admin/listings/[id]">) {
  try {
    const actor = await listingStaff(request, "editorial");
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    const listing = id ? await staffListingDetail(actor, id) : null;
    return listing ? listingReply(200, { listing }) : listingReply(404, { error: "Listing not found" });
  } catch (error) {
    return listingFailure(error);
  }
}

// Physical deletion: only without bookings or other references; otherwise archive.
export async function DELETE(request: Request, context: RouteContext<"/api/admin/listings/[id]">) {
  try {
    const actor = await listingStaff(request, "admin", true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return listingReply(404, { error: "Listing not found" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const input = parseDeletion(data);
    if (!input.ok) return listingReply(input.status, { error: input.error });
    return listingReply(200, await deleteListing(actor, id, input.value.version));
  } catch (error) {
    return listingFailure(error);
  }
}
