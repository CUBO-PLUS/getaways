import { describe, expect, it } from "vitest";
import {
  activationProblems,
  applyDescriptiveAttributes,
  commercialProblem,
  parseCommercialPatch,
  parseContentPatch,
  parseDeletion,
  parseNewListing,
  parseStatusChange,
  suggestSlug,
  type CommercialValues,
} from "@/modules/listings/listing-admin-fields";

const image = (mediaId: number, extra: Record<string, unknown> = {}) => ({ mediaId, alt: "Ocean view from the terrace", ...extra });

describe("descriptive content patch", () => {
  it("accepts every descriptive field and normalizes empty text to a cleared value", () => {
    const result = parseContentPatch({
      version: 3, title: "  Sun & Salt ", description: "<p>Hi</p>", location: " ", building: "Zonset", bedrooms: 2, bathrooms: null,
      parking: 1, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", amenities: ["wifi", "tv"], categoryIds: [16],
      coverMediaId: 7, gallery: [image(7, { roomGroup: "Bedroom" }), { mediaId: 8, decorative: true }],
    });
    expect(result).toEqual({ ok: true, value: {
      version: 3, title: "Sun & Salt", description: "<p>Hi</p>", location: null, building: "Zonset", bedrooms: 2, bathrooms: null,
      parking: 1, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", amenities: ["wifi", "tv"], categoryIds: [16], coverMediaId: 7,
      gallery: [{ mediaId: 7, alt: "Ocean view from the terrace", decorative: false, roomGroup: "Bedroom" }, { mediaId: 8, alt: "", decorative: true, roomGroup: null }],
    } });
  });

  it("normalizes SEO overrides, accepts explicit clearing, and enforces their text limits", () => {
    expect(parseContentPatch({ version: 1, seoTitle: "  Search title ", seoDescription: "  Search description  " }))
      .toEqual({ ok: true, value: { version: 1, seoTitle: "Search title", seoDescription: "Search description" } });
    expect(parseContentPatch({ version: 1, seoTitle: " ", seoDescription: null }))
      .toEqual({ ok: true, value: { version: 1, seoTitle: null, seoDescription: null } });
    expect(parseContentPatch({ version: 1, seoTitle: "x".repeat(201) })).toMatchObject({ ok: false, status: 400 });
    expect(parseContentPatch({ version: 1, seoDescription: "x".repeat(501) })).toMatchObject({ ok: false, status: 400 });
    expect(parseContentPatch({ version: 1, seoTitle: 12 })).toMatchObject({ ok: false, status: 400 });
  });

  it.each([
    ["price", 100], ["pricePerNightCents", 10_000], ["active", true], ["guests", 9], ["maxGuests", 9], ["petsAllowed", true],
    ["booking_min_length", 1], ["archivedAt", null], ["slug", "renamed"],
  ])("refuses the whole body with 403 when it carries %s next to a title", (key, value) => {
    expect(parseContentPatch({ version: 1, title: "New title", [key]: value })).toMatchObject({ ok: false, status: 403 });
  });

  it.each([
    [{ version: 1, attributes: { price: "1" } }],
    [{ version: 1, "attributes.price": "1" }],
    [{ version: 1, title: "A", unknown: true }],
    [{ version: 1, gallery: [{ mediaId: 1, alt: "x", nested: { price: 1 } }] }],
    [{ version: 1, amenities: ["wifi", "sauna"] }],
    [{ version: 1, amenities: { wifi: true } }],
    [{ version: 1, categoryIds: [1, 1] }],
    [{ version: 1, bedrooms: 1.5 }],
    [{ version: 1, bedrooms: "2" }],
    [{ version: 1, videoUrl: "https://vimeo.com/123" }],
    [{ version: 1, videoUrl: "javascript:alert(1)" }],
    [{ version: 1, title: "" }],
    [{ version: 0, title: "A" }],
    [{ title: "A" }],
    [{ version: 1 }],
  ])("refuses malformed or nested input with 400: %j", (body) => {
    expect(parseContentPatch(body)).toMatchObject({ ok: false, status: 400 });
  });

  it("requires informative alt text or an explicit decorative choice for each gallery image", () => {
    expect(parseContentPatch({ version: 1, gallery: [{ mediaId: 1 }] })).toMatchObject({ ok: false, status: 400 });
    expect(parseContentPatch({ version: 1, gallery: [{ mediaId: 1, alt: "   " }] })).toMatchObject({ ok: false, status: 400 });
    expect(parseContentPatch({ version: 1, gallery: [{ mediaId: 1, alt: "Pool", decorative: true }] })).toMatchObject({ ok: false, status: 400 });
    expect(parseContentPatch({ version: 1, gallery: [image(1), image(1)] })).toMatchObject({ ok: false, status: 400 });
    expect(parseContentPatch({ version: 1, gallery: [] })).toMatchObject({ ok: true, value: { gallery: [] } });
  });
});

describe("descriptive attributes", () => {
  it("replaces only the patched descriptive keys and keeps unrelated data", () => {
    const current = { location: "El Zonte", building: "Zonset", wifi: "1", gym: "1", _sourceOrdinal: 3, reviews: "[]" };
    expect(applyDescriptiveAttributes(current, { version: 1, location: null, bedrooms: 3, amenities: ["tv"], videoUrl: "https://youtu.be/dQw4w9WgXcQ" }))
      .toEqual({ building: "Zonset", tv: "1", bedrooms: "3", video_url: "https://youtu.be/dQw4w9WgXcQ", _sourceOrdinal: 3, reviews: "[]" });
    expect(current).toEqual({ location: "El Zonte", building: "Zonset", wifi: "1", gym: "1", _sourceOrdinal: 3, reviews: "[]" });
  });

  it("leaves amenities alone when the patch does not mention them", () => {
    expect(applyDescriptiveAttributes({ wifi: "1" }, { version: 1, title: "New" })).toEqual({ wifi: "1" });
  });

  it("maps SEO overrides to attributes and removes them when cleared", () => {
    expect(applyDescriptiveAttributes({ seo_title: "Old", seo_description: "Old description", wifi: "1" }, {
      version: 1, seoTitle: "New", seoDescription: null,
    })).toEqual({ seo_title: "New", wifi: "1" });
  });
});

describe("commercial patch", () => {
  it("accepts typed commercial values in cents, basis points and seconds", () => {
    expect(parseCommercialPatch({ version: 2, pricePerNightCents: 12_000, cleaningFeeCents: 0, ivaBasisPoints: 1300, maxGuests: 4, baseGuests: 2,
      petsAllowed: false, minStayNights: 2, checkInSeconds: 54_000, checkOutSeconds: 39_600 }))
      .toMatchObject({ ok: true, value: { version: 2, pricePerNightCents: 12_000, petsAllowed: false, checkOutSeconds: 39_600 } });
  });

  it.each([
    [{ version: 1, title: "Mixed", pricePerNightCents: 100 }],
    [{ version: 1, price: 100 }],
    [{ version: 1, pricePerNightCents: 0 }],
    [{ version: 1, pricePerNightCents: 99.5 }],
    [{ version: 1, pricePerNightCents: "100" }],
    [{ version: 1, cleaningFeeCents: -1 }],
    [{ version: 1, ivaBasisPoints: 10_001 }],
    [{ version: 1, maxGuests: 0 }],
    [{ version: 1, petsAllowed: "yes" }],
    [{ version: 1, checkInSeconds: 86_400 }],
    [{ version: 1, active: true }],
    [{ version: 1 }],
  ])("refuses %j", (body) => {
    expect(parseCommercialPatch(body)).toMatchObject({ ok: false, status: 400 });
  });

  const values: CommercialValues = { pricePerNightCents: 10_000, cleaningFeeCents: null, extraGuestFeeCents: null, petFeeCents: null,
    ivaBasisPoints: null, tourismBasisPoints: null, maxGuests: 4, baseGuests: 2, petsAllowed: null, minStayNights: null,
    checkInSeconds: null, checkOutSeconds: null };

  it("checks coherence of the merged values against the listing's state", () => {
    expect(commercialProblem(values, true)).toBeNull();
    expect(commercialProblem({ ...values, baseGuests: 5 }, false)).toMatch(/Guests included/);
    expect(commercialProblem({ ...values, maxGuests: null, baseGuests: null }, false)).toBeNull();
    expect(commercialProblem({ ...values, pricePerNightCents: null }, true)).toMatch(/active listing/);
  });
});

describe("lifecycle", () => {
  it("needs an explicit confirmation to archive", () => {
    expect(parseStatusChange({ version: 1, action: "archive" })).toMatchObject({ ok: false, status: 400 });
    expect(parseStatusChange({ version: 1, action: "archive", confirmed: true })).toEqual({ ok: true, value: { version: 1, action: "archive" } });
    expect(parseStatusChange({ version: 1, action: "activate" })).toEqual({ ok: true, value: { version: 1, action: "activate" } });
    expect(parseStatusChange({ version: 1, action: "delete" })).toMatchObject({ ok: false });
    expect(parseStatusChange({ version: 1, action: "activate", price: 1 })).toMatchObject({ ok: false });
  });

  it("lists what a listing lacks before it can be activated", () => {
    expect(activationProblems({ title: "Stay", contentHtml: "", coverMediaId: null, pricePerNightCents: null, maxGuests: 2 }))
      .toEqual(["a description", "a cover image", "a nightly price"]);
    expect(activationProblems({ title: "Stay", contentHtml: "<p>x</p>", coverMediaId: 1, pricePerNightCents: 100, maxGuests: 2 })).toEqual([]);
  });

  it("validates new listing slugs and explicit deletion", () => {
    expect(parseNewListing({ title: "Casa Azul", slug: "casa-azul" })).toEqual({ ok: true, value: { title: "Casa Azul", slug: "casa-azul" } });
    for (const slug of ["Casa", "casa--azul", "-casa", "casa azul", ""]) expect(parseNewListing({ title: "Casa", slug })).toMatchObject({ ok: false });
    expect(parseNewListing({ title: "Casa", slug: "casa", active: true })).toMatchObject({ ok: false });
    expect(parseDeletion({ version: 4 })).toMatchObject({ ok: false });
    expect(parseDeletion({ version: 4, confirmed: true })).toEqual({ ok: true, value: { version: 4 } });
    expect(suggestSlug("Sun & Salt Getaway | 2B/2BA Ñandú")).toBe("sun-salt-getaway-2b-2ba-nandu");
  });
});
