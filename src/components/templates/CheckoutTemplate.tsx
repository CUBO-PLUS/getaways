import Link from "next/link";

import CheckoutExtras from "@/components/organisms/CheckoutExtras";
import CheckoutMethods from "@/components/organisms/CheckoutMethods";
import type { CheckoutData } from "@/modules/checkout/server/checkout";
import { formatStayDate } from "@/shared/utils/time";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function CheckoutTemplate({ data }: { data: CheckoutData }) {
  const { sessionId, booking, listing, isDev, methods, nightLabel, awaitingPayment, priceLocked, pricingBelow } = data;

  return (
    <main className="min-h-dvh grid place-items-center bg-[rgba(15,_23,_39,_0.03)] px-5 py-[clamp(24px,_6vw,_64px)]">
      <section className="w-full max-w-140 bg-background shadow-[0_5px_30px_rgba(7,_36,_86,_0.075)] p-[clamp(26px,_4vw,_40px)] rounded-[10px]" aria-labelledby="checkout-heading">
        <header className="flex items-center justify-between mt-0 mb-5 pb-4 border-b border-solid border-b-border mx-0 gap-3">
          <div className="flex items-center min-w-0 gap-3">
            <span className="block flex-none size-9 bg-button-bg text-muted-text font-heading text-[12px] font-bold rounded-lg" aria-hidden="true">
              G
            </span>
            <div>
              <strong className="block text-heading text-[15px] leading-[1.2]">Getaways El Salvador</strong>
              <span className="block text-muted-text text-[12px]">Secure online payment</span>
            </div>
          </div>
          {isDev && <span className="flex-none self-start bg-[#7a5206] text-white text-[11px] font-bold tracking-[0.5px] uppercase whitespace-nowrap
            px-2.5 py-1 rounded-full">Demo</span>}
        </header>

        {isDev && (
          <p className="mt-0 mb-5 bg-[rgba(255,_193,_7,_0.12)] text-[#7a5206] text-[13px] leading-[1.5] mx-0 px-3.5 py-2.5 rounded-[8px] border
            border-solid border-[rgba(178,_122,_12,_0.3)]" role="status">
            Student mock. No payment is real and nothing is charged.
          </p>
        )}

        <p className="mt-0 mb-1.5 text-[11px] font-extrabold tracking-[1px] uppercase text-link-strong mx-0">Reservation</p>
        <h1 className="mt-0 mb-6.5 mx-0 text-[30px] leading-[1.2]" id="checkout-heading">Confirm your stay</h1>

        <dl className="mt-0 mb-7 border-t border-solid border-t-border mx-0 p-0 [&_div]:flex [&_div]:items-baseline [&_div]:justify-between
          [&_div]:border-b [&_div]:border-solid [&_div]:border-b-border [&_div]:px-0 [&_div]:py-3.25 [&_div]:gap-5 [&_dt]:flex-none
          [&_dt]:text-[13px] [&_dt]:text-muted-text [&_dd]:flex [&_dd]:flex-col [&_dd]:items-end [&_dd]:text-right [&_dd]:text-[15px]
          [&_dd]:text-text [&_dd]:m-0 [&_dd]:gap-0.5 [&_div]:max-[480.001px]:flex-col [&_div]:max-[480.001px]:items-start
          [&_div]:max-[480.001px]:gap-1 [&_dd]:max-[480.001px]:items-start [&_dd]:max-[480.001px]:text-left">
          <div>
            <dt>Property</dt>
            <dd>{listing?.title ?? "Getaways stay"}</dd>
          </div>
          <div>
            <dt>Dates</dt>
            <dd>
              {formatStayDate(booking.check_in)} &ndash; {formatStayDate(booking.check_out)}
              <span className="text-[12px] text-muted-text">
                {booking.nights} {nightLabel}
              </span>
            </dd>
          </div>
          <div>
            <dt>Guest</dt>
            <dd>
              {booking.guest_name}
              <span className="text-[12px] text-muted-text">{booking.guest_email}</span>
            </dd>
          </div>
          {!pricingBelow && (
            <div className="[&_dt]:font-heading [&_dt]:text-[21px] [&_dt]:text-text [&_dd]:font-heading [&_dd]:text-[21px] [&_dd]:text-text">
              <dt>Total</dt>
              <dd>{money(booking.total_amount_cents)}</dd>
            </div>
          )}
        </dl>

        {booking.status === "confirmed" ? (
          <div className="mb-4">
            <Link className="flex items-center justify-center w-full min-h-13 bg-button-bg text-button-text font-heading text-[15px] font-bold no-underline cursor-pointer
              transition-colors duration-200 ease-[ease] px-5 py-0 gap-2.5 rounded-lg border-0 hover:bg-[#2b3433]" href={`/booking-confirmation?session_id=${encodeURIComponent(sessionId)}`}>
              View confirmation
            </Link>
          </div>
        ) : !awaitingPayment ? (
          /* Cancelled or anything else that is not waiting for money. Never the payment
             methods: a payment opened here would be taken for a stay that is already settled. */
          <section aria-label="Booking status">
            <p className="mt-0 mb-6.5 text-[13px] leading-[1.6] text-body-text mx-0">
              This booking is no longer waiting for payment, so there is nothing to pay here.
            </p>
            <div className="mb-4">
              <Link className="flex items-center justify-center w-full min-h-13 bg-button-bg text-button-text font-heading text-[15px] font-bold no-underline cursor-pointer
                transition-colors duration-200 ease-[ease] px-5 py-0 gap-2.5 rounded-lg border-0 hover:bg-[#2b3433]" href={`/booking-confirmation?session_id=${encodeURIComponent(sessionId)}`}>
                View booking status
              </Link>
            </div>
          </section>
        ) : priceLocked ? (
          <>
            <p className="mt-0 mb-6.5 text-[13px] leading-[1.6] text-body-text mx-0">
              A payment is already open for this stay, so the price is set. Pick up where you left off.
            </p>
            <CheckoutMethods sessionId={sessionId} methods={methods} totalAmountCents={booking.total_amount_cents} />
          </>
        ) : !booking.pricing_available ? (
          <p className="mt-0 mb-6.5 text-[13px] leading-[1.6] text-body-text mx-0" role="status">
            This booking needs a price review before checkout. Please contact our team.
          </p>
        ) : (
          /* The party size, the pet and any coupon come first, and the payment method is
             handed to that component rather than rendered beside it: a guest who has not
             been quoted has not seen the price they would be charged. */
          <CheckoutExtras
            sessionId={sessionId}
            initialGuests={booking.guests ?? 1}
            methods={methods}
          />
        )}

        <Link className="block text-center text-[13px] text-body-text" href={listing?.slug ? `/listing/${listing.slug}` : "/"}>
          Return to property
        </Link>
      </section>
    </main>
  );
}
