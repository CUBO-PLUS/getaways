import "server-only";
import { assertSameOrigin, getSession, type Session } from "@/modules/auth/server/auth";
import { ListingAdminError, listingAccessAllowed } from "@/modules/listings/server/listing-admin";

// The same bounded JSON reader and id parser as the bookings panel.
export { body, idParam } from "@/modules/bookings/server/booking-admin-http";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export const listingReply = (status: number, body: object) => Response.json(body, { status, headers });

/** The signed-in staff member, if their role may use this part of the listing admin. */
export async function listingStaff(request: Request, access: "editorial" | "admin", mutation = false): Promise<Session | Response> {
  if (mutation && !assertSameOrigin(request)) return listingReply(403, { error: "Origin not allowed" });
  const actor = await getSession(request);
  if (!actor) return listingReply(401, { error: "Session invalid" });
  if (!listingAccessAllowed(actor.role, access)) return listingReply(403, { error: "Access denied" });
  return actor;
}

export function listingFailure(error: unknown): Response {
  if (error instanceof ListingAdminError) return listingReply(error.status, { error: error.message });
  // No request data in the log: bodies can carry unpublished content.
  console.error("Listing admin request failed");
  return listingReply(500, { error: "Unexpected server error" });
}
