import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { id: 1, role: "ADMIN", authVersion: 1 } as { id: number; role: string; authVersion: number },
  bookings: vi.fn(), traffic: vi.fn(),
}));

vi.mock("@/modules/auth/server/auth", () => ({ getSession: async () => mocks.session }));
vi.mock("@/modules/bookings/server/booking-statistics", () => ({ getBookingStatistics: mocks.bookings }));
vi.mock("@/modules/analytics/server/umami", () => ({ getUmamiStatistics: mocks.traffic }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...props }, children) }));

import AdminPage from "../page";

afterEach(() => vi.clearAllMocks());

it("renders creation timestamps in El Salvador time while preserving stay dates", async () => {
  mocks.session.role = "ADMIN";
  mocks.bookings.mockResolvedValue({
    period: 7, total: 1, confirmed: 1, cancelled: 0, pendingPayment: 0, pendingPaymentCents: 0,
    paymentReviewRequired: 0, confirmedReservationCents: 12345,
    recent: [{ id: 17, guestName: "Ana", listingTitle: "Casa", checkIn: "2026-11-09", checkOut: "2026-11-11", createdAt: "2026-11-07T02:00:00.000Z", status: "confirmed", totalCents: 12345 }],
  });
  mocks.traffic.mockResolvedValue({ available: false, reason: "not_configured" });

  const element = await AdminPage({ searchParams: Promise.resolve({ period: "7" }) } as never);
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  const html = await new Response(stream).text();

  expect(html).toMatch(/Creada .*6 nov 2026/);
  expect(html).toMatch(/Casa.*9 nov 2026.*11 nov 2026/);
  expect(html).toMatch(/<option value="7" selected="">/);
  expect(html).toContain("Las estadísticas de tráfico no están disponibles ahora");
  expect(html).toContain("123.45");
  expect(html).not.toContain("Visitantes");
});

it.each([
  ["EDITOR", false, true],
  ["BOOKING_MANAGER", true, false],
] as const)("loads only role-authorized dashboard data for %s", async (role, loadsBookings, loadsTraffic) => {
  mocks.session.role = role;
  mocks.bookings.mockResolvedValue({ total: 0, recent: [], pendingPayment: 0, pendingPaymentCents: 0, paymentReviewRequired: 0, confirmed: 0, cancelled: 0, confirmedReservationCents: 0 });
  mocks.traffic.mockResolvedValue({ available: false, reason: "not_configured" });

  const element = await AdminPage({ searchParams: Promise.resolve({ period: "30" }) } as never);
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  await new Response(stream).text();

  expect(mocks.bookings).toHaveBeenCalledTimes(Number(loadsBookings));
  expect(mocks.traffic).toHaveBeenCalledTimes(Number(loadsTraffic));
});
