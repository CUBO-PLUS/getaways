/*
 * What a stay costs, line by line.
 *
 * Pure arithmetic, no database and no request: the checkout renders it, the
 * server recomputes it before taking a payment, and both have to arrive at the
 * same number or the guest is shown one figure and charged another. Keeping it
 * here, with no I/O, is what makes that testable.
 *
 * Everything is in CENTS, integers throughout. Money in floating point is the
 * classic way to charge $1,274.9999999998.
 */

export const IVA_RATE = 0.13;

/**
 * El Salvador's tourism tax on lodging, charged alongside IVA.
 *
 * The owner's own rate sheet reads "13+5" on ten of eleven units -- IVA plus
 * tourism -- and this quote charged 13 and nothing else, so every booking taken
 * through the site collected five points of tax less than the business owes.
 * That is the reason this constant exists.
 *
 * It is the DEFAULT rather than the law: a property can set `tourism_tax` in
 * its attributes to any percentage, including 0, which is what the one unit
 * marked "none" needs. Defaulting to 5 rather than 0 is deliberate -- a
 * property with nothing recorded is far likelier to owe the tax than to be
 * exempt, and the failure mode of the wrong default is a debt to the tax
 * authority rather than a guest who was quoted a cent too much.
 */
export const TOURISM_RATE = 0.05;

export type QuoteInput = {
  nights: number;
  /** Per night, before anything else. */
  pricePerNightCents: number;
  cleaningFeeCents: number;
  /** Guests the nightly rate already covers. */
  baseGuests: number;
  /** Charged per extra guest, per night. */
  extraGuestFeeCents: number;
  /** Charged once for the stay, not per night. */
  petFeeCents: number;
  /** What the guest says they are bringing. */
  guests: number;
  withPet: boolean;
  discount?: { kind: "percent" | "amount"; value: number } | null;
  /**
   * Tourism tax as a fraction, e.g. 0.05. Absent means TOURISM_RATE; an
   * explicit 0 means the property is exempt.
   */
  tourismRate?: number;
  /** IVA as a fraction. Absent means IVA_RATE (13%). */
  ivaRate?: number;
};

export type QuoteLine = { label: string; amountCents: number };

export type Quote = {
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  /** What the two taxes are charged on: everything except the cleaning fee. */
  taxableCents: number;
  /** IVA at 13%. */
  taxCents: number;
  /** Tourism tax, at the property's rate. */
  tourismCents: number;
  /** IVA + tourism, which is what the booking row records as `tax_cents`. */
  taxTotalCents: number;
  totalCents: number;
  extraGuests: number;
};

/**
 * The discount a coupon is worth against a subtotal.
 *
 * Clamped to the subtotal: a $500 coupon on a $300 stay is a $300 discount,
 * not a $200 refund. Rounded to whole cents, and never negative.
 */
export function discountCents(
  subtotalCents: number,
  discount: { kind: "percent" | "amount"; value: number } | null | undefined
): number {
  if (!discount || !Number.isFinite(discount.value) || discount.value <= 0) return 0;
  if (subtotalCents <= 0) return 0;
  if (!Number.isSafeInteger(subtotalCents)) throw new RangeError("Subtotal cannot be represented safely in cents.");
  const [numerator, denominator] = decimalRatio(discount.value);
  const raw = discount.kind === "percent"
    ? roundRatio(BigInt(subtotalCents) * numerator, denominator * 100n)
    : roundRatio(numerator * 100n, denominator);
  return Number(raw > BigInt(subtotalCents) ? BigInt(subtotalCents) : raw);
}

function decimalRatio(value: number): [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Rate cannot be represented safely.");
  const text = value.toString().toLowerCase();
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) throw new RangeError("Rate cannot be represented safely.");
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0) - fraction.length;
  let numerator = BigInt(`${match[1]}${fraction}`);
  let denominator = 1n;
  if (exponent < 0) denominator = 10n ** BigInt(-exponent);
  else numerator *= 10n ** BigInt(exponent);
  return [numerator, denominator];
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function safeCents(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Stay total cannot be represented safely in cents.");
  }
  return Number(value);
}

/** Guests beyond what the nightly rate covers. Never negative. */
export function extraGuestCount(guests: number, baseGuests: number): number {
  if (!Number.isFinite(guests) || !Number.isFinite(baseGuests)) return 0;
  return Math.max(0, Math.floor(guests) - Math.floor(baseGuests));
}

/**
 * The whole bill.
 *
 * Order matters and every step of it is deliberate:
 *
 *   nights x rate + cleaning + extra guests + pet     = subtotal
 *   subtotal - discount                               = payable
 *   payable - the cleaning fee                        = taxable
 *   taxable + 13% IVA + tourism                       = total
 *
 * **The discount comes off before tax**, so a guest is not taxed on money they
 * did not pay -- and it is the only order in which a percentage coupon means
 * what it says: 10% off a $1,000 stay takes $100 off the bill, not $113.
 *
 * **The cleaning fee is outside the tax base**, which is the owner's own rule:
 * the rate sheet says "Cleaning-fee tax 0% -- IVA baked in", and the
 * arithmetic proves it, because every fee on that sheet is a round number
 * multiplied by 1.13 (150 -> 169.50, 130 -> 146.90, 90 -> 101.70,
 * 75 -> 84.75). Taxing it again charged the guest IVA twice on that line.
 *
 * So this function corrects two errors that ran in opposite directions: tax
 * was missing on the stay (no tourism tax at all) and doubled on the cleaning.
 */
export function quoteStay(input: QuoteInput): Quote {
  const counts = [input.nights, input.guests, input.baseGuests];
  const fees = [input.pricePerNightCents, input.cleaningFeeCents, input.extraGuestFeeCents, input.petFeeCents];
  if (!counts.every(Number.isSafeInteger) || input.nights <= 0 || input.guests <= 0 || input.baseGuests < 0 ||
    !fees.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError("Stay dates, guests, or prices cannot be represented safely.");
  }
  const nights = input.nights;
  const extraGuests = Math.max(0, input.guests - input.baseGuests);

  const stayCents = safeCents(BigInt(nights) * BigInt(input.pricePerNightCents));
  const cleaningCents = input.cleaningFeeCents;
  const extraGuestCents = safeCents(BigInt(extraGuests) * BigInt(input.extraGuestFeeCents) * BigInt(nights));
  const petCents = input.withPet ? input.petFeeCents : 0;

  const lines: QuoteLine[] = [];
  if (stayCents > 0 || nights > 0) {
    lines.push({ label: `${nights} ${nights === 1 ? "night" : "nights"}`, amountCents: stayCents });
  }
  if (cleaningCents > 0) lines.push({ label: "Cleaning fee", amountCents: cleaningCents });
  if (extraGuestCents > 0) {
    lines.push({
      label: `${extraGuests} extra ${extraGuests === 1 ? "guest" : "guests"}`,
      amountCents: extraGuestCents,
    });
  }
  if (petCents > 0) lines.push({ label: "Pet fee", amountCents: petCents });

  const subtotalCents = safeCents(BigInt(stayCents) + BigInt(cleaningCents) + BigInt(extraGuestCents) + BigInt(petCents));
  const discount = discountCents(subtotalCents, input.discount);
  const payableCents = subtotalCents - discount;

  /*
   * The cleaning fee comes out of the tax base, floored at zero: a discount
   * big enough to wipe out the whole stay must not produce a NEGATIVE taxable
   * amount, which would hand the guest a tax refund on top of the discount.
   */
  const taxableCents = Math.max(0, payableCents - cleaningCents);
  const tourismRate =
    Number.isFinite(input.tourismRate) && (input.tourismRate as number) >= 0
      ? (input.tourismRate as number)
      : TOURISM_RATE;
  const ivaRate =
    Number.isFinite(input.ivaRate) && (input.ivaRate as number) >= 0 ? (input.ivaRate as number) : IVA_RATE;

  // Rounded separately, because each one is a line the guest reads and a
  // figure the business declares; rounding the sum would leave the lines not
  // adding up to the total.
  const [ivaNumerator, ivaDenominator] = decimalRatio(ivaRate);
  const [tourismNumerator, tourismDenominator] = decimalRatio(tourismRate);
  const taxCents = safeCents(roundRatio(BigInt(taxableCents) * ivaNumerator, ivaDenominator));
  const tourismCents = safeCents(roundRatio(BigInt(taxableCents) * tourismNumerator, tourismDenominator));
  const taxTotalCents = safeCents(BigInt(taxCents) + BigInt(tourismCents));

  return {
    lines,
    subtotalCents,
    discountCents: discount,
    taxableCents,
    taxCents,
    tourismCents,
    taxTotalCents,
    totalCents: safeCents(BigInt(payableCents) + BigInt(taxTotalCents)),
    extraGuests,
  };
}

/**
 * Reads the money fields off a listing's attributes bag.
 *
 * Everything is optional and everything absent means zero, which is what nine
 * of the nine listings currently say: only `price` and `guests` are filled in
 * today, so a stay is nights x rate until somebody enters the rest in the
 * admin. A missing fee must never become a NaN that propagates into a total.
 *
 * Nightly rate, cleaning and extra-guest fee come straight from the listing
 * attributes; a blank one counts as zero. The rates are fixed by the site.
 */

/** A listing attribute as the display and the quote read it: the value, or undefined when blank. */
export function attrValue(attrs: Record<string, string> | null | undefined, key: string): string | undefined {
  const value = (attrs ?? {})[key];
  return String(value ?? "").trim() !== "" ? value : undefined;
}

export function priceFieldsFromAttributes(attributes: Record<string, string> | null | undefined): {
  pricePerNightCents: number;
  cleaningFeeCents: number;
  extraGuestFeeCents: number;
  petFeeCents: number;
  baseGuests: number;
  maxGuests: number;
  petsAllowed: boolean;
  tourismRate: number;
  ivaRate: number;
} {
  const attrs = attributes ?? {};

  const money = (raw: string | undefined) => {
    const text = String(raw ?? "");
    /* The minus is checked BEFORE the currency symbols are stripped. Removing
       everything that is not a digit or a point turns "-20" into "20", so a
       fee typed as negative in the admin came back as a positive charge --
       caught by a test, not by reading. */
    if (text.includes("-")) return 0;
    const normalized = text.replace(/[^0-9.]/g, "");
    const match = /^(\d+)(?:\.(\d*))?$/.exec(normalized);
    if (!match) return 0;
    const fraction = match[2] ?? "";
    if (/[^0]/.test(fraction.slice(2))) throw new RangeError("A price has fractions smaller than one cent.");
    const cents = BigInt(match[1]) * 100n + BigInt((fraction.slice(0, 2) + "00").slice(0, 2));
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("A price cannot be represented safely in cents.");
    return Number(cents);
  };
  const count = (raw: string | undefined) => {
    const text = String(raw ?? "").trim();
    if (!/^\d+$/.test(text)) return 0;
    const value = Number(text);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  };

  /*
   * A percentage field ("5", "13", or "none"/"0" for exempt) with a default
   * for anything absent or unreadable -- shared by tourism_tax and IVA. The
   * minus check happens BEFORE the strip, same trap `money()` above avoids:
   * removing everything that is not a digit or a point turns "-3" into "3",
   * so a rate typed as negative would come back as a positive 3% charge
   * instead of falling back to the default. Caught by a test, both times.
   */
  const percentOrDefault = (raw: string | undefined, defaultRate: number): number => {
    const text = String(raw ?? "").trim();
    if (/^none$/i.test(text)) return 0;
    if (text === "" || text.includes("-")) return defaultRate;
    const percent = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
    return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent / 100 : defaultRate;
  };

  const tourismRate = percentOrDefault(attrValue(attrs, "tourism_tax"), TOURISM_RATE);
  const ivaRate = percentOrDefault(attrs.iva, IVA_RATE);

  const capacity = count(attrs.guests);
  // `base_guests` is what the rate covers; `guests` stays what it always was,
  // the most the property sleeps. With no base recorded, nobody is an extra
  // guest -- the safe direction, since the alternative silently bills people.
  const baseGuests = count(attrs.base_guests) || capacity;

  return {
    pricePerNightCents: money(attrValue(attrs, "price")),
    cleaningFeeCents: money(attrValue(attrs, "cleaning_fee")),
    extraGuestFeeCents: money(attrValue(attrs, "extra_guest_fee")),
    petFeeCents: money(attrs.pet_fee),
    baseGuests,
    maxGuests: capacity,
    petsAllowed: attrValue(attrs, "pets_allowed") === undefined
      ? money(attrs.pet_fee) > 0
      : attrs.pets_allowed === "1" || attrs.pets_allowed === "true",
    tourismRate,
    ivaRate,
  };
}
