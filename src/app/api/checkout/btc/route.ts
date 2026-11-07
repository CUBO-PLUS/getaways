import { getBookingBySessionId, getListing, isBookingReadyForPayment } from "@/modules/bookings/server/bookings";
import { markPaid } from "@/modules/bookings/server/booking-store";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { activePaymentProvider, isPaymentProviderConfigured } from "@/modules/payments";
import type { PaymentSession } from "@/modules/payments";
import { BTCPAY_TEST_AMOUNT_CENTS } from "@/modules/payments/types";
import { getPaymentAttempt } from "@/modules/payments/server/payment-attempts";
import { btcAmountToSats, isBtcpayTestnetEnabled } from "@/modules/payments/btcpay-testnet";
import { syncReferralStatusForBooking } from "@/modules/referrals/referral-lifecycle";
import { assertSameOrigin } from "@/modules/auth/server/auth";

export const dynamic = "force-dynamic";

const badSession = () => privateCheckoutJson({ ok: false, error: "Invalid checkout session." }, { status: 400 });
const changed = () => privateCheckoutJson({ ok: false, error: "This booking changed. Reload checkout and try again." }, { status: 409 });

async function syncReferral(bookingId: number) {
  try {
    await syncReferralStatusForBooking(bookingId);
  } catch {
    // Payment success is authoritative; referral recovery is retried on reconciliation.
    console.error("Unable to sync referral attribution after payment");
  }
}

function validProviderEvidence(payment: Awaited<ReturnType<typeof activePaymentProvider.getPayment>>, booking: NonNullable<Awaited<ReturnType<typeof getBookingBySessionId>>>): payment is PaymentSession {
  return payment !== null && payment.id === booking.payment_reference && payment.bookingId === booking.id &&
    payment.amountCents === booking.total_amount_cents && payment.currency === "USD";
}

export async function POST(request: Request) {
  try {
    if (!isPaymentProviderConfigured() || !(await isBtcpayTestnetEnabled())) {
      return privateCheckoutJson({ ok: false, code: "payment_unavailable", error: "Bitcoin checkout is unavailable." }, { status: 404 });
    }
    if (!assertSameOrigin(request)) return privateCheckoutJson({ ok: false, error: "Invalid request origin." }, { status: 403 });
    const body = await request.json().catch(() => null) as { session_id?: unknown; action?: unknown } | null;
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!isCheckoutSessionId(sessionId)) return badSession();
    if (body?.action !== undefined && body.action !== "reconcile") {
      return privateCheckoutJson({ ok: false, error: "Not available." }, { status: 404 });
    }

    const booking = await getBookingBySessionId(sessionId, request);
    if (!booking) return privateCheckoutJson({ ok: false, error: "Checkout session not found." }, { status: 404 });

    if (body?.action === "reconcile") {
      if (!booking.payment_reference) return privateCheckoutJson({ ok: false, error: "No payment is open for this booking." }, { status: 409 });
      const payment = await activePaymentProvider.getPayment(booking.payment_reference);
      if (!validProviderEvidence(payment, booking)) {
        if (booking.status !== "pending_payment") await syncReferral(booking.id);
        return privateCheckoutJson({ ok: false, code: "payment_review", data: { status: "review" }, error: "Payment evidence could not be verified; manual review is required." }, { status: 409 });
      }
      if (payment.status !== "paid") {
        if (payment.status === "review") return privateCheckoutJson({ ok: false, code: "payment_review", data: { status: "review" }, error: "This testnet payment needs manual review. No payment has been credited." }, { status: 409 });
        if (payment.status === "expired") return privateCheckoutJson({ ok: false, code: "payment_expired", data: { status: "expired" }, error: "This payment expired. Contact support; no replacement invoice was opened." }, { status: 409 });
        if (booking.status !== "pending_payment") await syncReferral(booking.id);
        return privateCheckoutJson({ ok: true, data: { status: booking.status, paymentStatus: payment.status } });
      }
      const result = await markPaid({ paymentId: booking.payment_reference, bookingId: booking.id, amountCents: booking.total_amount_cents, currency: "USD" });
      if (!result.found) return changed();
      await syncReferral(result.booking.id);
      return privateCheckoutJson({ ok: true, data: { status: result.booking.status, paymentStatus: "paid" } });
    }

    if (booking.status !== "pending_payment") {
      await syncReferral(booking.id);
      return privateCheckoutJson({ ok: false, error: "This booking is no longer awaiting payment." }, { status: 409 });
    }
    if (!isBookingReadyForPayment(booking)) {
      return privateCheckoutJson({ ok: false, error: "This booking cannot be charged safely. Reprice it or contact us." }, { status: 409 });
    }
    if (booking.payment_reference) {
      const existing = await activePaymentProvider.getPayment(booking.payment_reference);
      if (!validProviderEvidence(existing, booking)) {
        return privateCheckoutJson({ ok: false, error: "The existing payment needs review; no replacement was opened." }, { status: 409 });
      }
      if (existing.status === "review") return privateCheckoutJson({ ok: false, code: "payment_review", data: { status: "review" }, error: "The payment attempt needs manual review; no replacement invoice was opened." }, { status: 409 });
      return privateCheckoutJson({ ok: true, data: { payment: existing } });
    }
    if (booking.check_in < new Date().toISOString().slice(0, 10)) {
      return privateCheckoutJson({ ok: false, error: "Check-in has passed. This booking can no longer be charged." }, { status: 409 });
    }
    const listing = await getListing(booking.listing_id);
    // A listing taken off sale (inactive or archived) accepts no new payments. Payments
    // already opened are handled above, so late or pending ones are still processed.
    if (!listing) {
      return privateCheckoutJson({ ok: false, code: "listing_unavailable", error: "This property is no longer available for new payments. Contact us about this booking." }, { status: 409 });
    }
    let payment: PaymentSession;
    try {
      payment = await activePaymentProvider.createPayment({
        bookingId: booking.id, amountCents: booking.total_amount_cents,
        description: `${listing?.title ?? booking.agreed_listing_title} (${booking.check_in} to ${booking.check_out})`,
      });
    } catch {
      return privateCheckoutJson({ ok: false, code: "payment_unavailable", error: "Payment status is unavailable. Instructions are hidden until status can be verified." }, { status: 409 });
    }
    if (payment.bookingId !== booking.id || payment.amountCents !== booking.total_amount_cents || payment.currency !== "USD" ||
      typeof payment.id !== "string" || payment.id.length < 1 || payment.id.length > 200) {
      return privateCheckoutJson({ ok: false, error: "The payment provider returned an invalid payment. Contact support." }, { status: 502 });
    }
    if (payment.status === "review") {
      return privateCheckoutJson({ ok: false, code: "payment_review", data: { status: "review" }, error: "The testnet attempt needs manual review. No replacement invoice was opened." }, { status: 409 });
    }
    const current = await getBookingBySessionId(sessionId, request);
    if (!current || current.status !== "pending_payment" || current.payment_reference !== payment.id) return changed();
    return privateCheckoutJson({ ok: true, data: { payment } });
  } catch {
    console.error("Unexpected error in POST /api/checkout/btc");
    return privateCheckoutJson({ ok: false, code: "payment_unavailable", error: "Payment verification is unavailable. Instructions are hidden until status can be verified." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  if (!isPaymentProviderConfigured() || !(await isBtcpayTestnetEnabled())) {
    return privateCheckoutJson({ ok: false, code: "payment_unavailable", error: "Bitcoin checkout is unavailable." }, { status: 404 });
  }
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!isCheckoutSessionId(sessionId)) return badSession();
  try {
    const booking = await getBookingBySessionId(sessionId, request);
    if (!booking) return privateCheckoutJson({ ok: false, error: "Checkout session not found." }, { status: 404 });
    if (booking.status === "pending_payment" && !isBookingReadyForPayment(booking)) {
      return privateCheckoutJson({ ok: false, error: "This booking cannot be charged safely. Contact us." }, { status: 409 });
    }
    let payment = null;
    if (booking.payment_reference) {
      const found = await getPaymentAttempt(booking.payment_reference).then((attempt): PaymentSession | null => {
        if (!attempt || attempt.bookingId !== booking.id || attempt.provider !== activePaymentProvider.key ||
          attempt.storeId !== process.env.BTCPAY_STORE_ID || attempt.network !== "testnet" ||
          (attempt.testAmountCents !== 1 && attempt.testAmountCents !== BTCPAY_TEST_AMOUNT_CENTS) ||
          attempt.realTotalCents > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(booking.total_amount_cents) !== attempt.realTotalCents) return null;
        const pending = attempt.status === "pending";
        return {
          id: attempt.id, bookingId: attempt.bookingId, amountCents: Number(attempt.realTotalCents), currency: "USD" as const,
          testAmountCents: attempt.testAmountCents, network: "testnet",
          status: attempt.status === "paid" ? "paid" as const : attempt.status === "review" || attempt.status === "creating" ? "review" as const : "pending" as const,
          checkoutLink: pending && attempt.checkoutLink ? attempt.checkoutLink : undefined,
          btc: pending && attempt.btcDestination ? { address: attempt.btcDestination, amountSats: attempt.btcAmount ? btcAmountToSats(attempt.btcAmount) : undefined } : undefined,
        };
      });
      if (validProviderEvidence(found, booking)) {
        payment = { id: found.id, status: found.status, amountCents: found.amountCents, btc: found.btc ?? null,
          testAmountCents: found.testAmountCents ?? null, network: found.network ?? null, checkoutLink: found.checkoutLink ?? null };
      }
    }
    return privateCheckoutJson({ ok: true, data: { status: booking.status, payment } });
  } catch {
    console.error("Unexpected error in GET /api/checkout/btc");
    return privateCheckoutJson({ ok: false, error: "Status could not be read." }, { status: 500 });
  }
}
