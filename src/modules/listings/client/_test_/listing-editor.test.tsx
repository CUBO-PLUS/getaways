// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StaffListingDetail } from "@/modules/listings/server/listing-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ListingEditor from "@/modules/listings/client/listing-editor";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const listing: StaffListingDetail = {
  id: 7, slug: "sun-salt", version: 4, status: "active", bookings: 2,
  content: {
    title: "Sun & Salt", description: "<p>Ocean</p>", location: "El Zonte", building: null, bedrooms: 2, bathrooms: 2, parking: null,
    videoUrl: null, amenities: ["wifi"], categoryIds: [16], coverMediaId: 31,
    gallery: [
      { mediaId: 31, alt: "Terrace", decorative: false, roomGroup: null, width: 100, height: 80, name: "terrace.jpg" },
      { mediaId: 32, alt: "", decorative: true, roomGroup: "Bedroom", width: 100, height: 80, name: "pattern.jpg" },
    ],
  },
  commercial: { pricePerNightCents: 10_000, cleaningFeeCents: 5_000, extraGuestFeeCents: null, petFeeCents: null, ivaBasisPoints: 1_300,
    tourismBasisPoints: 500, maxGuests: 4, baseGuests: 2, petsAllowed: null, minStayNights: 2, checkInSeconds: 54_000, checkOutSeconds: 39_600 },
  categories: [{ id: 16, name: "Apartments" }],
};

it("shows EDITOR the descriptive form only and sends no commercial field when saving", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 5 }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<ListingEditor listing={listing} library={[]} admin={false} />);

  expect(screen.queryByLabelText("Precio por noche (USD)")).toBeNull();
  expect(screen.queryByRole("button", { name: /Archivar/ })).toBeNull();
  expect(screen.getByText("Solo un administrador puede cambiar estos valores.")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Sun & Salt Getaway" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar contenido" }));
  await screen.findByText(/Guardado\. Los cambios ya se ven/);

  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("/api/admin/listings/7/content");
  const body = JSON.parse(String(init.body));
  expect(Object.keys(body).sort()).toEqual(["amenities", "bathrooms", "bedrooms", "building", "categoryIds", "coverMediaId", "description",
    "gallery", "location", "parking", "title", "version", "videoUrl"]);
  expect(body).toMatchObject({ version: 4, title: "Sun & Salt Getaway", coverMediaId: 31, gallery: [
    { mediaId: 31, alt: "Terrace", decorative: false, roomGroup: null }, { mediaId: 32, alt: "", decorative: true, roomGroup: "Bedroom" },
  ] });
});

it("keeps local edits and offers an explicit reload when another session saved first", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Someone else saved this listing." }), { status: 409 })));
  render(<ListingEditor listing={listing} library={[]} admin={false} />);
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "My unsaved title" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar contenido" }));
  await screen.findByRole("button", { name: "recarga la versión actual" });
  expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("My unsaved title");
});

it("lets ADMIN save prices in cents and refuses malformed amounts before sending", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 5 }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<ListingEditor listing={listing} library={[]} admin />);

  const price = screen.getByLabelText("Precio por noche (USD)") as HTMLInputElement;
  expect(price.value).toBe("100.00");
  fireEvent.change(price, { target: { value: "12,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar precios y condiciones" }));
  await screen.findByText(/Revisa los valores/);
  expect(fetch).not.toHaveBeenCalled();

  fireEvent.change(price, { target: { value: "125.50" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar precios y condiciones" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("/api/admin/listings/7/commercial");
  expect(JSON.parse(String(init.body))).toMatchObject({ version: 4, pricePerNightCents: 12_550, cleaningFeeCents: 5_000, ivaBasisPoints: 1_300,
    checkInSeconds: 54_000, checkOutSeconds: 39_600, petsAllowed: null });
  // With bookings on file, deletion is replaced by the archive advice.
  expect(screen.queryByRole("button", { name: /Eliminar definitivamente/ })).toBeNull();
  expect(screen.getByText(/tiene 2 reservas/)).toBeTruthy();
});
