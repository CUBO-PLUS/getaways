import { cancelStaffBooking } from "@/modules/bookings/server/booking-admin";
import { body, bookingReply, fail, idParam, staff } from "@/modules/bookings/server/booking-admin-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/admin/bookings/[id]/cancel">) {
  try {
    const actor = await staff(request, true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return bookingReply(400, { error: "Invalid booking" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const keys = Object.keys(data).sort().join(",");
    if (keys !== "confirmed,reason,version" || data.confirmed !== true || typeof data.reason !== "string" || !Number.isSafeInteger(data.version)) {
      return bookingReply(400, { error: "Explicit confirmation required" });
    }
    const saved = await cancelStaffBooking(actor, id, data.version as number, data.reason);
    return saved
      ? bookingReply(200, { version: saved.version, status: saved.status })
      : bookingReply(409, { error: "Booking changed or was already cancelled. Reload to review the latest version." });
  } catch (error) {
    return fail(error);
  }
}
