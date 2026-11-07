// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/molecules/BookingDatePicker", () => ({ default: (props: { id: string; value: string; onChange(value: string): void }) =>
  <input aria-label={props.id} type="date" value={props.value} onChange={event => props.onChange(event.target.value)} /> }));

import BookingWidget from "@/components/organisms/BookingWidget";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); push.mockReset(); });

it("returns to login with the chosen dates and referral, then restores those dates from the return query", async () => {
  const start = new Date();
  start.setDate(start.getDate() + 10);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const checkIn = iso(start), checkOut = iso(end);
  window.history.replaceState({}, "", `/listing/stay?ref=SPRING`);
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { blocked: [] } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { blocked: [] } }), { status: 200 })));

  const widget = <BookingWidget listingId={7} listingTitle="Stay" listingSlug="stay" price="100" minNights="2" checkoutMode="checkout" />;
  const { unmount } = render(widget);
  await screen.findByRole("button", { name: "Reserve now" });
  fireEvent.change(screen.getByLabelText("check-in-7"), { target: { value: checkIn } });
  fireEvent.change(screen.getByLabelText("check-out-7"), { target: { value: checkOut } });
  // Contact details come from the account: the widget asks for none of them.
  expect(screen.queryByLabelText("First name")).toBeNull();
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(screen.queryByLabelText("Phone")).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Reserve now" }));
  await waitFor(() => expect(push).toHaveBeenCalled());
  const [, init] = vi.mocked(fetch).mock.calls[1];
  expect(Object.keys(JSON.parse(String(init?.body))).sort()).toEqual(["check_in", "check_out", "listing_id", "referral_code"]);
  const loginUrl = new URL(push.mock.calls[0][0], "https://example.test");
  const returnTo = new URL(loginUrl.searchParams.get("returnTo")!, "https://example.test");
  expect(returnTo.pathname).toBe("/listing/stay");
  expect(returnTo.searchParams.get("check_in")).toBe(checkIn);
  expect(returnTo.searchParams.get("check_out")).toBe(checkOut);
  expect(returnTo.searchParams.get("ref")).toBe("SPRING");

  window.history.replaceState({}, "", `${returnTo.pathname}${returnTo.search}`);
  unmount();
  render(widget);
  expect((screen.getByLabelText("check-in-7") as HTMLInputElement).value).toBe(checkIn);
  expect((screen.getByLabelText("check-out-7") as HTMLInputElement).value).toBe(checkOut);
});
