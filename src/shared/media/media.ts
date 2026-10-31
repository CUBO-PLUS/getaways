import type { MediaRow } from "@/data/types";

/**
 * Public URL for a media file. Files live in public/media/<storage_path>
 * (downloaded once from the live site's storage bucket), so the URL is a
 * plain site-relative path. Each segment is encoded so names with spaces or
 * symbols still resolve.
 */
export function mediaPublicUrl(storagePath: string): string {
  if (/^\/api\/blog\/media\/[1-9]\d*$/.test(storagePath)) return storagePath;
  const path = storagePath
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/media/${path}`;
}

export type MediaRef = Pick<MediaRow, "storage_path" | "alt_text">;

export const LISTING_FALLBACK_MEDIA_BY_SLUG: Record<string, MediaRef> = {
  "salty-soul": {
    storage_path: "2026/03/zonset-el-zonte-65.jpg",
    alt_text: "Salty Soul coastal retreat living room in El Zonte",
  },
};

export function listingFallbackMedia(slug: string | null | undefined): MediaRef | null {
  if (!slug) return null;
  return LISTING_FALLBACK_MEDIA_BY_SLUG[slug] ?? null;
}

/**
 * Computes the ordered, deduped list of media ids to fetch/render for a
 * listing's photo gallery: featuredMediaId always first (as the hero),
 * even if it is not itself a member of galleryMediaIds (an orphaned/stale
 * pointer would otherwise silently drop the featured photo from the page),
 * followed by the rest of the gallery in its original order.
 *
 * Uses `!= null` rather than truthy checks throughout so an id of `0`
 * (theoretically a valid bigint id) is never mistaken for "absent".
 */
export function resolveGalleryIds(
  featuredMediaId: number | null | undefined,
  galleryMediaIds: number[] | null | undefined
): number[] {
  const gallery = galleryMediaIds ?? [];
  if (gallery.length === 0) {
    return featuredMediaId != null ? [featuredMediaId] : [];
  }
  const combined = featuredMediaId != null ? [featuredMediaId, ...gallery] : gallery;
  return [...new Set(combined.filter((id): id is number => id != null))];
}
