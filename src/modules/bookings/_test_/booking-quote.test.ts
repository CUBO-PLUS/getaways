import { describe, expect, it } from "vitest";

import {
  discountCents,
  extraGuestCount,
  IVA_RATE,
  priceFieldsFromAttributes,
  quoteStay,
  TOURISM_RATE,
  attrValue,
} from "@/modules/bookings/booking-quote";

/*
 * The arithmetic a guest is charged on. Every case here is a number somebody
 * would notice on their card statement, so the assertions are exact figures
 * rather than "greater than zero".
 */

const BASE = {
  nights: 3,
  pricePerNightCents: 42_500,
  cleaningFeeCents: 0,
  baseGuests: 4,
  extraGuestFeeCents: 0,
  petFeeCents: 0,
  guests: 2,
  withPet: false,
};

describe("quoteStay", () => {
  it("prices the simplest stay there is: nights times the rate, plus both taxes", () => {
    // What every listing in the catalogue costs today -- only `price` and
    // `guests` are filled in, so every other line is absent rather than zero.
    const quote = quoteStay(BASE);
    expect(quote.subtotalCents).toBe(127_500);
    expect(quote.discountCents).toBe(0);
    expect(quote.taxCents).toBe(16_575); // IVA, 13%
    expect(quote.tourismCents).toBe(6_375); // tourism, 5%
    expect(quote.taxTotalCents).toBe(22_950);
    expect(quote.totalCents).toBe(150_450);
    expect(quote.lines).toEqual([{ label: "3 nights", amountCents: 127_500 }]);
  });

  it("charges an extra guest per night, not once", () => {
    const quote = quoteStay({ ...BASE, guests: 6, extraGuestFeeCents: 2_500 });
    expect(quote.extraGuests).toBe(2);
    // 2 guests x $25 x 3 nights.
    expect(quote.lines).toContainEqual({ label: "2 extra guests", amountCents: 15_000 });
    expect(quote.subtotalCents).toBe(142_500);
  });

  it("charges the pet once for the stay, however long it is", () => {
    const three = quoteStay({ ...BASE, withPet: true, petFeeCents: 5_000 });
    const ten = quoteStay({ ...BASE, nights: 10, withPet: true, petFeeCents: 5_000 });
    expect(three.lines).toContainEqual({ label: "Pet fee", amountCents: 5_000 });
    expect(ten.lines).toContainEqual({ label: "Pet fee", amountCents: 5_000 });
  });

  it("leaves out every line that is zero rather than printing it", () => {
    // A row saying "Pet fee $0.00" invites the question of what it is for.
    const quote = quoteStay(BASE);
    expect(quote.lines.map((line) => line.label)).toEqual(["3 nights"]);
  });

  it("takes the discount off BEFORE tax", () => {
    /*
     * The order is the whole point. 10% off a $1,275 stay has to take $127.50
     * off the bill; taxing first and discounting after would take $144.08 and
     * make the coupon mean something different from what it says.
     */
    const quote = quoteStay({ ...BASE, discount: { kind: "percent", value: 10 } });
    expect(quote.subtotalCents).toBe(127_500);
    expect(quote.discountCents).toBe(12_750);
    expect(quote.taxableCents).toBe(114_750);
    expect(quote.taxCents).toBe(14_918);
    expect(quote.tourismCents).toBe(5_738);
    expect(quote.totalCents).toBe(135_406);
  });

  it("adds thirteen per cent of IVA and five of tourism tax", () => {
    /*
     * The rate sheet reads "13+5" on every active property, and this quote
     * used to charge 13 and stop -- five points of tax the business owes and
     * was not collecting. $100 of stay is now $118.
     */
    const quote = quoteStay({ ...BASE, nights: 1, pricePerNightCents: 10_000 });
    expect(quote.taxCents).toBe(Math.round(10_000 * IVA_RATE));
    expect(quote.tourismCents).toBe(Math.round(10_000 * TOURISM_RATE));
    expect(quote.totalCents).toBe(11_800);
  });

  it("charges the property's own tourism rate, and honours an exemption", () => {
    // One unit on the rate sheet says "none". An explicit 0 has to mean zero,
    // not "fall back to the default", or that property cannot be exempt.
    const exempt = quoteStay({ ...BASE, nights: 1, pricePerNightCents: 10_000, tourismRate: 0 });
    expect(exempt.tourismCents).toBe(0);
    expect(exempt.totalCents).toBe(11_300);

    const ten = quoteStay({ ...BASE, nights: 1, pricePerNightCents: 10_000, tourismRate: 0.1 });
    expect(ten.tourismCents).toBe(1_000);
    expect(ten.totalCents).toBe(12_300);
  });

  it("falls back to the default rate rather than to zero when none is given", () => {
    /*
     * The direction of this fallback is deliberate. A property with nothing
     * recorded is far likelier to owe the tax than to be exempt, and the cost
     * of guessing wrong the other way is a debt to the tax authority.
     */
    for (const rate of [undefined, Number.NaN, -1]) {
      const quote = quoteStay({ ...BASE, nights: 1, pricePerNightCents: 10_000, tourismRate: rate });
      expect(quote.tourismCents, String(rate)).toBe(500);
    }
  });

  describe("the cleaning fee is outside the tax base", () => {
    /*
     * The owner's rate sheet says "Cleaning-fee tax 0% -- IVA baked in", and
     * the arithmetic proves it: every fee on that sheet is a round number
     * times 1.13 (150 -> 169.50, 90 -> 101.70, 75 -> 84.75). Taxing it again
     * charged the guest IVA twice on that line.
     */
    it("taxes the stay but not the cleaning", () => {
      const quote = quoteStay({ ...BASE, nights: 1, pricePerNightCents: 10_000, cleaningFeeCents: 16_950 });
      expect(quote.subtotalCents).toBe(26_950);
      expect(quote.taxableCents).toBe(10_000);
      expect(quote.taxCents).toBe(1_300);
      expect(quote.tourismCents).toBe(500);
      // The cleaning fee passes through untaxed: 269.50 + 13.00 + 5.00.
      expect(quote.totalCents).toBe(28_750);
    });

    it("taxes the extra guests and the pet, which are not cleaning", () => {
      const quote = quoteStay({
        ...BASE,
        nights: 1,
        pricePerNightCents: 10_000,
        cleaningFeeCents: 10_000,
        guests: 5,
        extraGuestFeeCents: 5_000,
        withPet: true,
        petFeeCents: 10_000,
      });
      // Taxable: 100 stay + 50 extra guest + 100 pet = 250. Cleaning is out.
      expect(quote.taxableCents).toBe(25_000);
      expect(quote.taxCents).toBe(3_250);
      expect(quote.tourismCents).toBe(1_250);
    });

    it("cannot produce a negative tax base when the discount exceeds the stay", () => {
      // A coupon big enough to wipe out the stay must not hand back tax on
      // top of the discount.
      const quote = quoteStay({
        ...BASE,
        nights: 1,
        pricePerNightCents: 10_000,
        cleaningFeeCents: 10_000,
        discount: { kind: "percent", value: 100 },
      });
      expect(quote.discountCents).toBe(20_000);
      expect(quote.taxableCents).toBe(0);
      expect(quote.taxCents).toBe(0);
      expect(quote.tourismCents).toBe(0);
      expect(quote.totalCents).toBe(0);
    });
  });

  it("adds up: every line, minus the discount, plus the tax", () => {
    const quote = quoteStay({
      ...BASE,
      cleaningFeeCents: 6_000,
      guests: 5,
      extraGuestFeeCents: 2_000,
      withPet: true,
      petFeeCents: 4_000,
      discount: { kind: "amount", value: 50 },
    });
    const lines = quote.lines.reduce((sum, line) => sum + line.amountCents, 0);
    expect(lines).toBe(quote.subtotalCents);
    // The tax base is what is payable MINUS the cleaning fee.
    expect(quote.taxableCents).toBe(quote.subtotalCents - quote.discountCents - 6_000);
    // And the two taxes add up to the one figure the booking row stores.
    expect(quote.taxTotalCents).toBe(quote.taxCents + quote.tourismCents);
    expect(quote.totalCents).toBe(quote.subtotalCents - quote.discountCents + quote.taxTotalCents);
  });

  it("rejects invalid inputs rather than silently pricing a different stay", () => {
    // Guest counts and fees arrive from a form. None of them may produce a
    // credit.
    expect(() => quoteStay({
      ...BASE,
      guests: -5,
      extraGuestFeeCents: -100,
      petFeeCents: -100,
      withPet: true,
      nights: -2,
    })).toThrow(RangeError);
  });

  it("rounds tax exactly even for large representable totals", () => {
    const quote = quoteStay({ ...BASE, nights: 1, pricePerNightCents: 6_000_000_000_000_011, ivaRate: 0.13, tourismRate: 0 });
    expect(quote.taxCents).toBe(780_000_000_000_001);
    expect(quote.totalCents).toBe(6_780_000_000_000_012);
  });

  it("rejects unrepresentable products and totals instead of losing cents", () => {
    expect(() => quoteStay({ ...BASE, nights: 2, pricePerNightCents: Number.MAX_SAFE_INTEGER, ivaRate: 0, tourismRate: 0 })).toThrow(RangeError);
    expect(() => quoteStay({ ...BASE, nights: 1, pricePerNightCents: Number.MAX_SAFE_INTEGER, ivaRate: 0.13, tourismRate: 0 })).toThrow(RangeError);
  });
});

describe("discountCents", () => {
  it("works in per cent and in dollars", () => {
    expect(discountCents(100_000, { kind: "percent", value: 25 })).toBe(25_000);
    expect(discountCents(100_000, { kind: "amount", value: 40 })).toBe(4_000);
  });

  it("never gives back more than the stay costs", () => {
    // A $500 coupon on a $300 stay is a $300 discount, not a $200 refund.
    expect(discountCents(30_000, { kind: "amount", value: 500 })).toBe(30_000);
    expect(discountCents(30_000, { kind: "percent", value: 150 })).toBe(30_000);
  });

  it("is nothing for nothing", () => {
    expect(discountCents(100_000, null)).toBe(0);
    expect(discountCents(100_000, undefined)).toBe(0);
    expect(discountCents(100_000, { kind: "percent", value: 0 })).toBe(0);
    expect(discountCents(100_000, { kind: "amount", value: -20 })).toBe(0);
    expect(discountCents(0, { kind: "percent", value: 50 })).toBe(0);
  });
});

describe("extraGuestCount", () => {
  it("counts only the guests beyond what the rate covers", () => {
    expect(extraGuestCount(6, 4)).toBe(2);
    expect(extraGuestCount(4, 4)).toBe(0);
    expect(extraGuestCount(2, 4)).toBe(0);
  });

  it("refuses nonsense", () => {
    expect(extraGuestCount(Number.NaN, 4)).toBe(0);
    expect(extraGuestCount(6, Number.NaN)).toBe(0);
  });
});

describe("priceFieldsFromAttributes", () => {
  it("reads the money out of the attributes bag", () => {
    const fields = priceFieldsFromAttributes({
      price: "425",
      cleaning_fee: "60",
      extra_guest_fee: "25",
      pet_fee: "40",
      guests: "6",
      base_guests: "4",
    });
    expect(fields).toEqual({
      pricePerNightCents: 42_500,
      cleaningFeeCents: 6_000,
      extraGuestFeeCents: 2_500,
      petFeeCents: 4_000,
      baseGuests: 4,
      maxGuests: 6,
      petsAllowed: true,
      tourismRate: TOURISM_RATE,
      ivaRate: IVA_RATE,
    });
  });

  describe("tourism_tax", () => {
    it("reads a percentage the way the rate sheet writes it", () => {
      expect(priceFieldsFromAttributes({ tourism_tax: "5" }).tourismRate).toBe(0.05);
      expect(priceFieldsFromAttributes({ tourism_tax: "10" }).tourismRate).toBe(0.1);
      expect(priceFieldsFromAttributes({ tourism_tax: "2.5" }).tourismRate).toBe(0.025);
    });

    it("takes 0 and the word the sheet uses for it", () => {
      expect(priceFieldsFromAttributes({ tourism_tax: "0" }).tourismRate).toBe(0);
      expect(priceFieldsFromAttributes({ tourism_tax: "none" }).tourismRate).toBe(0);
      expect(priceFieldsFromAttributes({ tourism_tax: "None" }).tourismRate).toBe(0);
    });

    it("falls back to the default when it is absent or unreadable", () => {
      for (const raw of [undefined, "", "  ", "five per cent", "-3", "150"]) {
        expect(
          priceFieldsFromAttributes(raw === undefined ? {} : { tourism_tax: raw }).tourismRate,
          String(raw)
        ).toBe(TOURISM_RATE);
      }
    });
  });

  it("survives the nine listings as they are recorded today", () => {
    // Only `price` and `guests` are set on any of them. Every other fee has
    // to read as absent, not as NaN leaking into a total.
    const fields = priceFieldsFromAttributes({ price: "425", guests: "4" });
    expect(fields.cleaningFeeCents).toBe(0);
    expect(fields.extraGuestFeeCents).toBe(0);
    expect(fields.petFeeCents).toBe(0);
    expect(fields.petsAllowed).toBe(false);
    // With no base recorded, the rate covers everybody: nobody is billed as
    // an extra guest by a field nobody has filled in.
    expect(fields.baseGuests).toBe(4);
    expect(quoteStay({ ...BASE, ...fields, guests: 4 }).extraGuests).toBe(0);
  });

  it("treats junk as absent", () => {
    for (const raw of ["", "  ", "free", "-20", "0"]) {
      expect(priceFieldsFromAttributes({ cleaning_fee: raw }).cleaningFeeCents, raw).toBe(0);
    }
    expect(priceFieldsFromAttributes({ price: "$1,275.50" }).pricePerNightCents).toBe(127_550);
  });

  it("rejects subcent prices rather than rounding the catalogue's agreed amount", () => {
    expect(() => priceFieldsFromAttributes({ price: "100.001" })).toThrow(RangeError);
  });

  it("reads nothing at all without throwing", () => {
    expect(priceFieldsFromAttributes(null).pricePerNightCents).toBe(0);
    expect(priceFieldsFromAttributes(undefined).baseGuests).toBe(0);
  });

});

describe("attrValue", () => {
  it("reads the value when it is set", () => {
    expect(attrValue({ price: "175" }, "price")).toBe("175");
  });

  it("returns undefined when blank or missing", () => {
    expect(attrValue({ price: "" }, "price")).toBeUndefined();
    expect(attrValue({}, "price")).toBeUndefined();
    expect(attrValue(null, "price")).toBeUndefined();
  });
});
