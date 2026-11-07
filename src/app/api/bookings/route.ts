import { attachCheckoutSession, createPendingBooking, DatesUnavailableError, NotFoundError, ValidationError, type BookingInput } from "@/modules/bookings/server/bookings";
import { newCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { recordReferralForBooking } from "@/modules/referrals/referral-store";
import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { assertGuestAccountsAvailable, assertGuestSameOrigin, getGuestSession, GuestAccountsUnavailableError } from "@/modules/guests/server/auth";

// The authenticated account, never a client-supplied user id or email, owns the
// booking, and its name, email and phone are the ones written onto it.
export async function POST(request: Request) {
  try {
    assertGuestAccountsAvailable();
    if (!assertGuestSameOrigin(request)) return privateCheckoutJson({ ok: false, error: "Invalid request origin." }, { status: 403 });
    const guest = await getGuestSession(request);
    if (!guest) return privateCheckoutJson({ ok: false, error: "Sign in to a guest account before booking." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return privateCheckoutJson({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    const input: BookingInput = {
      listing_id: Number(body.listing_id),
      check_in: String(body.check_in ?? ""),
      check_out: String(body.check_out ?? ""),
      guest_notes: body.guest_notes ? String(body.guest_notes) : undefined,
    };

    if (!Number.isSafeInteger(input.listing_id) || input.listing_id <= 0) {
      return privateCheckoutJson({ ok: false, error: "Invalid listing." }, { status: 400 });
    }

    const booking = await createPendingBooking(input, guest);
    const sessionId = newCheckoutSessionId(booking.id);
    await attachCheckoutSession(booking.id, sessionId, booking.version);

    const referralCode = typeof body.referral_code === "string" ? body.referral_code.trim() : "";
    if (referralCode) {
      try {
        const result = await recordReferralForBooking(booking.id, referralCode);
        if (!result.ok) console.warn("Referral not recorded:", result.reason);
      } catch {
        // A referral failure must not cancel the booking.
        console.error("Referral recording failed");
      }
    }
    return privateCheckoutJson({
      ok: true,
      data: { url: `/checkout?session_id=${encodeURIComponent(sessionId)}`, mode: "checkout" },
    });
  } catch (error) {
    if (error instanceof GuestAccountsUnavailableError) {
      return privateCheckoutJson({ ok: false, error: "Guest accounts are not available." }, { status: 503 });
    }
    if (error instanceof DatesUnavailableError) {
      return privateCheckoutJson({ ok: false, error: "dates_unavailable", message: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
      return privateCheckoutJson({ ok: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return privateCheckoutJson({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("Unexpected error in POST /api/bookings");
    return privateCheckoutJson({ ok: false, error: "Unexpected server error. Please try again." }, { status: 500 });
  }
}
