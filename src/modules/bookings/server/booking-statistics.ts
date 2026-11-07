import "server-only";
import { db } from "@/infrastructure/prisma/db";
import type { Session } from "@/modules/auth/server/auth";
import { requireBookingStaff } from "@/modules/bookings/server/booking-admin";
import { adminStatisticsRange, type AdminStatisticsPeriod } from "@/shared/utils/admin-period";

export async function getBookingStatistics(actor: Session, period: AdminStatisticsPeriod) {
  requireBookingStaff(actor);
  const range = adminStatisticsRange(period);
  const rows = await db.runtime().query(db.raw.sql`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
    count(*) FILTER (WHERE b.status = 'cancelled')::int AS cancelled,
    COALESCE(sum(b."totalAmountCents") FILTER (WHERE b.status = 'confirmed'), 0)::text AS "confirmedCents",
    (SELECT count(*)::int FROM "Booking" WHERE status = 'pending_payment') AS pending,
    (SELECT COALESCE(sum("totalAmountCents"), 0)::text FROM "Booking" WHERE status = 'pending_payment') AS "pendingCents",
    (SELECT count(*)::int FROM "Booking" b WHERE b."paymentReviewRequired" OR EXISTS (SELECT 1 FROM "PaymentAttempt" p WHERE p."bookingId" = b.id AND p.status = 'review')) AS review
    FROM "Booking" b WHERE b."createdAt" >= ${range.startAt.toISOString()}::timestamptz AND b."createdAt" <= ${range.endAt.toISOString()}::timestamptz`
    .returnsRow({ total: "pg/int4@1", confirmed: "pg/int4@1", cancelled: "pg/int4@1", pending: "pg/int4@1", pendingCents: "pg/text@1", confirmedCents: "pg/text@1", review: "pg/int4@1" }).build());
  const recent = await db.runtime().query(db.raw.sql`SELECT b.id, b."createdAt", b."guestName", b."checkIn"::text AS "checkIn", b."checkOut"::text AS "checkOut", b.status, b."totalAmountCents"::text AS "totalCents",
    COALESCE(l.title, b."agreedListingTitle") AS "listingTitle",
    (b."paymentReviewRequired" OR EXISTS (SELECT 1 FROM "PaymentAttempt" p WHERE p."bookingId" = b.id AND p.status = 'review')) AS "paymentReviewRequired"
    FROM "Booking" b LEFT JOIN "Listing" l ON l.id = b."listingId"
    WHERE b."createdAt" >= ${range.startAt.toISOString()}::timestamptz AND b."createdAt" <= ${range.endAt.toISOString()}::timestamptz
    ORDER BY b."createdAt" DESC, b.id DESC LIMIT 5`
    .returnsRow({ id: "pg/int4@1", createdAt: "pg/timestamptz-date@1", guestName: "pg/text@1", checkIn: "pg/text@1", checkOut: "pg/text@1", status: "pg/text@1", totalCents: "pg/text@1", listingTitle: "pg/text@1", paymentReviewRequired: "pg/bool@1" }).build());
  const totals = rows[0];
  if (!totals) throw new Error("Booking statistics unavailable");
  const safeCents = (value: string) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error("Stored booking total is outside the safe integer range"); return n; };
  return {
    period, ...range,
    total: totals.total, confirmed: totals.confirmed, cancelled: totals.cancelled,
    pendingPayment: totals.pending, pendingPaymentCents: safeCents(totals.pendingCents),
    confirmedReservationCents: safeCents(totals.confirmedCents), paymentReviewRequired: totals.review,
    recent: recent.map((row) => ({ ...row, totalCents: safeCents(row.totalCents), createdAt: row.createdAt.toISOString() })),
  };
}
