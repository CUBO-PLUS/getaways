import "server-only";

import { db } from "@/infrastructure/prisma/db";
import type { Session } from "@/modules/auth/server/auth";
import { createReferralCode, getReferralReport, setReferralCodeActive } from "./referral-management";
import { normalizeReferralCode } from "./referral-rules";

function requireAdmin(actor: Session) {
  if (actor.role !== "ADMIN") throw new Error("forbidden");
}

export async function listAdminReferralCodes(actor: Session) {
  requireAdmin(actor);
  return getReferralReport();
}

export async function getAdminReferralCode(actor: Session, input: string) {
  requireAdmin(actor);
  const code = normalizeReferralCode(input);
  if (!code) return null;
  const referral = await db.orm.public.ReferralCode.where({ code }).first();
  return referral ? { code: referral.code, active: referral.active } : null;
}

export async function createAdminReferralCode(actor: Session, input: unknown) {
  requireAdmin(actor);
  const code = typeof input === "string" ? normalizeReferralCode(input) : null;
  if (!code) throw new RangeError("Invalid referral code");
  return createReferralCode(code);
}

export async function setAdminReferralCodeActive(actor: Session, input: string, active: unknown) {
  requireAdmin(actor);
  const code = normalizeReferralCode(input);
  if (!code || typeof active !== "boolean") throw new RangeError("Invalid referral data");
  return setReferralCodeActive(code, active);
}

export async function getAdminReferralDetail(actor: Session, input: string) {
  const referral = await getAdminReferralCode(actor, input);
  if (!referral) return null;
  const code = referral.code;

  // Keep historical attributions even when their booking is no longer available.
  const rows = await db.runtime().query(db.raw.sql`
    SELECT a."bookingId", a.status, a."createdAt", b.id IS NOT NULL AS "bookingExists",
      b."guestName", COALESCE(l.title, b."agreedListingTitle") AS "listingTitle",
      b."checkIn"::text AS "checkIn", b."checkOut"::text AS "checkOut", b.status AS "bookingStatus"
    FROM "ReferralAttribution" a
    LEFT JOIN "Booking" b ON b.id = a."bookingId"
    LEFT JOIN "Listing" l ON l.id = b."listingId"
    WHERE a."referralCode" = ${code}
    ORDER BY a."createdAt" DESC, a.id DESC`
    .returnsRow({
      bookingId: "pg/int4@1", status: "pg/text@1", createdAt: "pg/timestamptz-date@1",
      bookingExists: "pg/bool@1", guestName: "pg/text@1", listingTitle: "pg/text@1",
      checkIn: "pg/text@1", checkOut: "pg/text@1", bookingStatus: "pg/text@1",
    }).build());

  return {
    code: referral.code,
    active: referral.active,
    attributions: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}
