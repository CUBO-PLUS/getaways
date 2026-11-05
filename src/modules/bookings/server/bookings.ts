import "server-only";

import { DatesUnavailableError, NotFoundError, ValidationError } from "@/modules/bookings/booking-errors";
import {
  createBooking,
  confirmedRangesForListing,
  getBookingById,
  getBookingBySessionId,
  saveBookingQuote,
  setCheckoutSession,
  type Booking,
  type NewBooking,
  type QuoteUpdate,
} from "@/modules/bookings/server/booking-store";
import { parsePricingSnapshot } from "@/modules/bookings/booking-persistence";
import { priceFieldsFromAttributes } from "@/modules/bookings/booking-quote";
import { readCatalogListings } from "@/modules/listings/server/catalog";

/*
 * The booking rules: what counts as a valid stay, what dates are taken, and
 * how a new booking is written down. The storage itself is in
 * modules/bookings/server/booking-store.ts.
 *
 * Public listing data is read from the PostgreSQL catalogue. Booking storage
 * remains in booking-store; this module does not talk to a payment provider.
 */

export { getBookingById, getBookingBySessionId } from "@/modules/bookings/server/booking-store";
export type { Booking, BookingStatus } from "@/modules/bookings/server/booking-store";
export { DatesUnavailableError, NotFoundError, ValidationError } from "@/modules/bookings/booking-errors";

export type BlockedRange = { start_date: string; end_date: string };

export type BookingInput = {
  listing_id: number;
  check_in: string;
  check_out: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  guest_notes?: string;
};

export type ListingRow = Pick<Awaited<ReturnType<typeof readCatalogListings>>[number], "id" | "slug" | "title" | "attributes">;

/** The listing with this id, or null. Public data only. */
export async function getListing(id: number): Promise<ListingRow | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const listing = (await readCatalogListings()).find((row) => row.id === id);
  return listing ?? null;
}

/** Read-only receipt data, including missing sessions; the template owns the status messages. */
export async function getBookingConfirmationData(sessionId: string | undefined) {
  const booking = sessionId ? await getBookingBySessionId(sessionId) : null;
  const listing = booking ? await getListing(booking.listing_id) : null;
  return {
    sessionId: booking ? sessionId : undefined,
    booking: booking ? {
      status: booking.status, guest_name: booking.guest_name, check_in: booking.check_in, check_out: booking.check_out,
      nights: booking.nights, total_amount_cents: booking.total_amount_cents,
    } : null,
    listing: booking ? { title: booking.agreed_listing_title || listing?.title || "Your listing", slug: listing?.slug ?? null } : null,
  };
}

export type BookingConfirmationData = Awaited<ReturnType<typeof getBookingConfirmationData>>;

// Owner and guest both read these, so each names the thing to fix in plain words.
const MISSING_FIELD_MESSAGES: Record<string, string> = {
  guest_name: "Add the guest's name.",
  guest_email: "Add the guest's email.",
  check_in: "Pick a check-in date.",
  check_out: "Pick a check-out date.",
};

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(MISSING_FIELD_MESSAGES[field] ?? "Fill in every required field.");
  }
  return value;
}

function dayNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const instant = Date.parse(`${value}T00:00:00.000Z`);
  // Reject calendar overflow (e.g. February 30), rather than accepting Date's normalization.
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== value) return null;
  return instant / 86_400_000;
}

export function nightsForStay(checkIn: string, checkOut: string): number {
  const inDay = dayNumber(checkIn);
  const outDay = dayNumber(checkOut);
  if (inDay === null || outDay === null || outDay <= inDay) throw new ValidationError("Pick valid check-in and check-out dates.");
  const nights = outDay - inDay;
  if (!Number.isSafeInteger(nights)) throw new ValidationError("Those dates are too far apart to price safely.");
  return nights;
}

export function isBookingReadyForPayment(booking: Booking): boolean {
  try {
    const int4 = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
    const snapshot = booking.pricing_snapshot;
    if (!snapshot || booking.pricing_review_required || !int4(booking.id) || !int4(booking.listing_id) ||
      !int4(booking.nights) || !int4(booking.version) ||
      !int4(snapshot.baseGuests) || !int4(snapshot.maxGuests) || snapshot.baseGuests < 1 || snapshot.maxGuests < 1 ||
      (booking.guests !== null && (!int4(booking.guests) || booking.guests < 1))) return false;
    return nightsForStay(booking.check_in, booking.check_out) === booking.nights &&
      Number.isSafeInteger(booking.guests) && (booking.guests ?? 0) > 0 &&
      [booking.price_per_night_cents, booking.cleaning_fee_cents, booking.pet_fee_cents,
        booking.extra_guest_fee_cents, booking.discount_cents, booking.tax_cents, booking.total_amount_cents]
        .every((amount) => Number.isSafeInteger(amount) && amount >= 0) && booking.total_amount_cents > 0;
  } catch {
    return false;
  }
}

/**
 * Throws NotFoundError unless the listing exists AND is on the site. Used by
 * the public availability route. One message for both cases, so the response
 * cannot be used to tell a hidden listing from a missing one.
 */
export async function requireBookableListing(listingId: number): Promise<void> {
  const listing = await getListing(listingId);
  if (!listing) {
    throw new NotFoundError("This property was not found. It may have been removed from the site.");
  }
}

/**
 * Dates that are taken for a listing: stays already paid for. Blocks set by
 * hand are not part of this build (there is no admin), so none are added.
 */
export async function getBlockedRanges(listingId: number): Promise<BlockedRange[]> {
  return confirmedRangesForListing(listingId);
}

/** The same as getBlockedRanges for many listings at once, for the properties archive. */
export async function getBlockedRangesForListings(listingIds: number[]): Promise<Map<number, BlockedRange[]>> {
  const byListing = new Map<number, BlockedRange[]>();
  for (const listingId of listingIds) {
    byListing.set(listingId, await getBlockedRanges(listingId));
  }
  return byListing;
}

/** Half-open [start, end) overlap: checking out and in on the same day is fine. */
export function rangesOverlapPublic(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Writes a new pending booking from the dates and guest details. The price here
 * is nights x nightly rate plus the cleaning fee. The checkout quote adds the
 * extra guests, pet, coupon and taxes later (see app/api/checkout/quote).
 */
export async function createPendingBooking(input: BookingInput): Promise<Booking> {
  const maxInt4 = 2_147_483_647;
  if (!Number.isSafeInteger(input.listing_id) || input.listing_id <= 0 || input.listing_id > maxInt4) {
    throw new ValidationError("This property cannot be booked safely.");
  }
  const guestName = requireNonEmptyString(input.guest_name, "guest_name");
  const guestEmail = requireNonEmptyString(input.guest_email, "guest_email");
  const checkIn = requireNonEmptyString(input.check_in, "check_in");
  const checkOut = requireNonEmptyString(input.check_out, "check_out");
  if (dayNumber(checkIn) === null || dayNumber(checkOut) === null) {
    throw new ValidationError("Pick the dates from the calendar.");
  }
  if (checkIn >= checkOut) {
    throw new ValidationError("Check-out must be after check-in.");
  }
  if (guestName.trim().length > 200 || guestEmail.trim().length > 254 ||
      (input.guest_phone?.length ?? 0) > 100 || (input.guest_notes?.length ?? 0) > 4000) {
    throw new ValidationError("Booking details are too long.");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (checkIn < today) {
    throw new ValidationError("Check-in cannot be in the past.");
  }

  const listing = await getListing(input.listing_id);
  if (!listing) {
    throw new NotFoundError("This property was not found. It may have been removed from the site.");
  }

  let fields: ReturnType<typeof priceFieldsFromAttributes>;
  try {
    fields = priceFieldsFromAttributes(listing.attributes);
  } catch (error) {
    if (error instanceof RangeError) throw new ValidationError("This property price cannot be represented safely.");
    throw error;
  }
  if (fields.pricePerNightCents <= 0) throw new ValidationError("This property has no price yet.");
  if (![fields.pricePerNightCents, fields.cleaningFeeCents].every((amount) => Number.isSafeInteger(amount) && amount >= 0)) {
    throw new ValidationError("This property price cannot be represented safely.");
  }

  const nights = nightsForStay(checkIn, checkOut);
  if (nights > maxInt4) throw new ValidationError("Those dates are too far apart to store safely.");
  const attrs = listing.attributes ?? {};
  if (attrs.booking_min_length && attrs.booking_min_length.trim() !== "") {
    const minNights = Number(attrs.booking_min_length);
    if (Number.isFinite(minNights) && nights < minNights) {
      throw new ValidationError(`This property needs a stay of at least ${minNights} ${minNights === 1 ? "night" : "nights"}.`);
    }
  }

  const blocked = await getBlockedRanges(input.listing_id);
  if (blocked.some((range) => rangesOverlapPublic(checkIn, checkOut, range.start_date, range.end_date))) {
    throw new DatesUnavailableError("Those dates are no longer available for this listing.");
  }

  const pricePerNightCents = fields.pricePerNightCents;
  const cleaningFeeCents = fields.cleaningFeeCents;

  const initialTotal = BigInt(nights) * BigInt(pricePerNightCents) + BigInt(cleaningFeeCents);
  if (initialTotal > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValidationError("This stay total cannot be represented safely.");
  const snapshot = parsePricingSnapshot({
    version: 1, currency: "USD", pricePerNightCents: fields.pricePerNightCents,
    cleaningFeeCents: fields.cleaningFeeCents, petFeeCents: fields.petFeeCents,
    extraGuestFeeCents: fields.extraGuestFeeCents, ivaBasisPoints: Math.round(fields.ivaRate * 10_000),
    tourismBasisPoints: Math.round(fields.tourismRate * 10_000), baseGuests: fields.baseGuests,
    maxGuests: fields.maxGuests, petsAllowed: fields.petsAllowed,
  });
  if (!snapshot || [input.listing_id, nights, fields.baseGuests, fields.maxGuests].some((value) => !Number.isSafeInteger(value) || value < 1 || value > maxInt4)) {
    throw new ValidationError("This property's booking limits cannot be represented safely.");
  }
  const fresh: NewBooking = {
    listing_id: input.listing_id,
    check_in: checkIn,
    check_out: checkOut,
    nights,
    guest_name: guestName.trim(),
    guest_email: guestEmail.trim(),
    guest_phone: input.guest_phone?.trim() || null,
    guest_notes: input.guest_notes?.trim() || null,
    guests: null,
    currency: "USD",
    price_per_night_cents: pricePerNightCents,
    cleaning_fee_cents: cleaningFeeCents,
    pet_fee_cents: 0,
    extra_guest_fee_cents: 0,
    discount_cents: 0,
    tax_cents: 0,
    total_amount_cents: Number(initialTotal),
    coupon_code: null,
    status: "pending_payment",
    checkout_session_id: null,
    payment_reference: null,
    admin_notes: null,
    pricing_snapshot: snapshot,
    pricing_review_required: false,
    agreed_listing_title: listing.title,
  };
  const created = await createBooking(fresh);
  if (!created) throw new DatesUnavailableError("Those dates are no longer available for this listing.");
  return created;
}

export async function attachCheckoutSession(bookingId: number, sessionId: string, expectedVersion: number): Promise<void> {
  const updated = await setCheckoutSession(bookingId, expectedVersion, sessionId);
  if (!updated) throw new NotFoundError("This booking was not found. It may have been deleted.");
}

/**
 * Saves a priced quote onto the booking. Refused (returns null) once the stay is
 * no longer waiting for payment, or once a payment is open: the figure on screen
 * must stay the figure the payment charges.
 */
export async function saveQuote(
  bookingId: number,
  expectedVersion: number,
  patch: QuoteUpdate
): Promise<Booking | null> {
  for (const key of ["price_per_night_cents", "cleaning_fee_cents", "pet_fee_cents", "extra_guest_fee_cents", "discount_cents", "tax_cents", "total_amount_cents"] as const) {
    const amount = patch[key];
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw new ValidationError("This stay total cannot be represented safely.");
    }
  }
  if (patch.guests !== undefined && (!Number.isSafeInteger(patch.guests) || (patch.guests ?? 0) <= 0)) {
    throw new ValidationError("Choose a valid number of guests.");
  }
  const current = await getBookingById(bookingId);
  if (!current || current.version !== expectedVersion || current.status !== "pending_payment" || current.payment_reference ||
    current.pricing_review_required || !current.pricing_snapshot) return null;
  return saveBookingQuote(bookingId, expectedVersion, patch);
}
