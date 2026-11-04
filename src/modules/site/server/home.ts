import "server-only";

import { getFeaturedListings, getAllListings, getListingCategoriesWithCounts } from "@/modules/listings/server/listings";
import { getRecentPosts } from "@/modules/content/server/content";
import { getMediaByIds, getMediaByWpIds } from "@/shared/media/server/media";
import { visibleListingCategories } from "@/modules/listings/categories";
import { mediaPublicUrl, type MediaRef } from "@/shared/media/media";
import { collectDestinations, matchesDestination } from "@/modules/listings/locations";
import { pickPhotoIdByRoom } from "@/modules/listings/listing-gallery-groups";
import { groupByBuilding } from "@/modules/listings/listing-buildings";
import { slugify } from "@/shared/utils/strings";
import { getRenderState } from "@/modules/site/server/site-text";
import { categoryImageSlotId, slotMediaId } from "@/modules/content/site-content";

// Static site artwork, not listing attachments; published slot overrides take precedence.
const CTA_COVER_WP_ID = 287;
const HERO_COVER_WP_ID = 447;
export const CATEGORY_COVER_WP_IDS: Record<string, number> = {
  "villas-for-rent-in-surf-city": 1198,
  apartments: 1199,
};
const CATEGORY_COUNT = 2;
const LISTING_COUNT = 6;
const POST_COUNT = 3;

export async function getHomeData() {
  const { content } = await getRenderState();
  // A missing home page row affects metadata, not the catalogue-backed body.
  const [categories, listings, allListings, posts, coverMedia] = await Promise.all([
    getListingCategoriesWithCounts(),
    getFeaturedListings(LISTING_COUNT),
    getAllListings(),
    getRecentPosts(POST_COUNT),
    getMediaByWpIds([HERO_COVER_WP_ID, CTA_COVER_WP_ID, ...Object.values(CATEGORY_COVER_WP_IDS)]),
  ]);

  // Read every place override, including tiers not currently shown.
  const chosenMediaIds = [
    slotMediaId(content, "home.hero.image"),
    slotMediaId(content, "home.cta.image"),
    slotMediaId(content, "home.concierge.image"),
    ...Object.keys(CATEGORY_COVER_WP_IDS).map((slug) => slotMediaId(content, categoryImageSlotId(slug))),
    ...Object.entries(content)
      .filter(([key]) => key.startsWith("home.place.") && key.endsWith(".image"))
      .map(([key]) => slotMediaId(content, key)),
  ].filter((id): id is number => id != null);
  const chosenMedia = chosenMediaIds.length > 0 ? await getMediaByIds(chosenMediaIds) : [];
  const chosenUrlById = new Map(chosenMedia.map((m) => [m.id, mediaPublicUrl(m.storage_path)]));
  const chosenUrl = (slotId: string) => {
    const id = slotMediaId(content, slotId);
    return id != null ? chosenUrlById.get(id) : undefined;
  };
  const coverUrlByWpId = new Map(coverMedia.map((m) => [m.wp_id, mediaPublicUrl(m.storage_path)]));
  const heroUrl = chosenUrl("home.hero.image") ?? coverUrlByWpId.get(HERO_COVER_WP_ID);
  const ctaUrl = chosenUrl("home.cta.image") ?? coverUrlByWpId.get(CTA_COVER_WP_ID);
  const orderedCategories = visibleListingCategories(categories).slice(0, CATEGORY_COUNT);
  const destinations = collectDestinations(allListings);
  const towns = destinations.map((destination) => destination.label.split(",")[0]?.trim()).filter(Boolean);
  const townPhrase =
    towns.length > 1 ? `${towns.slice(0, -1).join(", ")} and ${towns[towns.length - 1]}` : (towns[0] ?? "El Salvador");
  const stayPhrase =
    orderedCategories.length > 0
      ? orderedCategories.map((category) => category.name.toLowerCase()).join(" and ")
      : "vacation rentals";

  // A two-up section needs a real choice: categories, then towns, then buildings.
  const showCategories = orderedCategories.length >= 2;
  const PLACE_PHOTO_ROOMS = ["Views", "Neighbourhood", "Pool", "Terrace"];
  const pickPlacePhotoId = (inPlace: typeof allListings) => pickPhotoIdByRoom(inPlace, PLACE_PHOTO_ROOMS);
  type PlaceCard = { key: string; name: string; count: number; href: string; photoId: number | null; cover?: MediaRef | null };
  const townCards: PlaceCard[] = destinations.map((destination) => {
    const inTown = allListings.filter((listing) => matchesDestination(listing.attributes, destination.label));
    return {
      key: destination.slug,
      name: destination.label.split(",")[0]?.trim() ?? destination.label,
      count: destination.count,
      href: `/destinations/${destination.slug}`,
      photoId: pickPlacePhotoId(inTown),
      cover: inTown.find((listing) => listing.featured_media)?.featured_media,
    };
  });
  const buildingCards: PlaceCard[] = groupByBuilding(allListings)
    .filter((group) => group.building != null)
    .map((group) => ({
      key: slugify(group.building!),
      name: group.building!,
      count: group.listings.length,
      href: `/properties?building=${slugify(group.building!)}`,
      photoId: pickPlacePhotoId(group.listings),
      cover: group.listings.find((listing) => listing.featured_media)?.featured_media,
    }));
  const placeCards = showCategories ? [] : townCards.length >= 2 ? townCards : buildingCards;
  const placeHeading = placeCards === buildingCards ? "Where you can stay" : "Where we are";
  const placeSubtitle =
    placeCards === buildingCards
      ? "Two oceanfront buildings in El Zonte, a few minutes apart."
      : "Two stretches of the La Libertad coast, half an hour apart.";

  // Avoid repeating the place cards' photos in the concierge band.
  const usedPhotoIds = new Set(
    placeCards.flatMap((card) => (card.photoId != null ? [card.photoId] : []))
  );
  const catalogueMedia = new Map(allListings.flatMap((listing) => listing.gallery_media).map((media) => [media.id, media]));
  const conciergePhotoId = pickPhotoIdByRoom(
    allListings,
    ["Terrace", "Pool", "Views", "Neighbourhood"],
    usedPhotoIds
  );
  const autoConciergePhoto = conciergePhotoId ? catalogueMedia.get(conciergePhotoId) : undefined;
  const conciergeUrl =
    chosenUrl("home.concierge.image") ??
    (autoConciergePhoto ? mediaPublicUrl(autoConciergePhoto.storage_path) : undefined);
  const placePhotos = placeCards.flatMap((card) => {
    const media = card.photoId == null ? undefined : catalogueMedia.get(card.photoId);
    return media ? [media] : [];
  });
  const placePhotoById = new Map(placePhotos.map((media) => [media.id, media]));
  const maxGuests = allListings.reduce((max, listing) => {
    const attrs = listing.attributes;
    const guests = Number.parseInt(attrs.guests ?? "", 10);
    return Number.isFinite(guests) && guests > max ? guests : max;
  }, 0);
  return { content, posts, listings, heroUrl, ctaUrl, orderedCategories, destinations, towns,
    stayPhrase, townPhrase, showCategories, placeCards, placeHeading, placeSubtitle,
    chosenUrlById, coverUrlByWpId, conciergeUrl, placePhotoById, maxGuests };
}

export type HomeData = Awaited<ReturnType<typeof getHomeData>>;
