import { getBookingBySessionId, nightsForStay, saveQuote, ValidationError } from "@/modules/bookings/server/bookings";
import { quoteStay } from "@/modules/bookings/booking-quote";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { previewCoupon } from "@/modules/coupons/server/coupons";
import { assertSameOrigin } from "@/modules/auth/server/auth";

export const dynamic = "force-dynamic";

/*
 * What this stay costs, priced on the server.
 *
 * The checkout shows a breakdown that changes as the guest answers two
 * questions -- how many of you, and are you bringing a pet -- and possibly
 * types a coupon. The browser sends the ANSWERS, this computes the price, and
 * it writes the new total onto the booking so the payment charges the figure
 * that was on screen. Never trust a total sent from the browser.
 *
 * Coupons are only previewed here (see modules/coupons/server/coupons.ts). Nothing is spent.
 *
 * Once a payment is open (booking.payment_reference is set), the price is
 * locked. A payment is open for a fixed amount, so the party size cannot change
 * under it.
 */

type Body = {
  session_id?: unknown;
  guests?: unknown;
  with_pet?: unknown;
  coupon_code?: unknown;
};

const PAYMENT_OPEN_MESSAGE = "A payment is already open for this booking, so the price can no longer change.";

/* The save matched no row: a payment opened, or the booking moved on, between the read and the write. */
function bookingChangedResponse() {
  return privateCheckoutJson(
    { ok: false, error: "This booking changed while we were pricing it. Reload the page to see where it stands." },
    { status: 409 }
  );
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return privateCheckoutJson({ ok: false, error: "Invalid request origin." }, { status: 403 });
    const body = (await request.json().catch(() => null)) as Body | null;
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!isCheckoutSessionId(sessionId)) {
      return privateCheckoutJson({ ok: false, error: "Invalid checkout session." }, { status: 400 });
    }

    const booking = await getBookingBySessionId(sessionId, request);
    if (!booking) {
      return privateCheckoutJson({ ok: false, error: "Checkout session not found." }, { status: 404 });
    }
    if (booking.status !== "pending_payment") {
      return privateCheckoutJson({ ok: false, error: "This booking is no longer awaiting payment." }, { status: 409 });
    }
    if (booking.payment_reference) {
      return privateCheckoutJson({ ok: false, error: PAYMENT_OPEN_MESSAGE }, { status: 409 });
    }
    if (nightsForStay(booking.check_in, booking.check_out) !== booking.nights) {
      return privateCheckoutJson({ ok: false, error: "This booking's dates are invalid. Please contact us." }, { status: 409 });
    }

    const fields = booking.pricing_snapshot;
    if (!fields || booking.pricing_review_required) {
      return privateCheckoutJson({ ok: false, error: "This booking needs a price review before checkout." }, { status: 409 });
    }
    const int4Max = 2_147_483_647;
    if (![booking.id, booking.listing_id, booking.nights, booking.version, fields.baseGuests, fields.maxGuests]
      .every((value) => Number.isSafeInteger(value) && value > 0 && value <= int4Max)) {
      return privateCheckoutJson({ ok: false, error: "This booking needs a price review before checkout." }, { status: 409 });
    }

    // What the booking already holds, for any answer the body does not give.
    const storedGuests = booking.guests;
    const defaultGuests = Number.isSafeInteger(storedGuests) && (storedGuests ?? 0) > 0 ? storedGuests! : 1;
    const defaultPet = (booking.pet_fee_cents ?? 0) > 0 && fields.petsAllowed;
    const defaultCode = booking.coupon_code?.trim() ?? "";

    let guests: number;
    if (body?.guests === undefined || body.guests === null) {
      guests = fields.maxGuests > 0 ? Math.min(defaultGuests, fields.maxGuests) : defaultGuests;
    } else {
      const requestedGuests = body.guests;
      if (typeof requestedGuests !== "number" || !Number.isSafeInteger(requestedGuests) || requestedGuests <= 0 || requestedGuests > int4Max) {
        return privateCheckoutJson({ ok: false, error: "Choose a valid number of guests." }, { status: 400 });
      }
      guests = requestedGuests;
      if (fields.maxGuests > 0 && guests > fields.maxGuests) {
        return privateCheckoutJson({ ok: false, error: `This property sleeps ${fields.maxGuests}.` }, { status: 400 });
      }
    }
    const withPet = typeof body?.with_pet === "boolean" ? body.with_pet : defaultPet;
    if (withPet && !fields.petsAllowed) {
      return privateCheckoutJson({ ok: false, error: "This property does not take pets." }, { status: 400 });
    }

    const code = typeof body?.coupon_code === "string" ? body.coupon_code.trim() : defaultCode;

    // The listing fields the client needs to draw the bill.
    const clientFields = {
      maxGuests: fields.maxGuests,
      baseGuests: fields.baseGuests,
      petsAllowed: fields.petsAllowed,
      petFeeCents: fields.petFeeCents,
      extraGuestFeeCents: fields.extraGuestFeeCents,
      tourismRate: fields.tourismBasisPoints / 10_000,
      ivaRate: fields.ivaBasisPoints / 10_000,
    };

    let discount: { kind: "percent" | "amount"; value: number } | null = null;
    let couponError: string | null = null;
    if (code) {
      try {
        const coupon = await previewCoupon(code, booking.listing_id);
        discount = { kind: coupon.kind, value: coupon.value };
      } catch (error) {
        // A bad code is a message beside the field, not a failed request.
        couponError = error instanceof Error ? error.message : "That coupon is not valid.";
      }
    }

    const quoteInput = {
      nights: booking.nights,
      // The rate the BOOKING was made at, so a later price edit cannot reprice a guest mid-checkout.
      pricePerNightCents: fields.pricePerNightCents,
      cleaningFeeCents: fields.cleaningFeeCents,
      baseGuests: fields.baseGuests,
      extraGuestFeeCents: fields.extraGuestFeeCents,
      petFeeCents: fields.petFeeCents,
      guests,
      withPet,
      tourismRate: fields.tourismBasisPoints / 10_000,
      ivaRate: fields.ivaBasisPoints / 10_000,
    };

    let quote = quoteStay({ ...quoteInput, discount });
    if (quote.totalCents <= 0 && discount) {
      couponError = "This stay still needs a payable amount.";
      discount = null;
      quote = quoteStay({ ...quoteInput, discount: null });
    }

    // The figure on screen becomes the figure the payment charges, and the row records why.
    const saved = await saveQuote(booking.id, booking.version, {
      guests,
      price_per_night_cents: fields.pricePerNightCents,
      total_amount_cents: quote.totalCents,
      cleaning_fee_cents: fields.cleaningFeeCents,
      extra_guest_fee_cents: quote.lines.find((line) => line.label.includes("extra guest"))?.amountCents ?? 0,
      pet_fee_cents: withPet ? fields.petFeeCents : 0,
      discount_cents: quote.discountCents,
      // Both taxes, so subtotal minus discount plus tax_cents is the total charged.
      tax_cents: quote.taxTotalCents,
      coupon_code: discount ? code.trim().toUpperCase() : null,
    });
    if (!saved) return bookingChangedResponse();

    return privateCheckoutJson({
      ok: true,
      data: {
        quote,
        guests,
        version: saved.version,
        withPet,
        couponCode: discount ? code.trim().toUpperCase() : null,
        couponError,
        ...clientFields,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return privateCheckoutJson({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof RangeError) {
      return privateCheckoutJson({ ok: false, error: "This stay cannot be priced safely. Please contact us." }, { status: 400 });
    }
    console.error("Unexpected error in POST /api/checkout/quote");
    return privateCheckoutJson({ ok: false, error: "The price could not be worked out." }, { status: 500 });
  }
}
