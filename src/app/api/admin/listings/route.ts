import { createListing, parseListingListFilters, staffListingList } from "@/modules/listings/server/listing-admin";
import { body, listingFailure, listingReply, listingStaff } from "@/modules/listings/server/listing-admin-http";
import { parseNewListing } from "@/modules/listings/listing-admin-fields";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await listingStaff(request, "editorial");
    if (actor instanceof Response) return actor;
    const filters = parseListingListFilters(Object.fromEntries(new URL(request.url).searchParams));
    if (!filters) return listingReply(400, { error: "Invalid filters" });
    return listingReply(200, { listings: await staffListingList(actor, filters) });
  } catch (error) {
    return listingFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await listingStaff(request, "admin", true);
    if (actor instanceof Response) return actor;
    const data = await body(request);
    if (data instanceof Response) return data;
    const input = parseNewListing(data);
    if (!input.ok) return listingReply(input.status, { error: input.error });
    return listingReply(201, await createListing(actor, input.value));
  } catch (error) {
    return listingFailure(error);
  }
}
