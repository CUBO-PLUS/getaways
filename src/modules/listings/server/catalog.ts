import "server-only";

import { db } from "@/infrastructure/prisma/db";
import type { ListingRow } from "@/data/types/listings";
import type { TermSummary } from "@/data/types/taxonomies";

type CatalogMedia = { id: number; storage_path: string; alt_text: string; width: number; height: number };
export type CatalogListing = ListingRow & {
  active: boolean;
  sourceOrdinal: number;
  categories: TermSummary[];
  pets: string | null;
  petsSlug: string | null;
  gallery_media: CatalogMedia[];
  featured_media: Pick<CatalogMedia, "storage_path" | "alt_text"> | null;
};

// ponytail: project the small catalogue in one batch; push per-listing filters into SQL if it grows.
export async function readCatalogListings(): Promise<CatalogListing[]> {
  const rows = await db.orm.public.Listing
    .where({ active: true, archivedAt: null })
    .include("coverMedia", (media) => media.select("id", "defaultAlt", "width", "height", "legacyMediaId"))
    .include("media", (media) => media.select("position", "mediaId", "alt", "roomGroup").include("media", (asset) => asset.select("id", "defaultAlt", "width", "height", "legacyMediaId")))
    .include("terms", (assignment) => assignment.select("termId").include("term", (term) => term.select("id", "name", "slug", "taxonomy")))
    .all();

  return rows.map((row) => {
    const attributes: Record<string, string> = {};
    let sourceOrdinal = Number.MAX_SAFE_INTEGER;
    if (row.attributes && typeof row.attributes === "object") {
      for (const [key, value] of Object.entries(row.attributes as Record<string, unknown>)) {
        if (key === "_sourceOrdinal") { if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) sourceOrdinal = value; continue; }
        if (key === "gallery_groups") continue;
        if (value != null) attributes[key] = typeof value === "string" ? value : String(value);
      }
    }
    const put = (key: string, value: number | boolean | null) => {
      if (value != null) attributes[key] = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    };
    put("price", row.pricePerNightCents == null ? null : row.pricePerNightCents / 100);
    put("cleaning_fee", row.cleaningFeeCents == null ? null : row.cleaningFeeCents / 100);
    put("extra_guest_fee", row.extraGuestFeeCents == null ? null : row.extraGuestFeeCents / 100);
    put("pet_fee", row.petFeeCents == null ? null : row.petFeeCents / 100);
    put("iva", row.ivaBasisPoints == null ? null : row.ivaBasisPoints / 100);
    put("tourism_tax", row.tourismBasisPoints == null ? null : row.tourismBasisPoints / 100);
    put("base_guests", row.baseGuests);
    put("guests", row.maxGuests);
    put("booking_min_length", row.minStayNights);
    put("pets_allowed", row.petsAllowed);
    put("check_in", row.checkInSeconds);
    put("check_out", row.checkOutSeconds);
    put("active", row.active);
    // Associations use MediaAsset IDs, not the legacy IDs stored in source JSON.
    attributes.gallery_groups = JSON.stringify(Object.fromEntries(row.media
      .filter((item) => item.roomGroup !== null).map((item) => [item.mediaId, item.roomGroup])));
    const categories: TermSummary[] = [];
    let pets: string | null = null;
    let petsSlug: string | null = null;
    for (const { term } of row.terms) {
      if (!term) continue;
      if (term.taxonomy === "hp_listing_category") categories.push(term);
      if (term.taxonomy === "hp_listing_pets") { pets = term.name; petsSlug = term.slug; }
    }
    const galleryMedia = row.media.sort((a, b) => a.position - b.position).map((item) => {
      if (!item.media) throw new Error(`Missing catalogue media ${item.mediaId}`);
      return { id: item.mediaId, storage_path: `/api/media/${item.mediaId}`, alt_text: item.alt ?? item.media.defaultAlt ?? "",
        width: item.media.width, height: item.media.height };
    });
    const cover = row.coverMedia ? {
      id: row.coverMedia.id, storage_path: `/api/media/${row.coverMedia.id}`,
      alt_text: galleryMedia.find((media) => media.id === row.coverMediaId)?.alt_text ?? row.coverMedia.defaultAlt ?? "",
      width: row.coverMedia.width, height: row.coverMedia.height,
    } : null;
    return {
      id: row.id, wp_id: Number(row.wpId ?? 0), slug: row.slug, title: row.title,
      content_html: row.contentHtml, attributes,
      featured_media_id: row.coverMediaId,
      gallery_media_ids: galleryMedia.map((item) => item.id),
      gallery_media: cover ? [cover, ...galleryMedia.filter((item) => item.id !== cover.id)] : galleryMedia,
      featured_media: cover,
      categories, pets, petsSlug,
      active: row.active,
      sourceOrdinal,
    };
  });
}
