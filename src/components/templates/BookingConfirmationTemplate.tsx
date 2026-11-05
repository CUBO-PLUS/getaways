import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, CircleSlash, SearchX, XCircle } from "lucide-react";
import type { BookingConfirmationData } from "@/modules/bookings/server/bookings";
import {
  buildConciergeHref,
  CONCIERGE_SERVICE_DETAILS,
  CONCIERGE_SERVICE_LABELS,
  type ConciergeService,
} from "@/modules/concierge/concierge-shared";
import { formatStayDate } from "@/shared/utils/time";

type ReceiptState = "confirmed" | "pending" | "cancelled" | "refunded" | "missing";

const receiptAccent: Record<ReceiptState, string> = {
  confirmed: "[--receipt-accent:var(--color-success)]",
  pending: "[--receipt-accent:#b26a00]",
  cancelled: "[--receipt-accent:rgb(143,30,24)]",
  refunded: "[--receipt-accent:var(--color-heading)]",
  missing: "[--receipt-accent:rgb(90,98,112)]",
};

/* One shell for all six outcomes of this page, so a guest who lands here after
   a failed or half-finished payment gets the same hierarchy -- status, facts,
   next action -- as one whose booking went through. */
function ReceiptShell({
  state,
  icon,
  eyebrow,
  title,
  lede,
  children,
  actions,
  footnote,
}: {
  state: ReceiptState;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <article className={`w-[min(100%_-_32px,_640px)] mt-[clamp(32px,_5vw,_64px)] mb-[clamp(56px,_7vw,_88px)] mx-auto ${receiptAccent[state]}`}>
      <div className="grid justify-items-center text-center mb-7 gap-3">
        <span className="grid place-items-center size-14 bg-[color-mix(in_oklch,_var(--receipt-accent)_14%,_var(--color-background))]
          text-[var(--receipt-accent)] rounded-full" aria-hidden="true">
          {icon}
        </span>
        <p className="text-[var(--receipt-accent)] text-[11px] font-extrabold tracking-[0.09em] leading-none uppercase m-0">{eyebrow}</p>
        <h1 className="text-[clamp(28px,_4.4vw,_40px)] leading-[1.16] m-0">{title}</h1>
        <p className="max-w-[46ch] text-body-text text-[16px] leading-[26px] m-0">{lede}</p>
      </div>
      {children}
      <div className="flex flex-wrap mt-6 gap-3 [&_a]:inline-flex [&_a]:items-center [&_a]:justify-center [&_a]:grow [&_a]:shrink [&_a]:basis-50
        [&_a]:min-h-11.5 [&_a]:text-[15px] [&_a]:font-bold [&_a]:no-underline
        [&_a]:[transition:background_0.16s,_color_0.16s,_transform_0.16s,_box-shadow_0.16s] [&_a]:px-5.5 [&_a]:py-0 [&_a]:gap-2
        [&_a]:rounded-full [&_a:hover]:[transform:translateY(-1px)] [&_a:active]:[transform:translateY(0)]
        [&_a:focus-visible]:[outline:none] [&_a:focus-visible]:shadow-[0_0_0_3px_rgba(3,_155,_229,_0.35)] [&_a]:max-[420.001px]:grow
        [&_a]:max-[420.001px]:shrink [&_a]:max-[420.001px]:basis-full">{actions}</div>
      {footnote ? <p className="mt-5 mb-0 text-muted-text text-[13px] leading-[20px] text-center wrap-anywhere mx-0">{footnote}</p> : null}
    </article>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between px-5 py-3 gap-4 border-b border-border max-[420.001px]:items-start max-[420.001px]:flex-col max-[420.001px]:gap-0.5">
      <span className="flex-none text-muted-text text-[13px] font-semibold leading-[22px]">{label}</span>
      <span className="min-w-0 text-heading text-[15px] font-semibold tabular-nums leading-[22px] text-right wrap-anywhere max-[420.001px]:text-left">{value}</span>
    </li>
  );
}

function formatDate(iso: string) {
  return formatStayDate(iso, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/*
 * What we offer once the stay is paid for.
 *
 * This is the one moment on the site where the guest has finished deciding and
 * has dates in hand -- and it was a dead end: a receipt, two links, nothing to
 * do next. The concierge is what we actually sell around a stay, and everything
 * it needs to start is already known here, so each of these arrives at the form
 * with the property and the dates filled in.
 *
 * Four services, not the whole catalogue: this is an offer at the end of a
 * receipt, and a list of fifteen reads as a menu to work through rather than as
 * one more thing to say yes to. The catch-all takes anyone whose plan is not on
 * the list.
 */
const AFTER_BOOKING_SERVICES = [
  "airport_transfer",
  "private_chef",
  "surf_lessons",
  "tours",
] as const satisfies readonly ConciergeService[];

function ConciergeInvitation({
  listingSlug,
  checkIn,
  checkOut,
}: {
  listingSlug?: string;
  checkIn: string;
  checkOut: string;
}) {
  return (
    <section className="mt-[clamp(34px,_5vw,_52px)] mb-0 mx-0" aria-labelledby="receipt-concierge-title">
      <h2 className="text-[24px] leading-[1.25] m-0 before:block before:w-6 before:mb-3.5 before:border-t-2 before:border-heading" id="receipt-concierge-title">
        Now the rest of the trip
      </h2>
      <p className="mt-2.5 mb-0 max-w-[56ch] text-body-text text-[15px] leading-[1.55] mx-0">
        Your dates are held. Tell us what you want around them and we arrange it before you land
        &mdash; the same people we use ourselves on this coast.
      </p>

      {/* An index, not a row of cards: the thing on the left, what it means
          on the right, hairlines between. The same treatment the home page
          gives the concierge. */}
      <ul className="mt-5.5 mb-0 list-none border-t border-border mx-0 p-0">
        {AFTER_BOOKING_SERVICES.map((service) => (
          <li className="border-b border-border" key={service}>
            <Link
              className="group/concierge grid grid-cols-[minmax(0,_200px)_minmax(0,_1fr)_16px] items-center gap-y-1.5 gap-x-4.5 text-inherit no-underline px-0.5 py-3.5
                focus-visible:outline-2 focus-visible:outline-heading focus-visible:outline-offset-[3px] max-[560.001px]:grid-cols-1 max-[560.001px]:gap-1"
              href={buildConciergeHref({ service, listingSlug, checkIn, checkOut })}
            >
              <span className="font-heading text-[16px] font-medium text-heading">{CONCIERGE_SERVICE_LABELS[service]}</span>
              <span className="text-body-text text-[14px] leading-[1.5]">
                {CONCIERGE_SERVICE_DETAILS[service].description}
              </span>
              <ArrowRight className="text-muted-text transition-transform duration-180 ease-[ease] group-hover/concierge:translate-x-0.75 motion-reduce:transition-none max-[560.001px]:hidden" size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <Link
        className="inline-flex items-center justify-center min-h-11.5 mt-6 mb-0 bg-button-bg text-button-text text-[14px] font-semibold
          tracking-[0.02em] no-underline mx-0 px-6.5 py-0 rounded-[6px] hover:bg-[rgb(28,_36,_35)]"
        href={buildConciergeHref({ service: "plan_everything", listingSlug, checkIn, checkOut })}
      >
        Plan the whole stay with us
      </Link>
    </section>
  );
}

export default function BookingConfirmationTemplate({ data }: { data: BookingConfirmationData }) {
  const { sessionId, booking, listing } = data;

  const browseActions = (
    <>
      <Link className="bg-button-bg text-button-text hover:bg-[rgb(28,_36,_35)]" href="/properties">
        Browse properties
      </Link>
      <Link className="bg-[rgba(15,_23,_39,_0.05)] text-heading hover:bg-[rgba(15,_23,_39,_0.09)]" href="/contact-us">
        Contact our team
      </Link>
    </>
  );

  if (!sessionId) {
    return (
      <ReceiptShell
        state="missing"
        icon={<CircleSlash size={26} />}
        eyebrow="No booking session"
        title="Booking not found"
        lede="This page needs a checkout session to look up. If you just paid, use the link in your confirmation email — it carries the session reference."
        actions={browseActions}
      />
    );
  }

  if (!booking) {
    return (
      <ReceiptShell
        state="missing"
        icon={<SearchX size={26} />}
        eyebrow="No booking session"
        title="Booking not found"
        lede="We couldn't find a booking for that session. It may have expired before payment completed."
        actions={browseActions}
        footnote={<>Reference: {sessionId}</>}
      />
    );
  }

  if (booking.status === "pending_payment") {
    return (
      <ReceiptShell
        state="pending"
        icon={<CalendarClock size={26} />}
        eyebrow="Reservation pending"
        title="Your request is recorded"
        lede="Your dates are not confirmed yet. If you started a payment, we're waiting for the provider to confirm it; otherwise our team will contact you to arrange payment."
        actions={
          <>
            <Link
              className="bg-button-bg text-button-text hover:bg-[rgb(28,_36,_35)]"
              href={`/booking-confirmation?session_id=${encodeURIComponent(sessionId)}`}
            >
              Refresh status
            </Link>
            <Link className="bg-[rgba(15,_23,_39,_0.05)] text-heading hover:bg-[rgba(15,_23,_39,_0.09)]" href="/contact-us">
              Contact our team
            </Link>
          </>
        }
        footnote={<>Reference: {sessionId}</>}
      />
    );
  }

  if (booking.status === "cancelled") {
    return (
      <ReceiptShell
        state="cancelled"
        icon={<XCircle size={26} />}
        eyebrow="Booking cancelled"
        title="This booking was cancelled"
        lede="This booking was cancelled. Contact our team to review any payment and discuss next steps."
        actions={browseActions}
        footnote={<>Reference: {sessionId}</>}
      />
    );
  }

  return (
    <ReceiptShell
      state="confirmed"
      icon={<CheckCircle2 size={26} />}
      eyebrow="Booking confirmed"
      title="You're all set"
      lede={
        <>
          Thanks, {booking.guest_name} — your stay at{" "}
          <strong>{listing?.title ?? "your listing"}</strong> is confirmed.
        </>
      }
      actions={
        <>
          <Link
            className="bg-button-bg text-button-text hover:bg-[rgb(28,_36,_35)]"
            href={listing?.slug ? `/listing/${listing.slug}` : "/properties"}
          >
            View your property
          </Link>
          <Link className="bg-[rgba(15,_23,_39,_0.05)] text-heading hover:bg-[rgba(15,_23,_39,_0.09)]" href="/contact-us">
            Contact our team
          </Link>
        </>
      }
          footnote={<>Reference: {sessionId}</>}
    >
      <section className="bg-background shadow-[0_5px_30px_rgba(7,_36,_86,_0.075)] overflow-hidden rounded-[10px]" aria-label="Booking details">
        <div className="flex items-baseline justify-between border-b border-border px-5 py-4 gap-3">
          <h2 className="text-[15px] font-semibold leading-[22px] m-0">Your reservation</h2>
          <span className="text-muted-text text-[12px] tabular-nums leading-[22px] wrap-anywhere">{sessionId}</span>
        </div>
        <ul className="list-none m-0 p-0">
          <Row label="Property" value={listing?.title ?? "Your listing"} />
          <Row label="Guest" value={booking.guest_name} />
          <Row label="Check-in" value={formatDate(booking.check_in)} />
          <Row label="Check-out" value={formatDate(booking.check_out)} />
          <Row label="Nights" value={booking.nights} />
          <li className="flex items-baseline justify-between px-5 py-4 gap-4 bg-[rgba(15,_23,_39,_0.035)] max-[420.001px]:items-start max-[420.001px]:flex-col max-[420.001px]:gap-0.5">
            <span className="flex-none text-heading text-[13px] font-semibold leading-[22px]">Total paid</span>
            <span className="min-w-0 text-heading font-heading text-[24px] font-bold tabular-nums leading-[1.15] text-right wrap-anywhere max-[420.001px]:text-left">{money(booking.total_amount_cents)}</span>
          </li>
        </ul>
      </section>

      {/* Only on this branch of the page: a guest whose payment is pending or
          whose dates were taken is being told something, and an offer under
          that reads as though nobody looked. */}
      <ConciergeInvitation
        listingSlug={listing?.slug ?? undefined}
        checkIn={booking.check_in}
        checkOut={booking.check_out}
      />
    </ReceiptShell>
  );
}
