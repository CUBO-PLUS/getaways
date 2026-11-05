import { expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/modules/content/server/content-postgres", () => ({
  getRecentPosts: async () => [],
}));
vi.mock("@/modules/listings/server/catalog", () => ({
  readCatalogListings: async () => [
    { id: 1, wp_id: 101, slug: "synthetic-coast", title: "Coast", content_html: "<p>Coast stay</p>", attributes: { guests: "4", location: "El Zonte, El Salvador", price: "100" } },
    { id: 2, wp_id: 102, slug: "synthetic-beach", title: "Beach", content_html: "<p>Beach stay</p>", attributes: { guests: "6", location: "El Tunco, El Salvador", price: "120" } },
  ].map((listing) => ({ ...listing, active: true, sourceOrdinal: listing.id,
    categories: [{ id: 1, name: "Apartments", slug: "apartments" }], pets: null, petsSlug: null,
    featured_media_id: listing.id, gallery_media_ids: [listing.id],
    gallery_media: [{ id: listing.id, storage_path: `/synthetic/${listing.id}.jpg`, alt_text: "Synthetic photo", width: 800, height: 600 }],
    featured_media: { storage_path: `/synthetic/${listing.id}.jpg`, alt_text: "Synthetic photo" } })),
}));
vi.mock("@/modules/listings/server/listings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/listings/server/listings")>()),
  getListingCategoriesWithCounts: async () => [{ id: 1, name: "Apartments", slug: "apartments", taxonomy: "hp_listing_category", wp_id: 201, parent_id: null, listing_count: 2 }],
}));

import { getHomeData } from "@/modules/site/server/home";
import { getListingDetailData } from "@/modules/listings/server/detail";
import { getAllListings } from "@/modules/listings/server/listings";
import { getEditorialData } from "@/modules/content/server/editorial";
import { getCheckoutData } from "@/modules/checkout/server/checkout";

it("prepares catalogue/editorial pages and rejects missing checkout sessions", async () => {
  const [home, listings] = await Promise.all([getHomeData(), getAllListings()]);
  expect(home.listings.length).toBeGreaterThan(0);
  expect(home.destinations.reduce((sum, destination) => sum + destination.count, 0)).toBe(listings.length);
  expect(home.maxGuests).toBe(Math.max(...listings.map((listing) => Number(listing.attributes?.guests) || 0)));

  const detail = await getListingDetailData(listings[0].slug);
  expect(detail?.listing.id).toBe(listings[0].id);
  expect(detail?.tourPhotoCount).toBe(1);
  expect(detail?.tourPhotoCount).toBe(detail?.tourGroups.reduce((sum, group) => sum + group.media.length, 0));
  expect(detail?.relatedListings).toHaveLength(1);
  expect(detail?.relatedListings.every((listing) => listing.id !== detail.listing.id)).toBe(true);
  expect(await getListingDetailData("__missing_listing__")).toBeNull();

  const contact = await getEditorialData(["contact-us"]);
  expect(contact?.kind).toBe("page");
  expect(contact?.isContact).toBe(true);
  expect(await getEditorialData(["invalid", "route"])).toBeNull();
  expect(await getCheckoutData(undefined)).toBeNull();
  expect(await getCheckoutData("invalid-session")).toBeNull();
});
