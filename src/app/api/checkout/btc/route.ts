import { getBookingBySessionId, getListing, isBookingReadyForPayment } from "@/modules/bookings/server/bookings";
import { associatePaymentReference, markPaid } from "@/modules/bookings/server/booking-store";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { activePaymentProvider } from "@/modules/payments";
import type { PaymentSession } from "@/modules/payments";
import { syncReferralStatusForBooking } from "@/modules/referrals/referral-lifecycle";

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
  const body = await request.json().catch(() => null) as { session_id?: unknown; action?: unknown } | null;
  const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
  if (!isCheckoutSessionId(sessionId)) return badSession();

  try {
    const booking = await getBookingBySessionId(sessionId);
    if (!booking) return privateCheckoutJson({ ok: false, error: "Checkout session not found." }, { status: 404 });

    if (body?.action === "reconcile") {
      if (!booking.payment_reference) return privateCheckoutJson({ ok: false, error: "No payment is open for this booking." }, { status: 409 });
      const payment = await activePaymentProvider.getPayment(booking.payment_reference);
      if (!validProviderEvidence(payment, booking)) {
        if (booking.status !== "pending_payment") await syncReferral(booking.id);
        return privateCheckoutJson({ ok: false, error: "Payment evidence could not be verified." }, { status: 409 });
      }
      if (payment.status !== "paid") {
        if (booking.status !== "pending_payment") await syncReferral(booking.id);
        return privateCheckoutJson({ ok: true, data: { status: booking.status } });
      }
      const result = await markPaid({ paymentId: booking.payment_reference, bookingId: booking.id, amountCents: booking.total_amount_cents, currency: "USD" });
      if (!result.found) return changed();
      await syncReferral(result.booking.id);
      return privateCheckoutJson({ ok: true, data: { status: result.booking.status } });
    }

    if (body?.action === "simulate_paid") {
      if (process.env.NODE_ENV === "production") return privateCheckoutJson({ ok: false, error: "Not available." }, { status: 404 });
      if (!booking.payment_reference) return privateCheckoutJson({ ok: false, error: "Open a payment first." }, { status: 409 });
      const result = await markPaid({ paymentId: booking.payment_reference, bookingId: booking.id, amountCents: booking.total_amount_cents, currency: "USD" });
      if (!result.found) return privateCheckoutJson({ ok: false, error: "Payment not found." }, { status: 404 });
      await syncReferral(result.booking.id);
      return privateCheckoutJson({ ok: true, data: { status: result.booking.status } });
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
      return privateCheckoutJson({ ok: true, data: { payment: existing } });
    }
    if (booking.check_in < new Date().toISOString().slice(0, 10)) {
      return privateCheckoutJson({ ok: false, error: "Check-in has passed. This booking can no longer be charged." }, { status: 409 });
    }
    if (activePaymentProvider.key === "btc-mock" && process.env.NODE_ENV === "production") {
      return privateCheckoutJson({ ok: false, error: "Not available." }, { status: 404 });
    }

    const listing = await getListing(booking.listing_id);
    let payment: PaymentSession;
    try {
      payment = await activePaymentProvider.createPayment({
        bookingId: booking.id, amountCents: booking.total_amount_cents,
        description: `${listing?.title ?? booking.agreed_listing_title} (${booking.check_in} to ${booking.check_out})`,
      });
    } catch {
      return privateCheckoutJson({ ok: false, error: "A previous payment attempt could not be reconciled safely. Contact support before retrying." }, { status: 409 });
    }
    if (payment.bookingId !== booking.id || payment.amountCents !== booking.total_amount_cents || payment.currency !== "USD" ||
      typeof payment.id !== "string" || payment.id.length < 1 || payment.id.length > 200) {
      return privateCheckoutJson({ ok: false, error: "The payment provider returned an invalid payment. Contact support." }, { status: 502 });
    }
    const saved = await associatePaymentReference({
      id: booking.id, expectedVersion: booking.version, amountCents: booking.total_amount_cents, paymentReference: payment.id,
    });
    if (!saved) {
      const current = await getBookingBySessionId(sessionId);
      if (current?.payment_reference === payment.id && current.status === "pending_payment") {
        const reused = await activePaymentProvider.getPayment(payment.id);
        if (validProviderEvidence(reused, current)) return privateCheckoutJson({ ok: true, data: { payment: reused } });
      }
      return changed();
    }
    return privateCheckoutJson({ ok: true, data: { payment } });
  } catch {
    console.error("Unexpected error in POST /api/checkout/btc");
    return privateCheckoutJson({ ok: false, error: "The Bitcoin payment could not be opened. Try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!isCheckoutSessionId(sessionId)) return badSession();
  try {
    const booking = await getBookingBySessionId(sessionId);
    if (!booking) return privateCheckoutJson({ ok: false, error: "Checkout session not found." }, { status: 404 });
    if (booking.status === "pending_payment" && !isBookingReadyForPayment(booking)) {
      return privateCheckoutJson({ ok: false, error: "This booking cannot be charged safely. Contact us." }, { status: 409 });
    }
    let payment = null;
    if (booking.payment_reference) {
      const found = await activePaymentProvider.getPayment(booking.payment_reference);
      if (validProviderEvidence(found, booking)) {
        payment = { id: found.id, status: found.status, amountCents: found.amountCents, btc: found.btc ?? null };
      }
    }
    return privateCheckoutJson({ ok: true, data: { status: booking.status, payment } });
  } catch {
    console.error("Unexpected error in GET /api/checkout/btc");
    return privateCheckoutJson({ ok: false, error: "Status could not be read." }, { status: 500 });
  }
}
