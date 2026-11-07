"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarDays, Loader2, ShieldCheck } from "lucide-react";
import BookingDatePicker from "@/components/molecules/BookingDatePicker";
import { useBookingDates } from "@/modules/bookings/providers/BookingDates";
import { addDaysIso, isoDateToLocalDate, nightsBetween, todayIso } from "@/modules/bookings/booking-dates";
import PaymentButtonIcon from "@/components/atoms/PaymentButtonIcon";
import { Button } from "@/components/atoms/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { Label } from "@/components/atoms/ui/label";

type BlockedRange = { start_date: string; end_date: string };

type BookingWidgetProps = {
  listingId: number;
  listingTitle: string;
  listingSlug: string;
  price?: string;
  cleaningFee?: string;
  minNights?: string;
  checkoutMode: "checkout" | "contact";
};

function parseMoney(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function overlaps(checkIn: string, checkOut: string, range: BlockedRange) {
  return checkIn < range.end_date && range.start_date < checkOut;
}

/*
 * The taken dates, or null when they could not be read. A failed read used to
 * look exactly like "nothing is taken": the error was swallowed, the list stayed
 * empty, and every date showed as free.
 */
async function fetchBlockedRanges(listingId: number): Promise<BlockedRange[] | null> {
  try {
    const response = await fetch(`/api/listings/${listingId}/availability`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok || !Array.isArray(json.data?.blocked)) return null;
    return json.data.blocked as BlockedRange[];
  } catch {
    return null;
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function getReferralCode(): string | undefined {
  const params = new URLSearchParams(window.location.search);

  // Prioritize the referral code in the current URL.
  if (params.has("ref")) {
    return params.get("ref") ?? undefined;
  }

  // Otherwise, use the code saved during navigation.
  try {
    return sessionStorage.getItem("gateways_referral_code") ?? undefined;
  } catch {
    return undefined;
  }
}

export default function BookingWidget({ listingId, listingTitle, listingSlug, price, cleaningFee, minNights, checkoutMode }: BookingWidgetProps) {
  const router = useRouter();
  const checkoutEnabled = checkoutMode !== "contact";
  const minStay = Math.max(1, Number(minNights || 1) || 1);
  /* Shared with the phone booking bar when one is on the page, local
     otherwise. See modules/bookings/providers/BookingDates.tsx. */
  const { checkIn, checkOut, setCheckIn: updateCheckIn, setCheckOut } = useBookingDates(minStay);
  const [blocked, setBlocked] = useState<BlockedRange[]>([]);
  const [availability, setAvailability] = useState<"loading" | "ready" | "failed">("loading");
  const loadingAvailability = availability === "loading";
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const start = params.get("check_in") ?? "";
    const end = params.get("check_out") ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) &&
      isoDateToLocalDate(start) && isoDateToLocalDate(end) && start >= todayIso() && nightsBetween(start, end) >= minStay) {
      updateCheckIn(start);
      setCheckOut(end);
    }
  }, [listingId, minStay, updateCheckIn, setCheckOut]);

  useEffect(() => {
    let active = true;
    fetchBlockedRanges(listingId).then((ranges) => {
      if (!active) return;
      if (ranges) {
        setBlocked(ranges);
        setAvailability("ready");
      } else {
        setAvailability("failed");
      }
    });

    return () => {
      active = false;
    };
  }, [listingId]);

  /* The retry button, and the refresh after somebody else took the dates. */
  async function reloadAvailability() {
    setAvailability("loading");
    const ranges = await fetchBlockedRanges(listingId);
    if (ranges) {
      setBlocked(ranges);
      setAvailability("ready");
    } else {
      setAvailability("failed");
    }
  }

  const pricePerNight = parseMoney(price);
  const cleaning = parseMoney(cleaningFee) ?? 0;
  const nights = nightsBetween(checkIn, checkOut);
  const datesBlocked = checkIn && checkOut ? blocked.some((range) => overlaps(checkIn, checkOut, range)) : false;
  const validDates = nights >= minStay && checkIn >= todayIso() && checkOut > checkIn && !datesBlocked;
  // Not until the calendar has actually loaded: with no calendar every date looks free.
  const canReserve = Boolean(pricePerNight) && validDates && availability === "ready";
  const total = useMemo(() => (pricePerNight && nights > 0 ? pricePerNight * nights + cleaning : null), [cleaning, nights, pricePerNight]);

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setCheckoutUnavailable(false);

    if (!checkoutEnabled) {
      router.push(
        `/contact-us?property=${encodeURIComponent(listingSlug)}&check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`,
      );
      return;
    }

    if (!pricePerNight) {
      setMessage("This listing needs a nightly price before online checkout can start.");
      return;
    }

    // The button is disabled in these states, but the phone bar submits this
    // form directly, so the rule is repeated here. When the check failed, the
    // notice with its retry is already on screen.
    if (availability !== "ready") {
      if (availability === "loading") setMessage("Still checking which dates are free. One moment.");
      return;
    }

    if (!validDates) {
      setMessage(datesBlocked ? "Those dates are already blocked." : `Choose at least ${minStay} night${minStay === 1 ? "" : "s"}.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listingId,
          check_in: checkIn,
          check_out: checkOut,
          // No name, email or phone: the server takes them from the signed-in account.
          referral_code: getReferralCode(),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        if (response.status === 401) {
          const params = new URLSearchParams(window.location.search);
          params.set("check_in", checkIn);
          params.set("check_out", checkOut);
          const returnTo = `/listing/${encodeURIComponent(listingSlug)}?${params}`;
          router.push(`/account/login?returnTo=${encodeURIComponent(returnTo)}&notice=login-required`);
          return;
        }
        // 409: somebody else took the dates since this page loaded. Reload the
        // calendar so they show as taken instead of inviting the same click.
        if (response.status === 409) void reloadAvailability();
        setCheckoutUnavailable(json?.error === "checkout_not_configured");
        setMessage(json?.message ?? json?.error ?? "Booking could not be started. Please try again.");
        return;
      }
      // Every path answers with a URL: the checkout page, where the rail is
      // chosen. Assigning an absent one used to navigate to
      // /listing/undefined and 404, stranding the booking row that had just
      // been created, so it is checked rather than assumed.
      if (typeof json.data?.url === "string" && json.data.url) {
        window.location.href = json.data.url;
        return;
      }
      setMessage("Checkout could not be started. Please contact us and we'll confirm your stay.");
    } catch {
      setMessage("Booking could not be started. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <Card className="@container border-0 bg-[rgb(253,_253,_252)] text-heading
      shadow-[0_1px_2px_rgba(7,_36,_86,_0.06),_0_10px_34px_rgba(7,_36,_86,_0.11)] overflow-hidden rounded-[10px]
      [&_::placeholder]:text-muted-text [&_::placeholder]:opacity-100">
      <CardHeader className="flex items-start justify-between border-b border-border p-5 gap-4">
        <div>
          <CardTitle className="mt-0 mb-1 text-heading font-heading text-[22px] font-medium leading-[1.25] mx-0">{checkoutEnabled ? "Reserve your stay" : "Request your stay"}</CardTitle>
          <CardDescription className="text-body-text text-[14px] leading-[22px]">{listingTitle}</CardDescription>
        </div>
        {/* No price badge here. The nightly rate is already stated at the top
            of the page, and the total for the chosen dates is stated at the
            bottom of this very card -- a third figure in the header made the
            card open with a number the guest had just read and would read
            again. */}
      </CardHeader>
      <CardContent className="pt-4 pb-5 px-5">
        <form className="flex flex-col gap-4 [&_label]:flex [&_label]:flex-col [&_label]:text-heading [&_label]:text-[13px] [&_label]:font-semibold
          [&_label]:leading-[1.35] [&_label]:min-w-0 [&_label]:gap-1.5" onSubmit={submitBooking}>
          <div className="grid grid-cols-2 gap-3 [@container_(max-width:_300px)]:grid-cols-1 max-[560.001px]:grid-cols-1">
            <div className="flex flex-col text-heading text-[13px] font-semibold leading-[1.35] min-w-0 gap-1.5">
              <Label htmlFor={`check-in-${listingId}`}>Check-in</Label>
              <BookingDatePicker className="font-body leading-[1.35]" id={`check-in-${listingId}`} min={todayIso()} value={checkIn} onChange={updateCheckIn} />
            </div>
            <div className="flex flex-col text-heading text-[13px] font-semibold leading-[1.35] min-w-0 gap-1.5">
              <Label htmlFor={`check-out-${listingId}`}>Check-out</Label>
              <BookingDatePicker className="font-body leading-[1.35]" id={`check-out-${listingId}`} min={addDaysIso(checkIn || todayIso(), minStay)} value={checkOut} onChange={setCheckOut} />
            </div>
          </div>

          <p className="text-muted-text text-[12px] leading-[18px] m-0">
            {checkoutEnabled
              ? "We'll use the name, email and phone on your account. Our concierge will follow up by email for arrival details and any special requests."
              : "Our concierge will follow up by email for arrival details and any special requests."}
          </p>

          <div className="flex items-center justify-between bg-[rgba(15,_23,_39,_0.035)] p-3 gap-3 rounded-lg
            [@container_(max-width:_300px)]:items-start [@container_(max-width:_300px)]:flex-col
            max-[560.001px]:items-start max-[560.001px]:flex-col" aria-live="polite">
            <div className="min-w-0">
              <span className="inline-flex items-center text-heading text-[14px] font-semibold leading-[18px] tabular-nums gap-1.75">
                <CalendarDays className="flex-none text-muted-text" size={16} aria-hidden="true" />
                {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Select dates"}
              </span>
              {minStay > 1 && <small className="block mt-0.75 text-muted-text text-[12px] leading-[18px] tabular-nums">Minimum stay: {minStay} nights</small>}
            </div>
            <strong className="text-heading font-heading text-[18px] font-semibold tabular-nums text-right whitespace-nowrap [@container_(max-width:_300px)]:text-left max-[560.001px]:text-left">{total ? money(total) : pricePerNight ? "Choose dates" : "Request quote"}</strong>
          </div>
          {/* Only when there is a checkout step to add them in. */}
          {pricePerNight && checkoutEnabled ? (
            <p className="text-muted-text text-[12px] leading-[18px] m-0">Taxes (IVA and tourism tax) are added at checkout.</p>
          ) : null}

          {/* Always rendered, with a reserved min-height in CSS, so the
              availability fetch resolving on mount does not shunt the button
              and the notices below it up the card. */}
          <div className="grid min-h-4.5 gap-3" aria-live="polite">
            {loadingAvailability ? (
              <p className="inline-flex items-center text-muted-text text-[12px] leading-[18px] m-0 gap-1.75">
                <Loader2 size={15} className="flex-none basis-5.5 w-5.5 animate-spin [animation-duration:900ms] motion-reduce:[animation-duration:2.4s]" aria-hidden="true" />
                Checking availability
              </p>
            ) : availability === "failed" ? (
              <p className="flex items-start text-[13px] leading-[20px] bg-[rgba(186,_26,_26,_0.08)] text-[rgb(143,_30,_24)] m-0 px-3 py-2.5 gap-2
                rounded-[8px] [&_svg]:grow-0 [&_svg]:shrink-0 [&_svg]:basis-[auto] [&_svg]:mt-0.75" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>We could not check which dates are free. Please try again.</span>
                {/* The site's plain text-button style; this card has none of its own. */}
                <button type="button" className="ml-auto bg-transparent [font-family:inherit] text-[13px] [font-weight:inherit] [font-style:inherit] leading-[inherit]
                  [font-variant:inherit] text-body-text underline underline-offset-[3px] cursor-pointer px-0.5 py-1 border-0
                  [&:hover:not(:disabled)]:text-text disabled:opacity-50 disabled:cursor-progress" onClick={() => void reloadAvailability()}>
                  Try again
                </button>
              </p>
            ) : datesBlocked ? (
              <p className="flex items-start text-[13px] leading-[20px] bg-[rgba(186,_26,_26,_0.08)] text-[rgb(143,_30,_24)] m-0 px-3 py-2.5 gap-2
                rounded-[8px] [&_svg]:grow-0 [&_svg]:shrink-0 [&_svg]:basis-[auto] [&_svg]:mt-0.75">
                <AlertCircle size={15} aria-hidden="true" />
                <span>Those dates are unavailable.</span>
              </p>
            ) : null}
            {message &&
              (checkoutUnavailable ? (
                <p className="flex items-start text-[13px] leading-[20px] bg-[color-mix(in_oklch,_var(--color-accent)_10%,_var(--color-background))] text-heading
                  m-0 px-3 py-2.5 gap-2 rounded-[8px] border border-solid border-[color-mix(in_oklch,_var(--color-accent)_34%,_transparent)]
                  [&_svg]:grow-0 [&_svg]:shrink-0 [&_svg]:basis-[auto] [&_svg]:mt-0.75 [&_a]:text-link-strong [&_a]:font-[850]">
                  <span>
                    We will confirm your stay personally. <Link href="/contact-us">Contact us</Link>
                  </span>
                </p>
              ) : (
                <p className="flex items-start text-[13px] leading-[20px] bg-[rgba(186,_26,_26,_0.08)] text-[rgb(143,_30,_24)] m-0 px-3 py-2.5 gap-2
                  rounded-[8px] [&_svg]:grow-0 [&_svg]:shrink-0 [&_svg]:basis-[auto] [&_svg]:mt-0.75" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{message}</span>
                </p>
              ))}
          </div>

          {checkoutMode === "contact" && (
            <p className="flex items-start text-[13px] leading-[20px] bg-[color-mix(in_oklch,_var(--color-accent)_10%,_var(--color-background))] text-heading
              m-0 px-3 py-2.5 gap-2 rounded-[8px] border border-solid border-[color-mix(in_oklch,_var(--color-accent)_34%,_transparent)]
              [&_svg]:grow-0 [&_svg]:shrink-0 [&_svg]:basis-[auto] [&_svg]:mt-0.75 [&_a]:text-link-strong [&_a]:font-[850]">
              <span>Send your dates and our team will confirm availability personally.</span>
            </p>
          )}

          <Button
            type="submit"
            data-umami-event="booking_click"
            data-umami-event-source="listing"
            data-umami-event-mode={checkoutMode}
            className="group/payment w-full min-h-12 bg-button-bg text-button-text cursor-pointer [font-family:inherit] text-[15px] font-bold
              [font-style:inherit] leading-[inherit] [font-variant:inherit] [transition:background_0.16s,_box-shadow_0.16s,_opacity_0.16s,_transform_0.16s]
              gap-1.75 rounded-full border-0 enabled:hover:bg-[rgb(28,_36,_35)] enabled:hover:[transform:translateY(-1px)]
              focus-visible:shadow-[0_0_0_3px_rgba(3,_155,_229,_0.35)] enabled:active:[transform:translateY(0)] disabled:cursor-not-allowed
              disabled:opacity-55 aria-busy:cursor-progress aria-busy:hover:transform-none"
            aria-busy={submitting}
            disabled={submitting || (checkoutEnabled && availability !== "ready") || (checkoutEnabled && !canReserve)}
          >
            {submitting ? <Loader2 size={16} className="flex-none basis-5.5 w-5.5 animate-spin [animation-duration:900ms] motion-reduce:[animation-duration:2.4s]" aria-hidden="true" /> : <PaymentButtonIcon />}
            <span>{submitting ? "Starting checkout" : checkoutEnabled ? (pricePerNight ? "Reserve now" : "Price unavailable") : "Request booking"}</span>
          </Button>

          <p className="inline-flex items-center text-muted-text text-[12px] leading-[18px] m-0 gap-1.75">
            <ShieldCheck size={15} aria-hidden="true" />
            {checkoutMode === "checkout" ? "Bitcoin or card, on the next step" : "Concierge follow-up"}
          </p>
        </form>
      </CardContent>
    </Card>
    </>
  );
}
