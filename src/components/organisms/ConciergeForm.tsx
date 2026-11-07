"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Car,
  CarTaxiFront,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Droplets,
  Map,
  MapPin,
  Mountain,
  PhoneCall,
  Plane,
  ShieldCheck,
  Ship,
  ShoppingBasket,
  Sparkles,
  Trees,
  Turtle,
  Utensils,
  Waves,
} from "lucide-react";

import BookingDatePicker from "@/components/molecules/BookingDatePicker";
import PhoneNumberField from "@/components/molecules/PhoneNumberField";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";
import { Label } from "@/components/atoms/ui/label";
import { Textarea } from "@/components/atoms/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/ui/select";
import { todayIso } from "@/modules/bookings/booking-dates";
import {
  conciergeMailto,
  CONCIERGE_SERVICE_DETAILS,
  CONCIERGE_SERVICE_GROUPS,
  CONCIERGE_SERVICE_LABELS,
  type ConciergeServiceIconKey,
  type ConciergeService,
} from "@/modules/concierge/concierge-shared";

/*
 * The concierge request form.
 *
 * Two things it does that the booking form does not. It has a success state,
 * because nothing redirects afterwards -- the guest stays here and has to be
 * told the request arrived. And it has a fallback: if the server answers
 * "store_unavailable" (the migration has not been applied yet) it opens a
 * pre-filled email rather than reporting a failure, so the request still
 * reaches somebody.
 *
 * Native checkboxes rather than a shadcn one: components/atoms/ui has no checkbox,
 * and adding it means a new Radix dependency for three tick boxes.
 */

type Props = {
  /** Prefilled from ?listing= on the page, so a request from a property page arrives with context. */
  listingSlug?: string;
  listingTitle?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialServices?: ConciergeService[];
  /** Where the fallback email goes. Passed in so the address lives in modules/site/business.ts only. */
  fallbackEmail: string;
};

const CALL_WINDOWS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
];

const INPUT_CLASS = `min-w-0 min-h-13 bg-white/68 shadow-none text-[#26312f] [font-family:inherit] text-[15px] [font-weight:inherit]
  [font-style:inherit] leading-[inherit] [font-variant:inherit] transition-[border-color,box-shadow,background-color] duration-160 ease-[ease]
  px-3.75 py-3.25 rounded-[8px] border-solid border-[#394342]/28 placeholder:text-[#26312f]/50 placeholder:opacity-100
  hover:enabled:bg-white/90 hover:enabled:border-[#394342]/52 focus-visible:bg-white/96
  focus-visible:shadow-[0_0_0_3px_rgba(57,67,66,0.13)] focus-visible:outline-none focus-visible:border-[#394342] motion-reduce:transition-none`;

const SELECT_TRIGGER_CLASS = `inline-flex min-w-0 min-h-13 bg-white/68 shadow-none text-[#26312f] [font-family:inherit] text-[15px] [font-weight:inherit]
  [font-style:inherit] leading-[inherit] [font-variant:inherit] transition-[border-color,box-shadow,background-color] duration-160 ease-[ease]
  text-left px-3.75 py-3.25 gap-3 rounded-[8px] border-solid border-[#394342]/28
  hover:enabled:bg-white/90 hover:enabled:border-[#394342]/52 focus-visible:bg-white/96
  focus-visible:shadow-[0_0_0_3px_rgba(57,67,66,0.13)] focus-visible:outline-none focus-visible:border-[#394342] motion-reduce:transition-none`;

const DATE_PICKER_CLASS = `min-w-0 min-h-13 bg-white/68 shadow-none text-[#26312f] [font-family:inherit] text-[15px] [font-weight:inherit]
  [font-style:inherit] leading-[inherit] [font-variant:inherit] transition-[border-color,box-shadow,background-color] duration-160 ease-[ease]
  justify-between text-left px-3.75 py-3.25 gap-3 rounded-[8px] border-[#394342]/28
  hover:enabled:bg-white/90 hover:enabled:border-[#394342]/52 hover:text-[#26312f] focus-visible:bg-white/96
  focus-visible:shadow-[0_0_0_3px_rgba(57,67,66,0.13)] focus-visible:outline-none focus-visible:border-[#394342] motion-reduce:transition-none`;

const SERVICE_ICONS: Record<ConciergeServiceIconKey, typeof Plane> = {
  plane: Plane,
  car: Car,
  chef: ChefHat,
  utensils: Utensils,
  map: Map,
  boat: Ship,
  water: Droplets,
  turtle: Turtle,
  waves: Waves,
  mountain: Mountain,
  bike: Bike,
  horse: Trees,
  steering: CarTaxiFront,
  basket: ShoppingBasket,
};

function tripDates(checkIn?: string, checkOut?: string) {
  if (!checkIn && !checkOut) return null;
  const format = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      ...(checkIn && checkOut && checkIn.slice(0, 4) === checkOut.slice(0, 4) ? {} : { year: "numeric" }),
    }).format(new Date(year, month - 1, day));
  };
  if (checkIn && checkOut) {
    return `${format(checkIn)} – ${format(checkOut)}${checkIn.slice(0, 4) === checkOut.slice(0, 4) ? ` ${checkOut.slice(0, 4)}` : ""}`;
  }
  return format((checkIn ?? checkOut)!);
}

export default function ConciergeForm({
  listingSlug,
  listingTitle,
  initialCheckIn,
  initialCheckOut,
  initialServices = [],
  fallbackEmail,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState<ConciergeService[]>(
    initialServices.includes("plan_everything") ? ["plan_everything"] : initialServices
  );
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? "");
  const [guests, setGuests] = useState("");
  const [callDay, setCallDay] = useState("");
  const [callWindow, setCallWindow] = useState("");
  const [wantsCall, setWantsCall] = useState(false);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"stored" | "email" | null>(null);

  /** Option 1 and Option 2 are exclusive; this is which one is showing. */
  const planEverything = services.includes("plan_everything");

  const details = useRef<HTMLDivElement | null>(null);
  const hadSelection = useRef(services.length > 0);

  /*
   * Bring the fields into view on the first pick.
   *
   * The fields render after the whole picker, so from the top of a group a
   * guest could tick a service and have the next step appear a screen and a
   * half below the fold -- nothing on screen changed, so nothing appeared to
   * happen. Only on the transition from no selection to one: after that the
   * panel is already there and moving the page under a guest who is adding a
   * second service would be its own bug.
   */
  useEffect(() => {
    const has = services.length > 0;
    const first = has && !hadSelection.current;
    hadSelection.current = has;
    if (!first) return;

    const panel = details.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    // Already on screen: leave the page where the guest put it.
    if (box.top >= 0 && box.top < window.innerHeight - 80) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /*
     * Its own top, 100px down to clear the header -- not
     * scrollIntoView({block: "center"}), which was tried and put the top of
     * the panel 248px ABOVE the viewport, because the panel is a whole form
     * and taller than the screen it was being centred in.
     */
    const target = window.scrollY + box.top - 100;
    const from = window.scrollY;
    window.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });

    /*
     * The hard fallback this codebase carries wherever a scroll matters: a
     * smooth programmatic scroll returns without error and moves nothing in
     * some engines. Measured here too -- 1px of travel where 1400 was asked
     * for -- so if nothing has happened shortly after, go there anyway.
     */
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - from) < 4) window.scrollTo(0, target);
    }, 450);
  }, [services]);

  function toggleService(service: ConciergeService) {
    setServices((current) => {
      if (service === "plan_everything") {
        return current.includes(service) ? [] : ["plan_everything"];
      }
      const withoutEverything = current.filter((chosen) => chosen !== "plan_everything");
      return withoutEverything.includes(service)
        ? withoutEverything.filter((chosen) => chosen !== service)
        : [...withoutEverything, service];
    });
  }

  /** Everything the guest typed, as an email they can send themselves. */
  function openFallbackEmail() {
    window.location.assign(
      conciergeMailto(fallbackEmail, {
        name,
        email,
        phone,
        listingTitle,
        listingSlug,
        services,
        checkIn,
        checkOut,
        guests,
        callDay: wantsCall ? callDay : undefined,
        callWindow: wantsCall ? callWindow : undefined,
        message,
      })
    );
  }

  /* The student copy stores nothing: the request goes out as an email the guest sends. */
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent("email");
    openFallbackEmail();
  }

  if (sent === "stored") {
    return (
      <div className="grid justify-items-start max-w-[62ch] gap-2" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <h3 className="text-[22px] m-0">Got it, {name.split(" ")[0] || "thanks"}.</h3>
        <p className="text-body-text m-0">
          We will write back to {email} to sort out the details. If it is urgent, reach us at{" "}
          <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a>.
        </p>
      </div>
    );
  }

  if (sent === "email") {
    return (
      <div className="grid justify-items-start max-w-[62ch] gap-2" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <h3 className="text-[22px] m-0">Almost there</h3>
        <p className="text-body-text m-0">
          Your email app should be opening with everything filled in — send it and we will take it
          from there. If nothing opened, write to{" "}
          <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a>.
        </p>
      </div>
    );
  }

  return (
    <form className="grid gap-[clamp(26px,_4vw,_42px)]" onSubmit={submit}>
      <fieldset className="min-w-0 m-0 p-0 border-0">
        <legend className="text-[clamp(20px,_2.2vw,_27px)] font-[650] leading-[1.2] text-heading p-0">What would make your stay easier?</legend>
        <p className="mt-2 mb-6.5 text-body-text mx-0">Two ways to start. Both reach the same team.</p>

        {/* Option 1 first.

            It used to sit under the four groups, as a catch-all for anyone
            whose plan was not on the list -- which put the simplest answer
            last, after a phone-length scroll through sixteen services. The two
            are already mutually exclusive in the state below: choosing this
            clears the rest, and choosing any service clears this. So they are
            two options, and they are labelled as two options. */}
        <div className="grid grid-cols-1 mt-0 gap-3">
          <p className="mt-0 mb-2 text-[11px] font-extrabold tracking-[0.1em] uppercase text-muted-text mx-0">Option 1</p>
          <label className="relative grid grid-cols-[26px_minmax(0,_1fr)] items-start min-h-19 pr-11 pl-4 text-body-text cursor-pointer bg-[#f2eee6]
            [transition:background-color_0.16s_ease,_color_0.16s_ease] py-3.5 gap-2.5 rounded-[8px] border border-solid
            border-border has-[input:checked]:bg-[#e6eeea]
            has-[input:checked]:shadow-[inset_0_0_0_1px_#394342] focus-within:[outline:2px_solid_var(--color-heading)]
            focus-within:outline-offset-2 after:absolute after:top-3.5 after:right-3.75
            after:grid after:size-5.5 after:place-items-center after:text-[#26312f]
            after:text-[14px] after:font-extrabold after:leading-none after:rounded-full after:border
            after:border-solid after:border-[#71807b] has-[input:checked]:after:content-['✓']
            has-[input:checked]:after:border-2 has-[input:checked]:after:border-[#394342]
            forced-colors:[forced-color-adjust:auto] forced-colors:border forced-colors:border-solid
            forced-colors:border-[ButtonText] forced-colors:after:hidden has-[input:checked]:forced-colors:[outline:2px_solid_Highlight]
            has-[input:checked]:forced-colors:outline-offset-2 has-[input:checked]:forced-colors:shadow-none
            forced-colors:focus-within:[outline:3px_double_Highlight] forced-colors:focus-within:outline-offset-[3px]
            motion-reduce:transition-none">
            <input
              className="absolute size-0.25 overflow-hidden [clip:rect(0,_0,_0,_0)] -m-px forced-colors:top-3.5 forced-colors:right-3.5 forced-colors:size-5 forced-colors:overflow-visible forced-colors:[clip:auto] forced-colors:m-0"
              type="checkbox"
              name="services"
              value="plan_everything"
              checked={services.includes("plan_everything")}
              onChange={() => toggleService("plan_everything")}
            />
            <Sparkles className="mt-0.5 text-[#566560]" size={22} aria-hidden="true" />
            {/* The card splits what CONCIERGE_SERVICE_LABELS keeps on one
                line. That label -- "Customize a full experience - we plan
                everything" -- is what a summary, an email and the admin show,
                where it has to stand alone; as a card title it would wrap to
                two lines and say the same thing twice. */}
            <span>
              <strong className={`block font-semibold ${planEverything ? "text-[#26312f]" : "text-heading"}`}>Customize a full experience</strong>
              <small className="block mt-0.75 text-[12px] leading-[1.4] text-muted-text">We plan everything. Tell us the shape of the trip and we connect the rest.</small>
            </span>
          </label>
        </div>

        {/*
          Option 2 is not on screen while Option 1 is chosen.

          The two are exclusive in the state -- ticking this card clears every
          service, and ticking a service clears this card -- so the sixteen
          services below were sixteen things that would undo the choice just
          made. Worse, the form's fields render after this fieldset: with the
          whole list still in the way, ticking the card at the top of the page
          put the next step some two thousand pixels below the fold, and the
          page looked like nothing had happened.

          Unticking the card brings the list straight back.
        */}
        {planEverything ? (
          <p className="mt-6.5 mb-0 text-muted-text text-[13.5px] mx-0">
            Option 2 is the other way round: untick the card above to pick services one by one.
          </p>
        ) : (
        <>
        <p className="mt-8.5 mb-2 text-[11px] font-extrabold tracking-[0.1em] uppercase text-muted-text mx-0">Option 2</p>
        <h3 className="text-[clamp(17px,_1.6vw,_20px)] font-[650] leading-[1.25] text-heading m-0">Choose a few of your interests</h3>
        <p className="mt-1.5 mb-4.5 text-body-text mx-0">One or as many as you need. We arrange those and leave the rest of the week alone.</p>
        <div className="grid grid-cols-[0.9fr_0.9fr_1.2fr_1fr] border-t border-solid border-t-border border-b border-b-border
          max-[900.001px]:grid-cols-[1fr_1fr] max-[760.001px]:grid-cols-1">
          {/* Both ends of the labelling below read `group.id`. They used to
              disagree: the heading carried an id built from the group's own
              identifier while the section pointed at one built by lowercasing
              the label, so "Food & Drinks" pointed at "services-food & drinks"
              and labelled nothing at all. */}
          {CONCIERGE_SERVICE_GROUPS.map((group) => (
            <section
              className="min-w-0 px-[clamp(12px,_1.8vw,_24px)] py-5.5 not-first:border-l
                not-first:border-solid not-first:border-l-border
                [&:nth-child(3)]:max-[900.001px]:border-t [&:nth-child(3)]:max-[900.001px]:border-solid
                [&:nth-child(3)]:max-[900.001px]:border-t-border [&:nth-child(3)]:max-[900.001px]:border-l-0
                [&:nth-child(4)]:max-[900.001px]:border-t [&:nth-child(4)]:max-[900.001px]:border-solid
                [&:nth-child(4)]:max-[900.001px]:border-t-border max-[760.001px]:px-0 max-[760.001px]:py-4.5
                not-first:max-[760.001px]:border-t not-first:max-[760.001px]:border-solid
                not-first:max-[760.001px]:border-t-border not-first:max-[760.001px]:border-l-0"
              key={group.id}
              aria-labelledby={`services-${group.id}`}
            >
              <h4 className="mt-0 mb-3 mx-0 text-[12px] font-extrabold tracking-[0.08em] uppercase text-muted-text" id={`services-${group.id}`}>{group.label}</h4>
              <div className="grid gap-1">
                {group.services.map((service) => {
                  const Icon = SERVICE_ICONS[CONCIERGE_SERVICE_DETAILS[service].icon];
                  return (
                    <label
                      key={service}
                      className="relative grid grid-cols-[24px_minmax(0,_1fr)_20px] items-start min-h-14 text-body-text
                        cursor-pointer [transition:background-color_0.16s_ease,_color_0.16s_ease] px-2 py-2.75 gap-2.5 rounded-[8px]
                        hover:bg-[rgba(57,_67,_66,_0.06)] has-[input:checked]:bg-[#e6eeea]
                        has-[input:checked]:shadow-[inset_0_0_0_1px_#394342] focus-within:[outline:2px_solid_var(--color-heading)]
                        focus-within:outline-offset-[2px] forced-colors:[forced-color-adjust:auto] forced-colors:border
                        forced-colors:border-solid forced-colors:border-[ButtonText] has-[input:checked]:forced-colors:[outline:2px_solid_Highlight]
                        has-[input:checked]:forced-colors:outline-offset-2 has-[input:checked]:forced-colors:shadow-none
                        forced-colors:focus-within:[outline:3px_double_Highlight] forced-colors:focus-within:outline-offset-[3px]
                        motion-reduce:transition-none max-[760.001px]:px-2.5"
                    >
                      <input
                        className="absolute size-0.25 overflow-hidden [clip:rect(0,_0,_0,_0)] -m-px forced-colors:top-3.5 forced-colors:right-3.5 forced-colors:size-5 forced-colors:overflow-visible forced-colors:[clip:auto] forced-colors:m-0"
                        type="checkbox"
                        name="services"
                        value={service}
                        checked={services.includes(service)}
                        onChange={() => toggleService(service)}
                      />
                      <Icon className="mt-0.5 text-[#566560]" size={21} strokeWidth={1.7} aria-hidden="true" />
                      <span>
                        <strong className={`block font-semibold ${services.includes(service) ? "text-[#26312f]" : "text-heading"}`}>{CONCIERGE_SERVICE_LABELS[service]}</strong>
                        <small className="block mt-0.75 text-[12px] leading-[1.4] text-muted-text">{CONCIERGE_SERVICE_DETAILS[service].description}</small>
                      </span>
                      <CheckCircle2 className={`mt-0.5 text-[#394342] forced-colors:hidden ${services.includes(service) ? "opacity-100" : "opacity-0"}`} size={19} aria-hidden="true" />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        </>
        )}
      </fieldset>

      {/*
        Something at the foot of the picker while nothing is chosen.

        The form's fields only appear once a service is ticked, so a guest who
        reads the whole list and picks nothing reached the end of the page at
        "Horseback riding" -- no close, no next step, no way out but the back
        button. This says what a tick leads to, and offers the human path for
        anyone who would rather write than choose from a list.
      */}
      {services.length === 0 && (
        <div className="w-[min(100%,_820px)] pt-1 text-body-text text-[14px] leading-[1.55] text-center mx-auto [&_p]:m-0 [&_p+p]:mt-1.5
          [&_strong]:font-heading [&_strong]:text-[16px] [&_strong]:font-medium [&_strong]:text-heading">
          <p>
            <strong>Pick anything above and we take it from there.</strong>
          </p>
          <p>
            We will ask for your dates and how to reach you — nothing else. Rather talk it through?
            Write to <a href={`mailto:${fallbackEmail}`}>{fallbackEmail}</a> and tell us what you
            have in mind.
          </p>
        </div>
      )}

      {services.length > 0 && (
        <div className="grid w-[min(100%,_820px)] bg-[#f7f4ed] mx-auto p-[clamp(24px,_4vw,_44px)] gap-5.5 rounded-[14px] border border-solid border-[#394342]/12
          max-[760.001px]:-mx-1 max-[760.001px]:px-4.5 max-[760.001px]:py-6 max-[760.001px]:gap-5 max-[760.001px]:rounded-[10px]" ref={details}>
          <div className="flex flex-wrap justify-between gap-y-2.5 gap-x-6 pb-3.5 border-b border-solid border-b-border [&_p]:inline-flex [&_p]:items-center
            [&_p]:font-[650] [&_p]:text-heading [&_p]:m-0 [&_p]:gap-2.25 [&_p_svg]:text-[#566560]" aria-live="polite">
            <p>
              <Waves size={18} aria-hidden="true" />
              <span>Selected: {services.map((service) => CONCIERGE_SERVICE_LABELS[service]).join(", ")}</span>
            </p>
            <div className="concierge-form__context flex flex-wrap gap-2 [&_span]:inline-flex [&_span]:items-center [&_span]:bg-[#f2eee6] [&_span]:text-[12px]
              [&_span]:text-body-text [&_span]:px-2.25 [&_span]:py-1 [&_span]:gap-1.25 [&_span]:rounded-full">
              <span>
                <MapPin size={13} aria-hidden="true" />
                El Salvador
              </span>
              {listingTitle && <span>{listingTitle}</span>}
              {tripDates(checkIn, checkOut) && <span>{tripDates(checkIn, checkOut)}</span>}
            </div>
          </div>

          <div className="grid mt-0.5 mb-1 mx-0 gap-1.75 [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[clamp(30px,_4vw,_42px)]
            [&_h3]:font-medium [&_h3]:leading-[1.08] [&_h3]:tracking-[-0.025em] [&_h3]:text-[#26312f] [&_h3]:m-0 [&_p]:text-[15px]
            [&_p]:leading-[1.55] [&_p]:text-body-text [&_p]:m-0 [&_h3]:max-[760.001px]:text-[clamp(30px,_10vw,_38px)]">
            <h3>Your trip details</h3>
            <p>A few details help us arrange the right people and timing.</p>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-y-4.5 gap-x-5.5 max-[960.001px]:grid-cols-1">
            <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
              <Label htmlFor="concierge-name">Name</Label>
              <Input
                id="concierge-name"
                className={INPUT_CLASS}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Your full name"
                maxLength={120}
                required
              />
            </div>
            <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
              <Label htmlFor="concierge-email">Email</Label>
              <Input
                id="concierge-email"
                className={INPUT_CLASS}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={200}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-y-4.5 gap-x-5.5 max-[960.001px]:grid-cols-1">
            <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
              <Label htmlFor="concierge-phone">Phone (optional)</Label>
              <PhoneNumberField id="concierge-phone" value={phone} onChange={setPhone}
                className="min-h-13 bg-white/68 shadow-none text-[#26312f] [font-family:inherit] text-[15px] [font-weight:inherit]
                  [font-style:inherit] leading-[inherit] [font-variant:inherit] transition-[border-color,box-shadow,background-color] duration-160 ease-[ease]
                  px-3.75 py-3.25 gap-2.5 rounded-[8px] border-[#394342]/28 hover:bg-white/90 hover:border-[#394342]/52
                  focus-within:bg-white/96 focus-within:shadow-[0_0_0_3px_rgba(57,67,66,0.13)] focus-within:outline-none focus-within:border-[#394342]
                  [&_.PhoneInputInput]:min-h-6 [&_.PhoneInputInput]:leading-[inherit] [&_.PhoneInputInput::placeholder]:text-[#26312f]/50 [&_.PhoneInputInput::placeholder]:opacity-100
                  motion-reduce:transition-none" />
            </div>
            <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
              <Label htmlFor="concierge-guests">Guests (optional)</Label>
              <Select value={guests} onValueChange={setGuests}>
                <SelectTrigger id="concierge-guests" className={SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="How many of you?" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-y-4.5 gap-x-5.5 max-[960.001px]:grid-cols-1">
            <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
              <Label htmlFor="concierge-check-in">Arriving (optional)</Label>
              <BookingDatePicker
                id="concierge-check-in"
                className={DATE_PICKER_CLASS}
                min={todayIso()}
                value={checkIn}
                onChange={setCheckIn}
                placeholder="Add a date"
              />
            </div>
            <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
              <Label htmlFor="concierge-check-out">Leaving (optional)</Label>
              <BookingDatePicker
                id="concierge-check-out"
                className={DATE_PICKER_CLASS}
                min={checkIn || todayIso()}
                value={checkOut}
                onChange={setCheckOut}
                placeholder="Add a date"
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
            <Label htmlFor="concierge-message">Notes (optional)</Label>
            <Textarea
              id="concierge-message"
              className="min-w-0 min-h-28 resize-y bg-white/68 shadow-none text-[#26312f] [font-family:inherit] text-[15px] [font-weight:inherit]
                [font-style:inherit] leading-[inherit] [font-variant:inherit] transition-[border-color,box-shadow,background-color] duration-160 ease-[ease]
                px-3.75 py-3.25 rounded-[8px] border-solid border-[#394342]/28 placeholder:text-[#26312f]/50 placeholder:opacity-100
                hover:enabled:bg-white/90 hover:enabled:border-[#394342]/52 focus-visible:bg-white/96
                focus-visible:shadow-[0_0_0_3px_rgba(57,67,66,0.13)] focus-visible:outline-none focus-visible:border-[#394342] motion-reduce:transition-none"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Flight times, celebrations, must-see places, or anything useful."
            />
          </div>

          <div className="grid gap-4">
            <button
              type="button"
              className="flex items-center justify-between min-h-15.5 bg-[rgba(255,_255,_255,_0.44)] text-heading [font-family:inherit] [font-size:inherit]
                [font-weight:inherit] [font-style:inherit] leading-[inherit] [font-variant:inherit] text-left cursor-pointer
                [transition:border-color_0.16s_ease,_background-color_0.16s_ease] px-3.5 py-2.75 gap-4.5 rounded-[8px] border border-solid
                border-[rgba(57,_67,_66,_0.18)] hover:bg-[rgba(255,_255,_255,_0.72)] hover:border-[rgba(57,_67,_66,_0.42)]
                focus-visible:shadow-[0_0_0_3px_rgba(57,_67,_66,_0.13)] focus-visible:[outline:none] focus-visible:border-[#394342]
                motion-reduce:transition-none"
              aria-expanded={wantsCall}
              aria-controls="concierge-call-fields"
              onClick={() => setWantsCall((current) => !current)}
            >
              <span className="flex items-center gap-3 [&>svg]:flex-none [&>svg]:text-[#566560] [&>span]:grid [&>span]:gap-0.5 [&_strong]:text-[15px]
                [&_strong]:font-[650] [&_strong]:text-[#26312f] [&_small]:text-muted-text [&_small]:text-[13px] [&_small]:font-medium">
                <PhoneCall size={19} aria-hidden="true" />
                <span>
                  <strong>Prefer a call?</strong>
                  <small>{wantsCall ? "Hide call options" : "Choose a day and time"}</small>
                </span>
              </span>
              <ChevronDown
                className={`flex-none transition-transform duration-200 ease-[ease] motion-reduce:transition-none ${wantsCall ? "rotate-180" : ""}`}
                size={18}
                aria-hidden="true"
              />
            </button>
            {wantsCall && (
              <div className="grid grid-cols-[1fr_1fr] gap-y-4.5 gap-x-5.5 max-[960.001px]:grid-cols-1" id="concierge-call-fields">
                <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
                  <Label htmlFor="concierge-call-day">Preferred call day</Label>
                  <BookingDatePicker
                    id="concierge-call-day"
                    className={DATE_PICKER_CLASS}
                    min={todayIso()}
                    value={callDay}
                    onChange={setCallDay}
                    placeholder="Any day"
                  />
                </div>
                <div className="grid min-w-0 gap-2 [&>label]:text-[14px] [&>label]:font-[650] [&>label]:leading-[1.3] [&>label]:text-[#26312f]">
                  <Label htmlFor="concierge-call-window">Preferred call time</Label>
                  <Select value={callWindow} onValueChange={setCallWindow}>
                    <SelectTrigger id="concierge-call-window" className={SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      {CALL_WINDOWS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="grid min-h-0 gap-3" aria-live="polite">
            {error && (
              <p className="flex items-center bg-[rgba(186,_26,_26,_0.08)] text-[rgb(143,_30,_24)] text-[13px] m-0 px-3 py-2.5 gap-2 rounded-[8px]
                [&_svg]:flex-none" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-y-4.5 gap-x-7 max-[760.001px]:grid max-[760.001px]:gap-3">
            <Button type="submit" data-umami-event="concierge_click" data-umami-event-source="concierge" className="inline-flex justify-between min-w-[min(100%,_286px)] min-h-13.5 bg-[#263f38] text-[#f8f5ee] text-[16px] font-semibold shadow-none
              px-5 py-3.5 gap-7 rounded-[7px] border border-solid border-[#26312f] [&:hover:not(:disabled)]:bg-[#1e332d]
              focus-visible:[outline:2px_solid_#26312f] focus-visible:outline-offset-[3px] max-[760.001px]:w-full">
              Send my request
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
            <p className="inline-flex items-center text-muted-text text-[13px] m-0 gap-2 [&_svg]:flex-none [&_svg]:text-[#566560]
              max-[760.001px]:[justify-self:center] max-[760.001px]:text-center">
              <ShieldCheck size={17} aria-hidden="true" />
              No commitment. We’ll reply personally.
            </p>
          </div>
        </div>
      )}

      {/* The honeypot. Hidden from people, filled in by bots. */}
      <div className="absolute left-[-9999px] w-0.25 h-0.25 overflow-hidden" aria-hidden="true">
        <label htmlFor="concierge-website">Website</label>
        <input
          id="concierge-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

    </form>
  );
}
