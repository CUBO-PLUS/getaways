import { describe, it, expect } from "vitest";
import { normalizeReferralCode, validateReferral } from "../referral-rules";

const referrals = [
  { code: "ROGER10", active: true },
  { code: "MAUREEN20", active: true },
  { code: "INVITADO30", active: false },
];

describe("Referral validation", () => {

  it("accepts an active referral code", () => {
    expect(
      validateReferral("roger10", referrals)
    ).toBe("ROGER10");
  });

  it("rejects an unknown code", () => {
    expect(
      validateReferral("UNKNOWN", referrals)
    ).toBeNull();
  });

  it("rejects inactive codes", () => {
    expect(
      validateReferral("INVITADO30", referrals)
    ).toBeNull();
  });

});

it("normalizes case and rejects malformed codes without database access", () => {
  expect(normalizeReferralCode("  getawaysdemo  ")).toBe("GETAWAYSDEMO");
  expect(normalizeReferralCode("x")).toBeNull();
  expect(normalizeReferralCode("bad code")).toBeNull();
});
