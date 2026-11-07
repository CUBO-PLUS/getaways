import "server-only";

import type { CheckoutMethod } from "@/components/organisms/CheckoutMethods";
import { getBookingBySessionId, getListing } from "@/modules/bookings/server/bookings";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";
import { isBtcpayTestnetEnabled } from "@/modules/payments/btcpay-testnet";
import { isPaymentProviderConfigured } from "@/modules/payments";
import { BTCPAY_TEST_AMOUNT_CENTS } from "@/modules/payments/types";
import { getPaymentAttemptForBooking } from "@/modules/payments/server/payment-attempts";

export async function getCheckoutData(sessionId: string | undefined, request?: Request) {
  if (!sessionId || !isCheckoutSessionId(sessionId)) return null;
  const booking = await getBookingBySessionId(sessionId, request);
  if (!booking) return null;
  const listing = await getListing(booking.listing_id);
  const testnetProvider = process.env.PAYMENT_PROVIDER === "btcpay-testnet";
  const testnetAvailable = testnetProvider && await isBtcpayTestnetEnabled();
  const attempt = testnetProvider && booking.payment_reference ? await getPaymentAttemptForBooking(booking.id) : null;
  const testChargeUsd = ((attempt?.testAmountCents ?? BTCPAY_TEST_AMOUNT_CENTS) / 100).toFixed(2);
  const methods: CheckoutMethod[] = [
    {
      key: "btc",
      name: `Bitcoin testnet — USD ${testChargeUsd} test charge`,
      detail: `Testnet only. The USD ${testChargeUsd} test charge is separate from your stay quote.`,
      available: isPaymentProviderConfigured() && testnetAvailable,
    },
  ];
  const nightLabel = booking.nights === 1 ? "night" : "nights";
  const awaitingPayment = booking.status === "pending_payment";
  // An open payment keeps the stored total; never show editable pricing beside it.
  const priceLocked = Boolean(booking.payment_reference);
  const pricingBelow = awaitingPayment && !priceLocked && Boolean(booking.pricing_snapshot) && !booking.pricing_review_required;
  return {
    sessionId,
    booking: {
      id: booking.id, version: booking.version, status: booking.status,
      check_in: booking.check_in, check_out: booking.check_out, nights: booking.nights,
      guest_name: booking.guest_name, guest_email: booking.guest_email, guests: booking.guests,
      total_amount_cents: booking.total_amount_cents, payment_open: Boolean(booking.payment_reference),
      pricing_available: Boolean(booking.pricing_snapshot) && !booking.pricing_review_required,
    },
    listing: { title: booking.agreed_listing_title || listing?.title || "Getaways stay", slug: listing?.slug ?? null },
    testChargeUsd, methods, nightLabel, awaitingPayment, priceLocked, pricingBelow,
  };
}

export type CheckoutData = NonNullable<Awaited<ReturnType<typeof getCheckoutData>>>;
