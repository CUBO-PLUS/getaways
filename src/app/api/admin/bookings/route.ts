import { staffBookingList } from "@/modules/bookings/server/booking-admin";
import { bookingReply, fail, parseBookingListFilters, staff } from "@/modules/bookings/server/booking-admin-http";

export const dynamic = "force-dynamic";
const allowedFilters = new Set(["page", "listingId", "status", "from", "to"]);

export async function GET(request: Request) {
  try {
    const actor = await staff(request);
    if (actor instanceof Response) return actor;
    const params = new URL(request.url).searchParams;
    const values: Record<string, unknown> = {};
    for (const key of params.keys()) {
      if (!allowedFilters.has(key) || params.getAll(key).length !== 1) {
        return bookingReply(400, { error: "Invalid filters" });
      }
      values[key] = params.get(key);
    }
    const filters = parseBookingListFilters(values);
    if (!filters) return bookingReply(400, { error: "Invalid filters" });
    return bookingReply(200, await staffBookingList(actor, filters));
  } catch (error) {
    return fail(error);
  }
}
