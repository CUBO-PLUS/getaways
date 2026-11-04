import "server-only";
import { getListingBySlug, getRelatedListings } from "@/modules/listings/server/listings";
import { resolveGalleryIds } from "@/shared/media/media";
import { buildAmenityRows } from "@/modules/listings/amenities";
import { groupListingSections, isHtmlContent, parseListingContent } from "@/modules/listings/listing-content";
import { parseListingReviews } from "@/modules/listings/listing-reviews";
import { buildGalleryTour, parseGalleryGroups } from "@/modules/listings/listing-gallery-groups";
import { listingLocation } from "@/modules/listings/locations";
import { splitEditorContent } from "@/modules/content/editor-content";
import { attrValue } from "@/modules/bookings/booking-quote";
import { sanitizeContentHtml } from "@/shared/security/server/sanitize-html";

const nightlyRateFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export async function getListingDetailData(slug: string) {
  const listing = await getListingBySlug(slug);
  if (!listing) return null;
  const attrs = listing.attributes;
  const galleryIds = resolveGalleryIds(listing.featured_media_id, listing.gallery_media_ids);
  const galleryMedia = galleryIds.flatMap((id) => {
    const media = listing.gallery_media.find((item) => item.id === id);
    return media ? [media] : [];
  });
  const displayGalleryMedia = galleryMedia;
  const listingReviews = parseListingReviews(listing.attributes);
  const tourMedia = galleryMedia;
  const tourGroups = buildGalleryTour(tourMedia, parseGalleryGroups(attrs));
  const tourPhotoCount = tourGroups.reduce((sum, group) => sum + group.media.length, 0);
  const { css: descriptionCss, html: description } = splitEditorContent(listing.content_html);
  const descriptionHtml = isHtmlContent(description)
    ? sanitizeContentHtml(descriptionCss ? `<style>${descriptionCss}</style>${description}` : description)
    : null;
  const descriptionSections = descriptionHtml === null
    ? groupListingSections(parseListingContent(description))
    : { summary: [], sections: [] };
  const amenityRows = buildAmenityRows(attrs, { includeCheckTimes: true, pets: listing.pets });
  const rateValue = Number(attrValue(attrs, "price")?.replace(/[^\d.]/g, ""));
  const nightlyRate = Number.isFinite(rateValue) && rateValue > 0 ? nightlyRateFormatter.format(rateValue) : null;
  const relatedListings = await getRelatedListings(listing.id, 3);
  const category = listing.categories[0];
  const location = listingLocation(attrs);
  const checkoutMode: "checkout" | "contact" = process.env.NEXT_PUBLIC_SITE_URL ? "checkout" : "contact";
  return { listing, attrs, displayGalleryMedia, listingReviews, tourGroups, tourPhotoCount,
    descriptionHtml, descriptionSections, amenityRows, nightlyRate, relatedListings, category, location, checkoutMode };
}

export type ListingDetailData = NonNullable<Awaited<ReturnType<typeof getListingDetailData>>>;
