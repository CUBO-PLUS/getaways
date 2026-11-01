import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { getBookingById } from "@/modules/bookings/server/bookings";
import { normalizeReferralCode } from "./referral-rules";

export async function findActiveReferral(input: string) {
  const code = normalizeReferralCode(input);
  if (!code) return null;

  const referral = await db.orm.public.ReferralCode
    .where({ code, active: true })
    .first();

  if (!referral) return null;
  return { id: referral.id, code: referral.code };
}

/** Only called internally after a real pending booking has been created. */
export async function recordReferralForBooking(
  bookingId: number,
  inputCode: string
) {
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return { ok: false, reason: "invalid_booking_id" };
  }

  const code = normalizeReferralCode(inputCode);
  if (!code) return { ok: false, reason: "invalid_referral" };

  const existing = await db.orm.public.ReferralAttribution
    .where({ bookingId })
    .first();

  if (existing) {
    if (existing.referralCode === code) {
      return { ok: true, alreadyRecorded: true, bookingId, code };
    }
    return { ok: false, reason: "already_attributed" };
  }

  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, reason: "booking_not_found" };
  if (booking.status !== "pending_payment") {
    return { ok: false, reason: "booking_not_pending" };
  }

  const referral = await findActiveReferral(code);
  if (!referral) return { ok: false, reason: "invalid_referral" };

  try {
    const attribution = await db.orm.public.ReferralAttribution.create({
      bookingId,
      referralCode: referral.code,
      status: "pending",
    });
    return {
      ok: true,
      alreadyRecorded: false,
      bookingId: attribution.bookingId,
      code: attribution.referralCode,
    };
  } catch (error) {
    // A concurrent request may already have attributed this booking.
    const saved = await db.orm.public.ReferralAttribution
      .where({ bookingId })
      .first();

    if (!saved) throw error;
    if (saved.referralCode !== referral.code) {
      return { ok: false, reason: "already_attributed" };
    }
    return { ok: true, alreadyRecorded: true, bookingId, code: referral.code };
  }
}
