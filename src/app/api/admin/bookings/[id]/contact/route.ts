import { saveStaffContact } from "@/modules/bookings/server/booking-admin";
import { body, bookingReply, fail, idParam, staff } from "@/modules/bookings/server/booking-admin-http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/bookings/[id]/contact">) {
  try {
    const actor = await staff(request, true);
    if (actor instanceof Response) return actor;
    const id = idParam((await context.params).id);
    if (!id) return bookingReply(400, { error: "Invalid booking" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const keys = Object.keys(data).sort().join(",");
    if (keys !== "email,name,phone,version" || typeof data.name !== "string" || typeof data.email !== "string" ||
      (data.phone !== null && typeof data.phone !== "string") || !Number.isSafeInteger(data.version)) {
      return bookingReply(400, { error: "Invalid booking data" });
    }
    const saved = await saveStaffContact(actor, id, data.version as number, {
      name: data.name,
      email: data.email,
      phone: data.phone as string | null,
    });
    return saved
      ? bookingReply(200, { version: saved.version })
      : bookingReply(409, { error: "Booking changed. Reload to review the latest version." });
  } catch (error) {
    return fail(error);
  }
}
