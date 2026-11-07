import { saveStaffNotes } from "@/modules/bookings/server/booking-admin";
import { body, bookingReply, fail, idParam, staff } from "@/modules/bookings/server/booking-admin-http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/bookings/[id]/notes">) {
  try {
    const actor = await staff(request, true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return bookingReply(400, { error: "Invalid booking" });
    const data = await body(request);
    if (data instanceof Response) return data;
    if (Object.keys(data).sort().join(",") !== "notes,version" || typeof data.notes !== "string" || !Number.isSafeInteger(data.version)) {
      return bookingReply(400, { error: "Invalid booking data" });
    }
    const saved = await saveStaffNotes(actor, id, data.version as number, data.notes);
    return saved
      ? bookingReply(200, { version: saved.version })
      : bookingReply(409, { error: "Booking changed. Reload to review the latest version." });
  } catch (error) {
    return fail(error);
  }
}
