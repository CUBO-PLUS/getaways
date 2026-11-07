import "server-only";

import { Temporal } from "temporal-polyfill/full";
import { db } from "@/infrastructure/prisma/db";
import { isCanonicalCheckoutSessionId, parsePricingSnapshot, type PricingSnapshotV1 } from "@/modules/bookings/booking-persistence";

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled";

export type Booking = {
  id: number; listing_id: number; check_in: string; check_out: string; nights: number;
  guest_account_id: number | null;
  guest_name: string; guest_email: string; guest_phone: string | null; guest_notes: string | null;
  guests: number | null; currency: "USD"; price_per_night_cents: number; cleaning_fee_cents: number;
  pet_fee_cents: number; extra_guest_fee_cents: number; discount_cents: number; tax_cents: number;
  total_amount_cents: number; coupon_code: string | null; status: BookingStatus;
  checkout_session_id: string | null; payment_reference: string | null; admin_notes: string | null;
  pricing_snapshot: PricingSnapshotV1 | null; pricing_review_required: boolean; agreed_listing_title: string;
  version: number; cancelled_at: string | null; cancellation_reason: string | null; cancelled_by: string | null;
  payment_review_required: boolean; created_at: string; updated_at: string;
};

export type NewBooking = Omit<Booking, "id" | "created_at" | "updated_at" | "version" | "cancelled_at" | "cancellation_reason" | "cancelled_by" | "payment_review_required">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BookingRow = Awaited<ReturnType<typeof db.orm.public.Booking.first>>;
const MAX_INT4 = 2_147_483_647;
const isInt4 = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_INT4;

function cents(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Stored booking amount is outside the safe integer range.");
  return result;
}

function mapBooking(row: NonNullable<BookingRow>): Booking {
  const snapshot = parsePricingSnapshot(row.pricingSnapshot);
  return {
    id: row.id, listing_id: row.listingId, check_in: String(row.checkIn), check_out: String(row.checkOut), nights: row.nights,
    guest_account_id: row.guestAccountId,
    guest_name: row.guestName, guest_email: row.guestEmail, guest_phone: row.guestPhone, guest_notes: row.guestNotes,
    guests: row.guests, currency: "USD", price_per_night_cents: cents(row.pricePerNightCents),
    cleaning_fee_cents: cents(row.cleaningFeeCents), pet_fee_cents: cents(row.petFeeCents),
    extra_guest_fee_cents: cents(row.extraGuestFeeCents), discount_cents: cents(row.discountCents),
    tax_cents: cents(row.taxCents), total_amount_cents: cents(row.totalAmountCents), coupon_code: row.couponCode,
    status: row.status as BookingStatus, checkout_session_id: row.checkoutSessionId, payment_reference: row.paymentReference,
    admin_notes: row.adminNotes, pricing_snapshot: snapshot, pricing_review_required: row.pricingReviewRequired,
    agreed_listing_title: row.agreedListingTitle, version: row.version,
    cancelled_at: row.cancelledAt?.toString() ?? null, cancellation_reason: row.cancellationReason,
    cancelled_by: row.cancelledBy, payment_review_required: row.paymentReviewRequired,
    created_at: row.createdAt.toString(), updated_at: row.updatedAt.toString(),
  };
}

function bookingData(fields: NewBooking) {
  return {
    listingId: fields.listing_id, checkIn: fields.check_in, checkOut: fields.check_out, nights: fields.nights,
    guestAccountId: fields.guest_account_id,
    guestName: fields.guest_name, guestEmail: fields.guest_email, guestPhone: fields.guest_phone,
    guestNotes: fields.guest_notes, guests: fields.guests, currency: fields.currency,
    pricePerNightCents: BigInt(fields.price_per_night_cents), cleaningFeeCents: BigInt(fields.cleaning_fee_cents),
    petFeeCents: BigInt(fields.pet_fee_cents), extraGuestFeeCents: BigInt(fields.extra_guest_fee_cents),
    discountCents: BigInt(fields.discount_cents), taxCents: BigInt(fields.tax_cents),
    totalAmountCents: BigInt(fields.total_amount_cents), couponCode: fields.coupon_code,
    status: fields.status, checkoutSessionId: fields.checkout_session_id, paymentReference: fields.payment_reference,
    adminNotes: fields.admin_notes, pricingSnapshot: fields.pricing_snapshot, pricingReviewRequired: fields.pricing_review_required,
    agreedListingTitle: fields.agreed_listing_title,
  };
}

async function lockListing(tx: Transaction, listingId: number): Promise<boolean> {
  const rows = await tx.query(db.raw.sql`SELECT id FROM "Listing" WHERE id = ${listingId} FOR NO KEY UPDATE`
    .returnsRow({ id: "pg/int4@1" }).build());
  return rows.length > 0;
}

async function lockedBooking(tx: Transaction, id: number) {
  return tx.orm.public.Booking.where({ id }).forUpdate().first();
}

export async function listBookings(): Promise<Booking[]> {
  return (await db.orm.public.Booking.all()).map(mapBooking);
}

export async function getBookingById(id: number): Promise<Booking | null> {
  if (!isInt4(id) || id <= 0) return null;
  const row = await db.orm.public.Booking.where({ id }).first();
  return row ? mapBooking(row) : null;
}

export async function getBookingBySessionId(sessionId: string): Promise<Booking | null> {
  if (!isCanonicalCheckoutSessionId(sessionId)) return null;
  const row = await db.orm.public.Booking.where({ checkoutSessionId: sessionId }).first();
  if (!row || !isCanonicalCheckoutSessionId(row.checkoutSessionId, row.id)) return null;
  return mapBooking(row);
}

/** New rows carry the complete catalogue snapshot and historical title supplied by the caller. */
export async function createBooking(fields: NewBooking): Promise<Booking | null> {
  if (![fields.listing_id, fields.nights].every((value) => isInt4(value) && value > 0) ||
    !Number.isSafeInteger(fields.guest_account_id) || (fields.guest_account_id ?? 0) < 1 || (fields.guest_account_id ?? 0) > MAX_INT4 ||
    (fields.guests !== null && (!isInt4(fields.guests) || fields.guests < 1)) ||
    !fields.pricing_snapshot || fields.pricing_review_required ||
    !isInt4(fields.pricing_snapshot.baseGuests) || !isInt4(fields.pricing_snapshot.maxGuests) ||
    ![fields.price_per_night_cents, fields.cleaning_fee_cents, fields.pet_fee_cents, fields.extra_guest_fee_cents,
      fields.discount_cents, fields.tax_cents, fields.total_amount_cents].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    !fields.agreed_listing_title.trim()) {
    throw new RangeError("Booking values cannot be represented safely.");
  }
  return db.transaction(async (tx) => {
    if (!await lockListing(tx, fields.listing_id)) return null;
    if (!await tx.orm.public.GuestAccount.where({ id: fields.guest_account_id!, active: true }).first()) return null;
    const listing = await tx.orm.public.Listing.where({ id: fields.listing_id, active: true, archivedAt: null }).first();
    if (!listing) return null;
    const conflicts = await tx.orm.public.Booking.where({ listingId: fields.listing_id, status: "confirmed" }).all();
    if (conflicts.some((row) => String(row.checkIn) < fields.check_out && fields.check_in < String(row.checkOut))) return null;
    const row = await tx.orm.public.Booking.create(bookingData(fields));
    return mapBooking(row);
  });
}

export async function setCheckoutSession(id: number, expectedVersion: number, sessionId: string): Promise<Booking | null> {
  if (!isCanonicalCheckoutSessionId(sessionId, id) || !isInt4(expectedVersion) || expectedVersion >= MAX_INT4) return null;
  return db.transaction(async (tx) => {
    const current = await tx.orm.public.Booking.where({ id, version: expectedVersion, status: "pending_payment", checkoutSessionId: null }).first();
    if (!current) return null;
    const row = await tx.orm.public.Booking.where({ id, version: expectedVersion, status: "pending_payment", checkoutSessionId: null }).update({
      checkoutSessionId: sessionId, version: expectedVersion + 1,
    });
    return row ? mapBooking(row) : null;
  });
}

export type QuoteUpdate = {
  guests: number; price_per_night_cents: number; cleaning_fee_cents: number; pet_fee_cents: number;
  extra_guest_fee_cents: number; discount_cents: number; tax_cents: number; total_amount_cents: number; coupon_code: string | null;
};

export async function saveBookingQuote(id: number, expectedVersion: number, quote: QuoteUpdate): Promise<Booking | null> {
  if (!isInt4(id) || id < 1 || !isInt4(expectedVersion) || expectedVersion >= MAX_INT4 ||
    !isInt4(quote.guests) || quote.guests < 1 ||
    ![quote.price_per_night_cents, quote.cleaning_fee_cents, quote.pet_fee_cents, quote.extra_guest_fee_cents,
      quote.discount_cents, quote.tax_cents, quote.total_amount_cents].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    quote.total_amount_cents <= 0) return null;
  return db.transaction(async (tx) => {
    const current = await tx.orm.public.Booking.where({ id, version: expectedVersion, status: "pending_payment", paymentReference: null, pricingReviewRequired: false }).first();
    if (!current) return null;
    const row = await tx.orm.public.Booking.where({ id, version: expectedVersion, status: "pending_payment", paymentReference: null, pricingReviewRequired: false }).update({
      guests: quote.guests, pricePerNightCents: BigInt(quote.price_per_night_cents),
      cleaningFeeCents: BigInt(quote.cleaning_fee_cents), petFeeCents: BigInt(quote.pet_fee_cents),
      extraGuestFeeCents: BigInt(quote.extra_guest_fee_cents), discountCents: BigInt(quote.discount_cents),
      taxCents: BigInt(quote.tax_cents), totalAmountCents: BigInt(quote.total_amount_cents), couponCode: quote.coupon_code,
      version: expectedVersion + 1,
    });
    return row ? mapBooking(row) : null;
  });
}

/** Persist a provider result only if this attempt still owns the quoted pending booking. */
export async function associatePaymentReference(input: { id: number; expectedVersion: number; amountCents: number; paymentReference: string }): Promise<Booking | null> {
  if (!isInt4(input.id) || input.id < 1 || !isInt4(input.expectedVersion) || input.expectedVersion >= MAX_INT4 ||
    !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 ||
    !input.paymentReference || input.paymentReference.length > 200) return null;
  const before = await db.orm.public.Booking.where({ id: input.id }).select("listingId").first();
  if (!before) return null;
  return db.transaction(async (tx) => {
    if (!await lockListing(tx, before.listingId)) return null;
    const current = await lockedBooking(tx, input.id);
    if (!current || current.listingId !== before.listingId || current.version !== input.expectedVersion || current.status !== "pending_payment" ||
      current.paymentReference !== null || current.pricingReviewRequired || current.totalAmountCents !== BigInt(input.amountCents)) return null;
    const row = await tx.orm.public.Booking.where({ id: input.id, version: input.expectedVersion, paymentReference: null, status: "pending_payment" }).update({
      paymentReference: input.paymentReference, version: input.expectedVersion + 1,
    });
    return row ? mapBooking(row) : null;
  });
}

export async function confirmedRangesForListing(listingId: number): Promise<Array<{ start_date: string; end_date: string }>> {
  const rows = await db.orm.public.Booking.where({ listingId, status: "confirmed" }).select("checkIn", "checkOut").all();
  return rows.map((row) => ({ start_date: String(row.checkIn), end_date: String(row.checkOut) }));
}

export type MarkPaidResult = { found: false } | { found: true; booking: Booking; alreadyConfirmed: boolean; doubleBooked: boolean };

export async function markPaid(evidence: { paymentId: string; bookingId: number; amountCents: number; currency: "USD" }): Promise<MarkPaidResult> {
  if (typeof evidence.paymentId !== "string" || evidence.paymentId.length < 1 || evidence.paymentId.length > 200 ||
    !isInt4(evidence.bookingId) || evidence.bookingId < 1 || !Number.isSafeInteger(evidence.amountCents) ||
    evidence.amountCents <= 0 || evidence.currency !== "USD") return { found: false };
  const before = await db.orm.public.Booking.where({ paymentReference: evidence.paymentId, id: evidence.bookingId }).select("id", "listingId").first();
  if (!before) return { found: false };
  return db.transaction(async (tx) => {
    if (!await lockListing(tx, before.listingId)) return { found: false } as const;
    const row = await lockedBooking(tx, before.id);
    if (!row || row.listingId !== before.listingId || row.paymentReference !== evidence.paymentId ||
      row.totalAmountCents !== BigInt(evidence.amountCents)) return { found: false } as const;
    const booking = mapBooking(row);
    if (booking.status === "confirmed") return { found: true, booking, alreadyConfirmed: true, doubleBooked: false } as const;
    if (booking.status === "cancelled" && booking.payment_review_required) {
      return { found: true, booking, alreadyConfirmed: false, doubleBooked: booking.admin_notes?.includes("dates overlap") ?? false } as const;
    }

    const others = await tx.orm.public.Booking.where({ listingId: row.listingId, status: "confirmed" }).all();
    const overlap = others.some((other) => other.id !== row.id && String(other.checkIn) < booking.check_out && booking.check_in < String(other.checkOut));
    if (booking.status === "cancelled" || overlap) {
      const note = overlap
        ? "Payment received but dates overlap a confirmed booking; manual payment review/refund required."
        : "Payment received after cancellation; manual payment review/refund required.";
      const autoCancelled = booking.status === "pending_payment" && overlap;
      const notes = booking.admin_notes?.split("\n") ?? [];
      if (!notes.includes(note)) notes.push(note);
      const saved = await tx.orm.public.Booking.where({ id: row.id, version: row.version }).update({
        status: "cancelled", adminNotes: notes.filter(Boolean).join("\n"), paymentReviewRequired: true, version: row.version + 1,
        ...(autoCancelled ? {
          cancelledAt: row.cancelledAt ?? Temporal.Now.instant(),
          cancellationReason: row.cancellationReason ?? note,
          cancelledBy: row.cancelledBy ?? "system",
        } : {}),
      });
      return { found: true, booking: mapBooking(saved ?? row), alreadyConfirmed: false, doubleBooked: overlap } as const;
    }
    const saved = await tx.orm.public.Booking.where({ id: row.id, version: row.version, status: "pending_payment", paymentReference: evidence.paymentId }).update({
      status: "confirmed", version: row.version + 1,
    });
    return saved
      ? { found: true, booking: mapBooking(saved), alreadyConfirmed: false, doubleBooked: false } as const
      : { found: false } as const;
  });
}

/** Staff cancellation transition; preserves the payment evidence for later reconciliation. */
export async function cancelBooking(
  id: number,
  expectedVersion: number,
  reason: string,
  actor: { id: number; authVersion: number },
): Promise<Booking | null> {
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 500 || !isInt4(actor.id) || actor.id < 1 || !isInt4(actor.authVersion) || actor.authVersion < 1) throw new RangeError("Invalid cancellation details.");
  if (!isInt4(id) || id < 1 || !isInt4(expectedVersion) || expectedVersion >= MAX_INT4) return null;
  const before = await db.orm.public.Booking.where({ id }).select("listingId").first();
  if (!before) return null;
  return db.transaction(async (tx) => {
    const staff = await tx.orm.public.AdminUser.where({ id: actor.id, active: true, authVersion: actor.authVersion }).forUpdate().first();
    if (!staff || (staff.role !== "ADMIN" && staff.role !== "BOOKING_MANAGER")) return null;
    if (!await lockListing(tx, before.listingId)) return null;
    const row = await lockedBooking(tx, id);
    if (!row || row.listingId !== before.listingId) return null;
    if (row.status === "cancelled") return mapBooking(row);
    if (row.version !== expectedVersion) return null;
    const needsFinancialReview = row.status === "confirmed";
    const reviewNote = "Confirmed stay cancelled by staff; manual financial review required. No automatic refund is issued.";
    const notes = row.adminNotes?.split("\n") ?? [];
    if (needsFinancialReview && !notes.includes(reviewNote)) notes.push(reviewNote);
    const saved = await tx.orm.public.Booking.where({ id, version: expectedVersion, status: row.status }).update({
      status: "cancelled", cancelledAt: Temporal.Now.instant(), cancellationReason: cleanReason,
      cancelledBy: String(actor.id), version: expectedVersion + 1,
      paymentReviewRequired: row.paymentReviewRequired || needsFinancialReview,
      ...(needsFinancialReview ? { adminNotes: notes.filter(Boolean).join("\n") } : {}),
    });
    return saved ? mapBooking(saved) : null;
  });
}

export async function updateBookingContact(id: number, version: number, contact: { name: string; email: string; phone: string | null }, actor: { id: number; authVersion: number }): Promise<Booking | null> {
  if (!isInt4(id) || id < 1 || !isInt4(version) || version >= MAX_INT4) return null;
  return db.transaction(async (tx) => {
    const staff = await tx.orm.public.AdminUser.where({ id: actor.id, authVersion: actor.authVersion, active: true }).forUpdate().first();
    if (!staff || (staff.role !== "ADMIN" && staff.role !== "BOOKING_MANAGER")) return null;
    const row = await tx.orm.public.Booking.where({ id, version }).update({
      guestName: contact.name, guestEmail: contact.email, guestPhone: contact.phone, version: version + 1,
    });
    return row ? mapBooking(row) : null;
  });
}

export async function updateBookingNotes(id: number, version: number, notes: string | null, actor: { id: number; authVersion: number }): Promise<Booking | null> {
  if (!isInt4(id) || id < 1 || !isInt4(version) || version >= MAX_INT4) return null;
  return db.transaction(async (tx) => {
    const staff = await tx.orm.public.AdminUser.where({ id: actor.id, authVersion: actor.authVersion, active: true }).forUpdate().first();
    if (!staff || (staff.role !== "ADMIN" && staff.role !== "BOOKING_MANAGER")) return null;
    const row = await tx.orm.public.Booking.where({ id, version }).update({ adminNotes: notes, version: version + 1 });
    return row ? mapBooking(row) : null;
  });
}
