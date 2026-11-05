import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { normalizeReferralCode } from "./referral-rules";

type RecordReferralResult =
  | { ok: true; alreadyRecorded: boolean; bookingId: number; code: string }
  | { ok: false; reason: string; alreadyRecorded?: false };

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
): Promise<RecordReferralResult> {
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return { ok: false, reason: "invalid_booking_id" };
  }

  const code = normalizeReferralCode(inputCode);
  if (!code) return { ok: false, reason: "invalid_referral" };

  const before = await db.orm.public.Booking.where({ id: bookingId }).select("listingId").first();
  if (!before) return { ok: false, reason: "booking_not_found" };
  return db.transaction(async (tx) => {
    const listingLocks = await tx.query(db.raw.sql`SELECT id FROM "Listing" WHERE id = ${before.listingId} FOR NO KEY UPDATE`
      .returnsRow({ id: "pg/int4@1" }).build());
    if (listingLocks.length === 0) return { ok: false, reason: "booking_not_found" };
    const booking = await tx.orm.public.Booking.where({ id: bookingId }).forUpdate().first();
    if (!booking || booking.listingId !== before.listingId) return { ok: false, reason: "booking_not_found" };
    const referral = await tx.orm.public.ReferralCode.where({ code, active: true }).first();
    if (!referral) return { ok: false, reason: "invalid_referral" };
    const existing = await tx.orm.public.ReferralAttribution.where({ bookingId }).forUpdate().first();
    const attributionStatus = booking.status === "pending_payment" ? "pending" : booking.status;
    if (existing) {
      if (existing.referralCode !== referral.code) return { ok: false, reason: "already_attributed" };
      if (existing.status !== attributionStatus) {
        await tx.orm.public.ReferralAttribution.where({ bookingId }).update({ status: attributionStatus });
      }
      return { ok: true, alreadyRecorded: true, bookingId, code };
    }
    const attribution = await tx.orm.public.ReferralAttribution.create({
      bookingId, referralCode: referral.code, status: attributionStatus,
    });
    return { ok: true, alreadyRecorded: false, bookingId: attribution.bookingId, code: attribution.referralCode };
  });
}
