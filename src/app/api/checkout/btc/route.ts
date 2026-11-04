import { NextResponse } from "next/server";

import { getBookingBySessionId, getListing, isBookingReadyForPayment } from "@/modules/bookings/server/bookings";
import { markPaid, updateBooking } from "@/modules/bookings/server/booking-store";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { activePaymentProvider } from "@/modules/payments";
import { syncReferralStatusForBooking } from "@/modules/referrals/referral-lifecycle";

export const dynamic = "force-dynamic";

/*
 * The Bitcoin payment route the checkout page talks to.
 *
 * POST { session_id }                  opens a payment for the booking's quoted total
 * POST { session_id, action: "simulate_paid" }
 *                                      dev only: marks the open payment paid, as if the
 *                                      money had arrived. Refused in production.
 * GET  ?session_id=                    the booking's status, plus the payment if one is open
 *
 * The booking is confirmed ONLY through markPaid() in modules/bookings/server/booking-store.ts.
 * This route never sets the status itself.
 */

function badSession() {
  return NextResponse.json({ ok: false, error: "Invalid checkout session." }, { status: 400 });
}

// Referral persistence is best-effort: never block a successful payment transition.
async function trySyncReferral(bookingId: number, status: "pending_payment" | "confirmed" | "cancelled") {
  try {
    await syncReferralStatusForBooking(bookingId, status);
  } catch (error) {
    console.error("Unable to sync referral attribution after payment:", error);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { session_id?: unknown; action?: unknown } | null;
  const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
  if (!isCheckoutSessionId(sessionId)) return badSession();

  const booking = await getBookingBySessionId(sessionId);
  if (!booking) {
    return NextResponse.json({ ok: false, error: "Checkout session not found." }, { status: 404 });
  }
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ ok: false, error: "This booking is no longer awaiting payment." }, { status: 409 });
  }
  if (!isBookingReadyForPayment(booking)) {
    return NextResponse.json({ ok: false, error: "This booking cannot be charged safely. Reprice it or contact us." }, { status: 409 });
  }

  if (body?.action === "simulate_paid") {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Not available." }, { status: 404 });
    }
    if (!booking.payment_reference) {
      return NextResponse.json({ ok: false, error: "Open a payment first." }, { status: 409 });
    }
    const result = await markPaid(booking.payment_reference);
    if (!result.found) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }
    await trySyncReferral(result.booking.id, result.booking.status);
    return NextResponse.json({ ok: true, data: { status: result.booking.status } });
  }

  try {
    // Reuse the payment already open for this booking, so a reload does not open a second one.
    if (booking.payment_reference) {
      const existing = await activePaymentProvider.getPayment(booking.payment_reference);
      if (existing) return NextResponse.json({ ok: true, data: { payment: existing } });
    }
    if (booking.check_in < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ ok: false, error: "Check-in has passed. This booking can no longer be charged." }, { status: 409 });
    }

    const listing = await getListing(booking.listing_id);
    const payment = await activePaymentProvider.createPayment({
      bookingId: booking.id,
      amountCents: booking.total_amount_cents,
      description: `${listing?.title ?? "Getaways stay"} (${booking.check_in} to ${booking.check_out})`,
    });
    // Records the payment on the booking. From here the price is locked (see the quote route).
    const saved = await updateBooking(booking.id, { payment_reference: payment.id });
    if (!saved) return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
    return NextResponse.json({ ok: true, data: { payment } });
  } catch (error) {
    console.error("Unexpected error in POST /api/checkout/btc:", error);
    return NextResponse.json({ ok: false, error: "The Bitcoin payment could not be opened. Try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!isCheckoutSessionId(sessionId)) return badSession();

  try {
    const booking = await getBookingBySessionId(sessionId);
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Checkout session not found." }, { status: 404 });
    }

    if (booking.status === "pending_payment" && !isBookingReadyForPayment(booking)) {
      return NextResponse.json({ ok: false, error: "This booking cannot be charged safely. Contact us." }, { status: 409 });
    }

    let payment = null;
    if (booking.payment_reference && booking.status === "pending_payment") {
      payment = await activePaymentProvider.getPayment(booking.payment_reference);
      // A provider that reports "paid" is the signal. markPaid() is the only thing that confirms.
      if (payment?.status === "paid") await markPaid(booking.payment_reference);
    }

    const current = await getBookingBySessionId(sessionId);
    // Also repairs a missed referral update when status is polled again.
    if (current && current.status !== "pending_payment") {
      await trySyncReferral(current.id, current.status);
    }

    return NextResponse.json({
      ok: true,
      data: {
        status: current?.status ?? booking.status,
        payment: payment ? { id: payment.id, status: payment.status, amountCents: payment.amountCents, btc: payment.btc ?? null } : null,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/checkout/btc:", error);
    return NextResponse.json({ ok: false, error: "Status could not be read." }, { status: 500 });
  }
}
