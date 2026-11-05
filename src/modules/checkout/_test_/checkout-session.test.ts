import { describe, expect, it } from "vitest";

import { isCheckoutSessionId, newCheckoutSessionId } from "@/modules/checkout/checkout-session";

describe("checkout session ids", () => {
  it("requires the complete canonical capability, not a prefix or numeric booking id", () => {
    const uuid = "73c89c14-e2a1-4df3-bd34-0a94606f8de7";
    expect(isCheckoutSessionId(`cko_12_${uuid}`)).toBe(true);
    for (const id of ["cko_12_abc", "12", "cko_", "cs_test_123", "", `cko_012_${uuid}`, `cko_2147483648_${uuid}`, `cko_12_${uuid}extra`, `cko_12_${uuid.replace("4df3", "1df3")}`]) {
      expect(isCheckoutSessionId(id), id).toBe(false);
    }
  });

  it("mints a cko_ id that includes the booking id", () => {
    const id = newCheckoutSessionId(42);
    expect(id.startsWith("cko_42_")).toBe(true);
    expect(isCheckoutSessionId(id)).toBe(true);
  });
});
