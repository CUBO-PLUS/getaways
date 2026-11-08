import { expect, it, vi } from "vitest";

const { getBooking, saveQuote } = vi.hoisted(() => ({ getBooking: vi.fn(), saveQuote: vi.fn() }));
vi.mock("@/modules/auth/server/auth", () => ({ assertSameOrigin: () => true }));
vi.mock("@/modules/bookings/server/bookings", () => ({
  getBookingBySessionId: getBooking,
  saveQuote,
  nightsForStay: () => 2,
  ValidationError: class ValidationError extends Error {},
}));

import { POST } from "@/app/api/checkout/quote/route";

it("ignores submitted and previously saved coupon codes when repricing", async () => {
  getBooking.mockResolvedValue({
    id: 1, listing_id: 1, nights: 2, version: 1, status: "pending_payment",
    coupon_code: "GETAWAYS10", guests: 2, pet_fee_cents: 0,
    pricing_snapshot: { baseGuests: 2, maxGuests: 4, petsAllowed: false,
      pricePerNightCents: 10000, cleaningFeeCents: 0, extraGuestFeeCents: 0,
      petFeeCents: 0, tourismBasisPoints: 500, ivaBasisPoints: 1300 },
  });
  saveQuote.mockResolvedValue({ version: 2 });
  const response = await POST(new Request("http://localhost/api/checkout/quote", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: "cko_1_73c89c14-e2a1-4df3-bd34-0a94606f8de7", coupon_code: "GETAWAYS10" }),
  }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.quote.totalCents).toBe(23600);
  expect(body.data.quote.discountCents).toBe(0);
  expect(saveQuote.mock.calls[0][2]).toMatchObject({ total_amount_cents: 23600, discount_cents: 0, coupon_code: null });
});
