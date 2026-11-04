import "server-only";

import type { CheckoutMethod } from "@/components/organisms/CheckoutMethods";
import { getBookingBySessionId, getListing } from "@/modules/bookings/server/bookings";
import { isCheckoutSessionId } from "@/modules/checkout/checkout-session";

export async function getCheckoutData(sessionId: string | undefined) {
  if (!sessionId || !isCheckoutSessionId(sessionId)) return null;
  const booking = await getBookingBySessionId(sessionId);
  if (!booking) return null;
  const listing = await getListing(booking.listing_id);
  const isDev = process.env.NODE_ENV !== "production";
  const methods: CheckoutMethod[] = [
    {
      key: "btc",
      name: "Bitcoin (student mock)",
      detail: "Pay with bitcoin. Nothing real is charged in this class project.",
      available: true,
      demo: isDev,
    },
  ];
  const nightLabel = booking.nights === 1 ? "night" : "nights";
  const awaitingPayment = booking.status === "pending_payment";
  // An open payment keeps the stored total; never show editable pricing beside it.
  const priceLocked = Boolean(booking.payment_reference);
  const pricingBelow = awaitingPayment && !priceLocked;
  return { sessionId, booking, listing, isDev, methods, nightLabel, awaitingPayment, priceLocked, pricingBelow };
}

export type CheckoutData = NonNullable<Awaited<ReturnType<typeof getCheckoutData>>>;
