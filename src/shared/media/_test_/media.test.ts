import { describe, it, expect } from "vitest";
import { listingFallbackMedia, mediaPublicUrl, resolveGalleryIds } from "@/shared/media/media";

describe("mediaPublicUrl", () => {
  it("builds the local /media URL for a media bucket path", () => {
    expect(mediaPublicUrl("2026/03/DSC05770-HDR.jpg")).toBe("/media/2026/03/DSC05770-HDR.jpg");
  });

  it("encodes each path segment", () => {
    expect(mediaPublicUrl("2021/10/my photo #1.jpg")).toBe("/media/2021/10/my%20photo%20%231.jpg");
  });

  it("keeps the stable application route for PostgreSQL blog media", () => {
    expect(mediaPublicUrl("/api/blog/media/42")).toBe("/api/blog/media/42");
  });
});

describe("resolveGalleryIds", () => {
  it("puts the featured id first, then the rest of the gallery, when featured is already the first element", () => {
    expect(resolveGalleryIds(58, [58, 59, 60])).toEqual([58, 59, 60]);
  });

  it("moves the featured id to the front when it is NOT first in gallery_media_ids (real data pattern)", () => {
    // Mirrors casa-jungla-getaway's live shape: featured=93 is the LAST of 10 gallery ids.
    expect(resolveGalleryIds(93, [84, 85, 86, 93])).toEqual([93, 84, 85, 86]);
  });

  it("includes the featured id even when it is NOT a member of gallery_media_ids at all (orphaned/stale pointer)", () => {
    // This is the gap flagged in review: a featured_media_id that never appears in the
    // gallery array must still surface in the resolved ids, not silently disappear.
    expect(resolveGalleryIds(99, [1, 2, 3])).toEqual([99, 1, 2, 3]);
  });

  it("falls back to just the featured id when gallery_media_ids is empty", () => {
    expect(resolveGalleryIds(58, [])).toEqual([58]);
  });

  it("returns an empty array when both featured and gallery are absent", () => {
    expect(resolveGalleryIds(null, null)).toEqual([]);
    expect(resolveGalleryIds(undefined, undefined)).toEqual([]);
  });

  it("returns the gallery unchanged (deduped) when featured is null but gallery is present", () => {
    expect(resolveGalleryIds(null, [1, 2, 2, 3])).toEqual([1, 2, 3]);
  });

  it("treats id 0 as a present id, not an absent one (uses != null, not truthy, checks)", () => {
    expect(resolveGalleryIds(0, [1, 2])).toEqual([0, 1, 2]);
  });
});

describe("listingFallbackMedia", () => {
  it("returns a branded fallback photo for the migrated Salty Soul listing with missing media", () => {
    expect(listingFallbackMedia("salty-soul")).toEqual({
      storage_path: "2026/03/zonset-el-zonte-65.jpg",
      alt_text: "Salty Soul coastal retreat living room in El Zonte",
    });
  });

  it("does not invent fallback photos for listings without an explicit mapping", () => {
    expect(listingFallbackMedia("casa-jungla-getaway")).toBeNull();
  });
});
