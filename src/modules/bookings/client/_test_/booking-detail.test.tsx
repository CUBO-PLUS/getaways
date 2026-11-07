// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BookingDetail from "../booking-detail";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("refreshes payment without losing edits and does not claim payment when verification fails", async () => {
  let respond!: (response: Response) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "La verificación caducó. Renueva la verificación de despliegue." }), { status: 503 }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { respond = resolve; }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Booking changed" }), { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  render(<BookingDetail booking={{
    id: 7, version: 3, status: "pending_payment", listing: { title: "Synthetic stay", archived: false },
    checkIn: "2099-06-10", checkOut: "2099-06-12", nights: 2, guests: 2,
    contact: { name: "Guest", email: "guest@example.test", phone: null }, guestNotes: null, internalNotes: null,
    quote: { currency: "USD", nightlyCents: 10000, cleaningCents: 2000, petCents: 0, extraGuestCents: 0, discountCents: 0, taxCents: 3600, totalCents: 25600 },
    paymentReferencePresent: true, paymentReviewRequired: false, testPayment: { amountCents: 100, status: "pending" },
    cancelledAt: null, cancellationReason: null, cancelledBy: null,
  }} />);
  const name = screen.getByRole("textbox", { name: "Nombre" }) as HTMLInputElement;
  const notes = screen.getByRole("textbox", { name: "Solo personal" }) as HTMLTextAreaElement;
  fireEvent.change(name, { target: { value: "Unsaved guest" } });
  fireEvent.change(notes, { target: { value: "Unsaved staff note" } });

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refrescar estado del pago" })); });
  expect(screen.getByRole("status").textContent).toContain("La verificación caducó");
  expect(screen.getByText("Pendiente de pago")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pago testnet" })).toBeTruthy();
  expect(screen.getByText("$1.00 · Pendiente")).toBeTruthy();
  expect(screen.queryByText("Pago confirmado por BTCPay.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Refrescar estado del pago" }));
  const loading = screen.getByRole("button", { name: "Consultando BTCPay…" }) as HTMLButtonElement;
  expect(loading.disabled).toBe(true);
  expect(loading.getAttribute("aria-busy")).toBe("true");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith("/api/admin/bookings/7", { method: "POST", cache: "no-store" });
  await act(async () => { respond(new Response(JSON.stringify({ version: 4, status: "confirmed", paymentReviewRequired: false, testPayment: { amountCents: 100, status: "paid" } }))); });
  expect(screen.getByText("Confirmada")).toBeTruthy();
  expect(screen.getByText("$1.00 · Pagado")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Pago confirmado por BTCPay.");
  expect(name.value).toBe("Unsaved guest");
  expect(notes.value).toBe("Unsaved staff note");
  expect(screen.getByRole("button", { name: "Recargar versión actual (descarta ediciones)" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Refrescar estado del pago" }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar contacto" })); });
  const [url, options] = fetch.mock.calls.at(-1)!;
  expect(url).toBe("/api/admin/bookings/7/contact");
  expect(options.method).toBe("PATCH");
  expect(JSON.parse(options.body)).toMatchObject({ version: 3, name: "Unsaved guest" });
  expect(screen.getByRole("alert").textContent).toContain("Tus ediciones se conservaron");
  expect(name.value).toBe("Unsaved guest");
  expect(notes.value).toBe("Unsaved staff note");
});
