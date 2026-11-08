// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BookingWidget from "@/components/organisms/BookingWidget";
import MobileBookBar from "@/components/organisms/MobileBookBar";
import { BookingDatesProvider } from "@/modules/bookings/providers/BookingDates";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows booked nights in both calendars and allows checkout on the next booking's start date", async () => {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  const prefix = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
  const start = `${prefix}-10`, end = `${prefix}-13`;
  window.history.replaceState({}, "", `/listing/stay?check_in=${prefix}-08&check_out=${prefix}-09`);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { blocked: [{ start_date: start, end_date: end }] } }))));

  render(<BookingDatesProvider><BookingWidget listingId={7} listingTitle="Stay" listingSlug="stay" price="100" checkoutMode="checkout" /><MobileBookBar nightlyRate="$100" /></BookingDatesProvider>);
  await waitFor(() => expect(screen.queryByText("Checking availability")).toBeNull());

  const day = (date: string) => document.querySelector<HTMLButtonElement>(`[data-day="${date}"]:not([data-outside]) button`)!;
  fireEvent.click(screen.getByLabelText("Check-in"));
  expect(screen.getByText("Marked dates have booked nights.")).toBeTruthy();
  expect(day(start).disabled).toBe(true);
  expect(day(end).disabled).toBe(false);
  fireEvent.click(screen.getByLabelText("Check-in"));

  fireEvent.click(screen.getByLabelText("Check-out"));
  expect(day(start).disabled).toBe(false);
  expect(day(`${prefix}-11`).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Check-out"));

  fireEvent.click(screen.getByRole("button", { name: /night.*$/i }));
  fireEvent.click(screen.getByLabelText("Check-in", { selector: "#mobile-check-in" }));
  expect(day(start).disabled).toBe(true);
});
