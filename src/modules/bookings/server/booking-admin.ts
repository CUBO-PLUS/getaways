import "server-only";
import { db } from "@/infrastructure/prisma/db";
import { cancelBooking, getBookingById, updateBookingContact, updateBookingNotes } from "@/modules/bookings/server/booking-store";
import type { Session } from "@/modules/auth/server/auth";
import type { BookingListFilters } from "@/modules/bookings/server/booking-admin-http";

const MAX_INT4 = 2_147_483_647;
const authorized = (actor: Session) => actor.role === "ADMIN" || actor.role === "BOOKING_MANAGER";
const validId = (id: number) => Number.isSafeInteger(id) && id > 0 && id <= MAX_INT4;

export function requireBookingStaff(actor: Session) {
  if (!authorized(actor)) throw new Error("forbidden");
}

export async function staffBookingList(actor: Session, filters: BookingListFilters) {
  requireBookingStaff(actor);
  const size = 25;
  const status = filters.status ?? "";
  const listingId = filters.listingId ?? 0;
  const from = filters.from ?? "";
  const to = filters.to ?? "";
  const [countRows, rows, listings] = await Promise.all([
    db.runtime().query(db.raw.sql`SELECT count(*)::int AS total FROM "Booking" b WHERE
      (${status} = '' OR b.status = ${status}) AND (${listingId} = 0 OR b."listingId" = ${listingId})
      AND (${from} = '' OR b."checkOut" >= NULLIF(${from}, '')::date)
      AND (${to} = '' OR b."checkIn" <= NULLIF(${to}, '')::date)`
      .returnsRow({ total: "pg/int4@1" }).build()),
    db.runtime().query(db.raw.sql`SELECT b.id, b."guestName", b."guestEmail", b."listingId", b."agreedListingTitle",
      b."checkIn"::text AS "checkIn", b."checkOut"::text AS "checkOut", b.status, b."totalAmountCents", b.version,
      b."paymentReviewRequired", l.title AS "listingTitle", l."archivedAt"
      FROM "Booking" b LEFT JOIN "Listing" l ON l.id = b."listingId" WHERE
      (${status} = '' OR b.status = ${status}) AND (${listingId} = 0 OR b."listingId" = ${listingId})
      AND (${from} = '' OR b."checkOut" >= NULLIF(${from}, '')::date)
      AND (${to} = '' OR b."checkIn" <= NULLIF(${to}, '')::date)
      ORDER BY b."createdAt" DESC, b.id DESC LIMIT ${size} OFFSET ${(filters.page - 1) * size}`
      .returnsRow({
        id: "pg/int4@1", guestName: "pg/text@1", guestEmail: "pg/text@1", listingId: "pg/int4@1",
        agreedListingTitle: "pg/text@1", checkIn: "pg/text@1", checkOut: "pg/text@1", status: "pg/text@1",
        totalAmountCents: "pg/int8@1", version: "pg/int4@1", paymentReviewRequired: "pg/bool@1",
        listingTitle: "pg/text@1", archivedAt: "pg/timestamptz-date@1",
      }).build()),
    db.runtime().query(db.raw.sql`SELECT id, title, "archivedAt" FROM "Listing" ORDER BY title, id`
      .returnsRow({ id: "pg/int4@1", title: "pg/text@1", archivedAt: "pg/timestamptz-date@1" }).build()),
  ]);
  const total = countRows[0]?.total ?? 0;
  return {
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / size)),
    total,
    listings: listings.map(({ id, title, archivedAt }) => ({ id, title, archived: archivedAt !== null })),
    bookings: rows.map((row) => {
      const totalCents = Number(row.totalAmountCents);
      if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error("Stored booking total is outside the safe integer range");
      return {
        id: row.id,
        guestName: row.guestName,
        guestEmail: row.guestEmail,
        listing: { title: row.listingTitle ?? row.agreedListingTitle, archived: row.archivedAt !== null },
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        status: row.status,
        totalCents,
        version: row.version,
        paymentReviewRequired: row.paymentReviewRequired,
      };
    }),
  };
}

export async function staffBookingDetail(actor: Session, id: number) {
  requireBookingStaff(actor);
  if (!validId(id)) return null;
  const booking = await getBookingById(id);
  if (!booking) return null;
  const [listing, attempt] = await Promise.all([
    db.orm.public.Listing.where({ id: booking.listing_id }).select("id", "title", "active", "archivedAt").first(),
    db.orm.public.PaymentAttempt.where({ bookingId: id }).first(),
  ]);
  return {
    id: booking.id,
    version: booking.version,
    status: booking.status,
    listing: { id: booking.listing_id, title: listing?.title ?? booking.agreed_listing_title, archived: !listing || listing.archivedAt !== null },
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    nights: booking.nights,
    guests: booking.guests,
    contact: { name: booking.guest_name, email: booking.guest_email, phone: booking.guest_phone },
    guestNotes: booking.guest_notes,
    internalNotes: booking.admin_notes,
    quote: {
      currency: booking.currency,
      nightlyCents: booking.price_per_night_cents,
      cleaningCents: booking.cleaning_fee_cents,
      petCents: booking.pet_fee_cents,
      extraGuestCents: booking.extra_guest_fee_cents,
      discountCents: booking.discount_cents,
      taxCents: booking.tax_cents,
      totalCents: booking.total_amount_cents,
    },
    paymentReferencePresent: Boolean(booking.payment_reference),
    paymentReviewRequired: booking.payment_review_required || attempt?.status === "review",
    testPayment: attempt ? { amountCents: attempt.testAmountCents, status: attempt.status } : null,
    cancelledAt: booking.cancelled_at,
    cancellationReason: booking.cancellation_reason,
    cancelledBy: booking.cancelled_by,
  };
}

export async function saveStaffContact(actor: Session, id: number, version: number, input: { name: string; email: string; phone: string | null }) {
  requireBookingStaff(actor);
  if (!validId(id) || !Number.isSafeInteger(version) || version < 1 || !input.name.trim() || input.name.length > 200 ||
    input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || (input.phone?.length ?? 0) > 100) {
    throw new RangeError("Invalid contact details");
  }
  return updateBookingContact(id, version, {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
  }, actor);
}

export async function saveStaffNotes(actor: Session, id: number, version: number, notes: string) {
  requireBookingStaff(actor);
  if (!validId(id) || !Number.isSafeInteger(version) || version < 1 || notes.length > 4_000) throw new RangeError("Invalid notes");
  return updateBookingNotes(id, version, notes.trim() || null, actor);
}

export async function cancelStaffBooking(actor: Session, id: number, version: number, reason: string) {
  requireBookingStaff(actor);
  if (!validId(id) || !Number.isSafeInteger(version) || version < 1 || reason.trim().length < 1 || reason.length > 500) {
    throw new RangeError("Invalid cancellation");
  }
  return cancelBooking(id, version, reason, actor);
}
