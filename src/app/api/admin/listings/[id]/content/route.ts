import { saveListingContent } from "@/modules/listings/server/listing-admin";
import { body, idParam, listingFailure, listingReply, listingStaff } from "@/modules/listings/server/listing-admin-http";
import { parseContentPatch } from "@/modules/listings/listing-admin-fields";

export const dynamic = "force-dynamic";

// Descriptive content (ADMIN and EDITOR). A body with any commercial field is refused whole.
export async function PATCH(request: Request, context: RouteContext<"/api/admin/listings/[id]/content">) {
  try {
    const actor = await listingStaff(request, "editorial", true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return listingReply(404, { error: "Listing not found" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const patch = parseContentPatch(data);
    if (!patch.ok) return listingReply(patch.status, { error: patch.error });
    return listingReply(200, await saveListingContent(actor, id, patch.value));
  } catch (error) {
    return listingFailure(error);
  }
}
