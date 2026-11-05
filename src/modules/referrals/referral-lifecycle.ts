import "server-only";

import { db } from "@/infrastructure/prisma/db";
import type { BookingStatus } from "@/modules/bookings/server/booking-store";

/**
 * Sync only AFTER the booking system has authoritatively completed a transition.
 * Do not confirm a referral just because checkout was opened.
 * No attribution means a normal, un-referred booking; that's not an error.
 */
export async function syncReferralStatusForBooking(bookingId: number, _reportedStatus?: BookingStatus): Promise<boolean> {
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) return false;
  const before = await db.orm.public.Booking.where({ id: bookingId }).select("listingId").first();
  if (!before) return false;
  return db.transaction(async (tx) => {
    const listingLocks = await tx.query(db.raw.sql`SELECT id FROM "Listing" WHERE id = ${before.listingId} FOR NO KEY UPDATE`
      .returnsRow({ id: "pg/int4@1" }).build());
    if (listingLocks.length === 0) return false;
    const booking = await tx.orm.public.Booking.where({ id: bookingId }).forUpdate().first();
    if (!booking || booking.listingId !== before.listingId || booking.status === "pending_payment") return false;
    const existing = await tx.orm.public.ReferralAttribution.where({ bookingId }).forUpdate().first();
    if (!existing) return false;
    if (existing.status === booking.status) return true;
    return Boolean(await tx.orm.public.ReferralAttribution.where({ bookingId }).update({ status: booking.status }));
  });
}
