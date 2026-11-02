import "server-only";

import { db } from "@/infrastructure/prisma/db";
import type { BookingStatus } from "@/modules/bookings/server/booking-store";

/**
 * Sync only AFTER the booking system has authoritatively completed a transition.
 * Do not confirm a referral just because checkout was opened.
 * No attribution means a normal, un-referred booking; that's not an error.
 */
export async function syncReferralStatusForBooking(
  bookingId: number,
  bookingStatus: BookingStatus
): Promise<boolean> {
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) return false;
  if (bookingStatus !== "confirmed" && bookingStatus !== "cancelled") return false;

  const existing = await db.orm.public.ReferralAttribution
    .where({ bookingId })
    .first();
  if (!existing) return false;
  if (existing.status === bookingStatus) return true;

  await db.orm.public.ReferralAttribution
    .where({ bookingId })
    .update({ status: bookingStatus });
  return true;
}
