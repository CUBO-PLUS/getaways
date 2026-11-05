// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import CheckoutExtras from "@/components/organisms/CheckoutExtras";
import { quoteStay } from "@/modules/bookings/booking-quote";

vi.mock("next/navigation", () => {
  const router = { refresh: vi.fn() };
  return { useRouter: () => router };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const firstSession = "cko_1_73c89c14-e2a1-4df3-bd34-0a94606f8de7";
const nextSession = "cko_2_73c89c14-e2a1-4df3-bd34-0a94606f8de7";
function serverQuote(guests = 3, withPet = true, pricePerNightCents = 15000) {
  return { quote: quoteStay({ nights: 2, pricePerNightCents, cleaningFeeCents: 2000, baseGuests: 2,
    extraGuestFeeCents: 1500, petFeeCents: 3000, guests, withPet }),
  guests, withPet, couponCode: null, couponError: null, maxGuests: 4, baseGuests: 2, petsAllowed: true,
  petFeeCents: 3000, extraGuestFeeCents: 1500, tourismRate: 0.05, ivaRate: 0.13 };
}

function serveInitialQuotes() {
  const requested = new Set<string>();
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { session_id } = JSON.parse(String(init?.body)) as { session_id: string };
    // Like the real CAS: two concurrent initial quotes observe one version; only one saves.
    if (requested.has(session_id)) return Response.json({ ok: false, error: "This booking changed while we were pricing it." }, { status: 409 });
    requested.add(session_id);
    return Response.json({ ok: true, data: session_id === firstSession ? serverQuote() : serverQuote(1, false, 10000) });
  }));
}

it("shows the saved bill and payment CTA on StrictMode mount instead of a self-inflicted quote conflict", async () => {
  serveInitialQuotes();
  render(<StrictMode><CheckoutExtras sessionId={firstSession} initialGuests={1} methods={[]} /></StrictMode>);

  const confirm = await screen.findByRole("button", { name: "Confirm $444.80 and choose payment" });
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText("Total")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "How many guests?" }) as HTMLSelectElement).value).toBe("3");
  expect((screen.getByRole("radio", { name: "Yes, one pet" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("loads the new session's quote instead of reusing another booking's initial request", async () => {
  serveInitialQuotes();
  const { rerender } = render(<StrictMode><CheckoutExtras sessionId={firstSession} initialGuests={1} methods={[]} /></StrictMode>);
  await screen.findByRole("button", { name: "Confirm $444.80 and choose payment" });

  rerender(<StrictMode><CheckoutExtras sessionId={nextSession} initialGuests={1} methods={[]} /></StrictMode>);
  await screen.findByRole("button", { name: "Confirm $256.00 and choose payment" });
  expect(screen.queryByRole("button", { name: "Confirm $444.80 and choose payment" })).toBeNull();
  expect((screen.getByRole("combobox", { name: "How many guests?" }) as HTMLSelectElement).value).toBe("1");
  expect(screen.queryByRole("alert")).toBeNull();
});
