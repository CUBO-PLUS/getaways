"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, PawPrint, Users } from "lucide-react";

import CheckoutMethods, { type CheckoutMethod } from "@/components/organisms/CheckoutMethods";
import type { Quote } from "@/modules/bookings/booking-quote";

/*
 * The two questions that change the price, and the bill they produce.
 *
 * A booking is created from dates alone, so the total on the checkout was the
 * dates' worth and nothing else -- no party size or pet. This asks, and the
 * payment methods stay out of sight until it has an
 * answer: somebody who has not said how many people are coming has not been
 * quoted the price they would be charged.
 *
 * Nothing here computes money. Every figure on screen came from
 * /api/checkout/quote, which prices it on the server and writes the total onto
 * the booking. The browser sends answers; the server sends amounts.
 *
 * The payment methods are rendered HERE, not passed in from the page: the page
 * is rendered before any quote exists, so a total it handed down would be the
 * stale one. They get the quoted total, and only once a quote has been saved.
 */

type QuoteResponse = {
  quote: Quote;
  /** The answers the server priced, echoed back so the screen shows what was charged. */
  guests: number;
  withPet: boolean;
  maxGuests: number;
  baseGuests: number;
  petsAllowed: boolean;
  petFeeCents: number;
  extraGuestFeeCents: number;
  tourismRate: number;
  ivaRate: number;
};

type Answers = { guests: number; withPet: boolean };

/*
 * `unchanged` says whether the booking still carries the price the guest last
 * saw. A 4xx is the server refusing before it saved anything, so it does. A
 * 5xx or a dropped connection may or may not have saved, so nothing on screen
 * can be trusted after one.
 */
type QuoteResult = { data: QuoteResponse } | { error: string; unchanged: boolean; conflict: boolean };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function CheckoutExtras({
  sessionId,
  initialGuests,
  methods,
}: {
  sessionId: string;
  initialGuests: number;
  /** The payment methods, revealed once the guest has confirmed a saved quote. */
  methods: CheckoutMethod[];
}) {
  const router = useRouter();
  const [guests, setGuests] = useState(Math.max(1, initialGuests || 1));
  const [withPet, setWithPet] = useState(false);
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  /* A payment panel is open below. Its amount was fixed when it opened, so the
     questions above go quiet until the guest backs out of it. */
  const [paying, setPaying] = useState(false);

  /* The last quote the server saved and the screen is showing. */
  const good = useRef<QuoteResponse | null>(null);
  /* What the newest question sent, so "Try again" repeats exactly that. Empty
     until the guest has asked anything: a retry of the first load sends no
     answers either, so the booking's own party size and pet are kept
     rather than overwritten with defaults. */
  const sent = useRef<Answers | undefined>(undefined);
  const initialQuote = useRef<{ sessionId: string; result: Promise<QuoteResult> } | null>(null);
  /* Which request owns the screen. Answers can come back out of order, and a
     slow reply to an older question must not replace a newer one. */
  const latest = useRef(0);

  /* The request only. It sets no state, which is what lets the mount effect
     call it without updating anything synchronously -- a set-state in an
     effect body is a cascading render, and the rule that flags it is right. */
  const requestQuote = useCallback(
    async (answers?: Answers): Promise<QuoteResult> => {
      try {
        const res = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            answers
              ? {
                session_id: sessionId,
                guests: answers.guests,
                with_pet: answers.withPet,
              }
              : { session_id: sessionId }
          ),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) return { data: json.data as QuoteResponse };
        return {
          error: typeof json?.error === "string" ? json.error : "The price could not be worked out. Please try again.",
          unchanged: res.status >= 400 && res.status < 500,
          conflict: res.status === 409,
        };
      } catch {
        return {
          error: "The price could not be worked out. Check your connection and try again.",
          unchanged: false,
          conflict: false,
        };
      }
    },
    [sessionId]
  );

  const commit = useCallback((result: QuoteResult) => {
    if ("data" in result) {
      good.current = result.data;
      setData(result.data);
      setGuests(result.data.guests);
      setWithPet(result.data.withPet);
      setError(null);
    } else {
      setError(result.error);
      const previous = good.current;
      if (result.unchanged && previous) {
        // Refused, nothing saved: the bill on screen is still what the booking
        // carries, so put the questions back to the answers that produced it.
        setGuests(previous.guests);
        setWithPet(previous.withPet);
      } else {
        // Unknown. Showing the old bill, or offering to pay it, could charge a
        // figure that is not the one on screen, so neither stays.
        good.current = null;
        setData(null);
      }
    }
    setLoading(false);
  }, []);

  /* A new question. Only ever called from an event handler. */
  const apply = useCallback(
    async (answers?: Answers) => {
      const id = ++latest.current;
      sent.current = answers;
      // The guest agreed to a figure, and this is no longer that figure.
      setConfirmed(false);
      setPaying(false);
      setLoading(true);
      const result = await requestQuote(answers);
      if (id !== latest.current) return;
      commit(result);
      // 409: the booking moved on (a payment is open, or it is no longer
      // waiting for money). The server render knows which, and shows it.
      if ("error" in result && result.conflict) router.refresh();
    },
    [requestQuote, commit, router]
  );

  /*
   * Priced once on arrival, so the breakdown is on screen before anybody
   * touches anything. No answers are sent: the server starts from what the
   * booking already holds.
   *
   * The request is started here and every state update happens in the
   * callback, guarded by `active`. Nothing is set while the effect runs, and
   * nothing is set into a component that has already gone.
   */
  useEffect(() => {
    let active = true;
    const id = ++latest.current;
    // Strict Mode replays setup; share the write, not just ignore its first response.
    if (initialQuote.current?.sessionId !== sessionId) {
      initialQuote.current = { sessionId, result: requestQuote() };
    }
    initialQuote.current.result.then((result) => {
      if (!active || id !== latest.current) return;
      commit(result);
    });
    return () => {
      active = false;
    };
  }, [sessionId, requestQuote, commit]);

  function change(next: { guests?: number; withPet?: boolean }) {
    const guestsNext = next.guests ?? guests;
    const petNext = next.withPet ?? withPet;
    setGuests(guestsNext);
    setWithPet(petNext);
    void apply({ guests: guestsNext, withPet: petNext });
  }

  const quote = data?.quote;
  const maxGuests = data?.maxGuests || 0;
  const guestChoices = Array.from({ length: Math.max(maxGuests || guests, guests) }, (_, i) => i + 1);
  /* Nothing to change while a price is being worked out, while a payment is
     open, or when there is no saved quote to change: a failed one leaves only
     "Try again", never a half-working form. */
  const locked = loading || paying || !data;

  return (
    <section className="mt-6.5 [&_h2]:mt-0 [&_h2]:mb-4 [&_h2]:font-heading [&_h2]:text-[19px] [&_h2]:mx-0" aria-label="Your stay">
      <h2>Before you pay</h2>

      {paying && (
        <p className="mt-0 mb-6.5 text-[13px] leading-[1.6] text-body-text mx-0">
          The price is set while a payment is open.
        </p>
      )}

      <div className="flex flex-col mb-4.5 gap-1.5">
        <label className="inline-flex items-center text-[14px] font-semibold text-heading gap-1.75" htmlFor="checkout-guests">
          <Users size={16} aria-hidden="true" /> How many guests?
        </label>
        <select
          className="min-h-11.5 bg-background text-[15px]
          text-text [transition:border-color_160ms_ease,box-shadow_160ms_ease] px-3.5 py-0 rounded-lg border
            border-input appearance-none pr-10 bg-[url('/icons/chevron-down.svg')]
            bg-no-repeat bg-position-[right_14px_center] cursor-pointer focus:outline-none
            focus:shadow-[0_0_0_3px_rgba(3,_155,_229,_0.18)] focus:border-link focus-visible:[outline:none]
            focus-visible:shadow-[0_0_0_3px_rgba(3,_155,_229,_0.18)] focus-visible:border-link"
          id="checkout-guests"
          value={guests}
          onChange={(event) => change({ guests: Number(event.target.value) })}
          disabled={locked}
        >
          {guestChoices.map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
        {data && data.extraGuestFeeCents > 0 && (
          <small className="text-[13px] text-body-text">
            The rate covers {data.baseGuests}. Each guest above that is{" "}
            {money(data.extraGuestFeeCents)} a night.
          </small>
        )}
      </div>

      {data?.petsAllowed && (
        <div className="flex flex-col mb-4.5 gap-1.5">
          <span className="inline-flex items-center text-[14px] font-semibold text-heading gap-1.75">
            <PawPrint size={16} aria-hidden="true" /> Bringing a pet?
          </span>
          <div className="flex gap-2">
            {[
              { value: false, label: "No pets" },
              { value: true, label: "Yes, one pet" },
            ].map((option) => (
              <label
                key={String(option.value)}
                className={`relative inline-flex items-center min-h-11 text-[14px] font-medium cursor-pointer px-4 py-0 rounded-full border ${withPet === option.value ? "bg-heading text-white border-heading" : "text-body-text border-border"}`}
              >
                <input
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  type="radio"
                  name="with-pet"
                  checked={withPet === option.value}
                  onChange={() => change({ withPet: option.value })}
                  disabled={locked}
                />
                {option.label}
              </label>
            ))}
          </div>
          {data.petFeeCents > 0 && <small className="text-[13px] text-body-text">{money(data.petFeeCents)} once for the stay.</small>}
        </div>
      )}

      {quote && (
        <dl className="pt-4 pb-0 border-t border-solid border-t-border text-[15px] mx-0 my-5.5 px-0 [&>div]:flex [&>div]:items-baseline
          [&>div]:justify-between [&>div]:px-0 [&>div]:py-1.75 [&>div]:gap-4 [&_dt]:text-body-text [&_dd]:tabular-nums [&_dd]:text-heading
          [&_dd]:m-0">
          {quote.lines.map((line) => (
            <div key={line.label}>
              <dt>{line.label}</dt>
              <dd>{money(line.amountCents)}</dd>
            </div>
          ))}
          <div className="border-t border-solid border-t-border mt-1.75">
            <dt>Subtotal</dt>
            <dd>{money(quote.subtotalCents)}</dd>
          </div>
          {/* Two lines, not one "Taxes" figure. They are two different taxes
              at two different rates, the rate sheet quotes them as "13+5", and
              a guest asking what they paid should be able to read the answer
              off the bill. */}
          {/* The rate the property is charged, and not at all on a special
              price: its taxes are inside it, so the row would read $0.00. */}
          {quote.taxCents > 0 && (
            <div>
              <dt>IVA ({Math.round((data?.ivaRate ?? 0) * 100)}%)</dt>
              <dd>{money(quote.taxCents)}</dd>
            </div>
          )}
          {quote.tourismCents > 0 && (
            <div>
              <dt>Tourism tax ({Math.round((data?.tourismRate ?? 0) * 100)}%)</dt>
              <dd>{money(quote.tourismCents)}</dd>
            </div>
          )}
          <div className="border-t border-solid border-t-border mt-1.75 text-[18px] font-bold [&_dt]:text-heading [&_dd]:text-heading">
            <dt>Total</dt>
            <dd>{money(quote.totalCents)}</dd>
          </div>
        </dl>
      )}

      {error && (
        <p className="flex items-start mt-3 mb-0 text-[13px] leading-[1.5] text-[#8a1c2b] mx-0 gap-2 [&_svg]:flex-none [&_svg]:mt-0.5" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {/* No quote and nothing in flight: either the first one failed or a later
          one did and the old bill was dropped. There is no figure to pay, so
          the only way forward is to ask again. */}
      {!quote && !loading && (
        <button type="button" className="min-h-11.5 bg-button-bg text-button-text font-heading text-[14px] font-bold cursor-pointer
          [transition:background-color_200ms_ease,_opacity_200ms_ease] px-5.5 py-0 rounded-[8px] border-0
          [&:hover:not(:disabled)]:bg-[#2b3433] disabled:bg-transparent disabled:text-muted-text disabled:cursor-not-allowed disabled:border
          disabled:border-solid disabled:border-border focus-visible:[outline:none] focus-visible:shadow-[0_0_0_3px_rgba(3,_155,_229,_0.3)]" onClick={() => void apply(sent.current)}>
          Try again
        </button>
      )}

      {!confirmed && (loading || quote) && (
        <button
          type="button"
          className="flex items-center justify-center w-full min-h-13.5 bg-button-bg text-button-text font-heading text-[16px] font-bold cursor-pointer
            transition-colors duration-200 ease-[ease] px-5 py-0 gap-2.5 rounded-lg border-0 hover:bg-[#2b3433] disabled:opacity-75
            disabled:cursor-progress aria-busy:cursor-progress aria-busy:opacity-75"
          onClick={() => setConfirmed(true)}
          disabled={loading || !quote}
          aria-busy={loading}
        >
          {loading ? <Loader2 size={16} className="flex-none basis-5.5 w-5.5 animate-spin [animation-duration:900ms] motion-reduce:[animation-duration:2.4s]" aria-hidden="true" /> : null}
          {loading || !quote ? "Working out the price" : `Confirm ${money(quote.totalCents)} and choose payment`}
        </button>
      )}

      {/* Shown only for a quote the server has saved and the guest has agreed
          to, and handed that quote's total. The amount a panel shows is the
          amount on the booking, because the booking was just written with it. */}
      {confirmed && !loading && quote && (
        <div className="mt-2">
          <CheckoutMethods
            sessionId={sessionId}
            methods={methods}
            totalAmountCents={quote.totalCents}
            onPanelChange={setPaying}
          />
        </div>
      )}
    </section>
  );
}
