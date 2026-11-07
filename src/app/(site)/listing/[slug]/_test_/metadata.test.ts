import { expect, it, vi } from "vitest";

const { getListingBySlug } = vi.hoisted(() => ({ getListingBySlug: vi.fn() }));
vi.mock("@/modules/listings/server/listings", () => ({ getListingBySlug }));
vi.mock("@/modules/listings/server/detail", () => ({ getListingDetailData: vi.fn() }));
vi.mock("@/components/templates/ListingTemplate", () => ({ default: () => null }));

import { generateMetadata } from "../page";

it("uses saved SEO overrides publicly and falls back to listing content when blank", async () => {
  getListingBySlug.mockResolvedValue({
    title: "Coastal home", attributes: { location: "El Zonte", bedrooms: "2", bathrooms: "1", guests: "4" },
    featured_media_id: null, gallery_media_ids: [], gallery_media: [],
  });
  const params = Promise.resolve({ slug: "coastal-home" });

  getListingBySlug.mockResolvedValueOnce({
    title: "Coastal home", attributes: { location: "El Zonte", seo_title: "Custom search title", seo_description: "Custom search description" },
    featured_media_id: null, gallery_media_ids: [], gallery_media: [],
  });
  const custom = await generateMetadata({ params });
  expect(custom).toMatchObject({
    title: "Custom search title", description: "Custom search description",
    alternates: { canonical: "/listing/coastal-home" },
    openGraph: { title: "Custom search title", description: "Custom search description" },
    twitter: { title: "Custom search title", description: "Custom search description" },
  });

  getListingBySlug.mockResolvedValueOnce({
    title: "Coastal home", attributes: { location: "El Zonte", bedrooms: "2", bathrooms: "1", guests: "4", seo_title: "", seo_description: "" },
    featured_media_id: null, gallery_media_ids: [], gallery_media: [],
  });
  const fallback = await generateMetadata({ params });
  expect(fallback).toMatchObject({ title: "Coastal home", description: "2 bedroom, 1 bathroom vacation rental in El Zonte. Sleeps 4. Book direct with Getaways El Salvador." });
});
