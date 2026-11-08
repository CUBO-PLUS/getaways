import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { optimizeImage, optimizedImageKey } from "@/infrastructure/images/optimize";

const { listings } = vi.hoisted(() => ({ listings: [] as Array<Record<string, unknown>> }));
vi.mock("@/modules/listings/listing-import-normalization", () => ({ normalizeLegacyListing: (_row: unknown, index: number) => listings[index] }));
vi.mock("@/infrastructure/prisma/db", () => ({
  db: {
    orm: { public: {
      Listing: { all: async () => [] },
      ListingTerm: { all: async () => [] },
      MediaAsset: { all: async () => [asset] },
      ListingTermAssignment: { all: async () => [] },
      ListingMedia: { all: async () => [] },
      BlogImportMapping: { where: () => ({ all: async () => [mapping] }) },
    } },
  },
}));
vi.mock("@/infrastructure/storage/s3", () => ({ getS3Client: vi.fn(), getBlogMediaBucket: () => "media" }));

import { importListings } from "../listings-import.mts";

let asset: Record<string, unknown>;
let mapping: Record<string, unknown>;

it("accepts a shared blog-optimized object at its mapped MediaAsset id in dry-run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "listings-shared-media-"));
  try {
    await mkdir(path.join(root, "data"));
    await mkdir(path.join(root, "public", "media"), { recursive: true });
    const sourceBytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "teal" } }).png().toBuffer();
    await writeFile(path.join(root, "public", "media", "shared.png"), sourceBytes);
    const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
    const optimized = await optimizeImage(sourceBytes);
    const blogSourceKey = `blog-import/sha256/${sourceHash}.png`;
    asset = { id: 91, legacyMediaId: null, objectKey: optimizedImageKey(blogSourceKey, optimized.sha256), mimeType: optimized.mimeType,
      sizeBytes: BigInt(optimized.bytes.length), width: optimized.width, height: optimized.height, defaultAlt: "Shared image", originalName: "shared.png" };
    mapping = { sourceId: "media:1", targetKind: "media", targetId: 91 };
    listings.splice(0, listings.length, ...Array.from({ length: 11 }, (_, index) => ({
      id: index < 2 ? index + 1 : index + 2, slug: `listing-${index}`, wpId: null, galleryMediaIds: index === 0 ? [1] : [],
      featuredMediaId: null, galleryGroups: {},
    })));
    await Promise.all([
      writeFile(path.join(root, "data", "listings.json"), JSON.stringify(listings)),
      writeFile(path.join(root, "data", "terms.json"), JSON.stringify([15, 16, 17, 19, 23, 24].map(id => ({ id, wp_id: null, taxonomy: "hp_listing_category", slug: `term-${id}`, name: `Term ${id}` })))),
      writeFile(path.join(root, "data", "listing_terms.json"), JSON.stringify([
        ...[15, 16, 17, 19, 23, 24].map(term_id => ({ listing_id: 1, term_id })),
        { listing_id: 3, term_id: 15 }, { listing_id: 3, term_id: 16 },
      ])),
      writeFile(path.join(root, "data", "media.json"), JSON.stringify([{ id: 1, wp_id: null, storage_path: "shared.png", original_filename: "shared.png", alt_text: "Shared image" }])),
    ]);

    await expect(importListings(root, false, false)).resolves.toMatchObject({ mode: "dry-run", listings: 11, media: 1 });
  } finally {
    listings.length = 0;
    await rm(root, { recursive: true, force: true });
  }
});
