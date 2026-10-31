import { expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/modules/content/server/content-postgres", () => ({
  getRecentPosts: async () => [],
}));

import { getHomeData } from "@/modules/site/server/home";
import { getListingDetailData } from "@/modules/listings/server/detail";
import { getAllListings } from "@/modules/listings/server/listings";
import { getEditorialData } from "@/modules/content/server/editorial";
import { getCheckoutData } from "@/modules/checkout/server/checkout";

it("prepares the existing catalogue/editorial pages and rejects missing checkout sessions", async () => {
  const [home, listings] = await Promise.all([getHomeData(), getAllListings()]);
  expect(home.listings.length).toBeGreaterThan(0);
  expect(home.destinations.reduce((sum, destination) => sum + destination.count, 0)).toBe(listings.length);
  expect(home.maxGuests).toBe(Math.max(...listings.map((listing) => Number(listing.attributes?.guests) || 0)));

  const detail = await getListingDetailData(listings[0].slug);
  expect(detail?.listing.id).toBe(listings[0].id);
  expect(detail?.tourPhotoCount).toBe(detail?.tourGroups.reduce((sum, group) => sum + group.media.length, 0));
  expect(detail?.relatedListings.every((listing) => listing.id !== detail.listing.id)).toBe(true);
  expect(await getListingDetailData("__missing_listing__")).toBeNull();

  const contact = await getEditorialData(["contact-us"]);
  expect(contact?.kind).toBe("page");
  expect(contact?.isContact).toBe(true);
  expect(await getEditorialData(["invalid", "route"])).toBeNull();
  expect(await getCheckoutData(undefined)).toBeNull();
  expect(await getCheckoutData("invalid-session")).toBeNull();
});
