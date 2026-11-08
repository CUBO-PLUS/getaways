import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import nextEnv from "@next/env";
import sharp from "sharp";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { optimizeImage, optimizedImageKey } from "../infrastructure/images/optimize.ts";
import { normalizeLegacyListing } from "../modules/listings/listing-import-normalization.ts";
import { enqueueRagSource } from "../infrastructure/prisma/rag-source-queue.ts";

type Term = { id: number; wp_id: string | null; taxonomy: string; slug: string; name: string };
type Media = { id: number; wp_id: string | null; storage_path: string; original_filename: string; alt_text: string | null };
type PreparedMedia = { id: number; wpId: string | null; item: Media; sourceBytes: Buffer; sourceHash: string; sourceKey: string; bytes: Buffer; digest: string; key: string; mime: string; width: number; height: number; sourceMime: string; sourceWidth: number; sourceHeight: number; blogSourceKeys: string[] };
let s3Client: { destroy(): void } | undefined;
const json = async <T,>(root: string, name: string) => (JSON.parse as (text: string, reviver: (this: unknown, key: string, value: unknown, context?: { source?: string }) => unknown) => unknown)(
  await readFile(path.join(root, "data", `${name}.json`), "utf8"),
  function (key, value, context) { return key === "wp_id" && typeof value === "number" ? context?.source ?? value : value; },
) as T;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const assertEqual = (expected: unknown, actual: unknown, label: string) => {
  if (!isDeepStrictEqual(expected, actual)) throw new Error(`destination differs: ${label}`);
};

export async function importListings(root: string, apply: boolean, verify: boolean) {
  const [{ db }, storage] = await Promise.all([
    import("../infrastructure/prisma/db.ts"), import("../infrastructure/storage/s3.ts"),
  ]);
  const source = await json<unknown[]>(root, "listings");
  const terms = await json<Term[]>(root, "terms");
  const rels = await json<Array<{ listing_id: number; term_id: number }>>(root, "listing_terms");
  const media = await json<Media[]>(root, "media");
  const normalized = source.map((row, sourceOrdinal) => normalizeLegacyListing(row, sourceOrdinal));
  if (normalized.length !== 11) throw new Error(`expected closed source catalogue of 11 listings, got ${normalized.length}`);
  const listingIds = new Set(normalized.map(l => l.id));
  const orphanTermRelations = rels.filter(r => !listingIds.has(r.listing_id));
  const catalogRels = rels.filter(r => listingIds.has(r.listing_id));
  if (orphanTermRelations.length !== 2 || orphanTermRelations.some(r => r.listing_id !== 3)) throw new Error(`unexpected orphan listing term relations: ${JSON.stringify(orphanTermRelations)}`);
  const byMedia = new Map(media.map(m => [m.id, m]));
  // Only Media.id is the local legacyMediaId; wp_id is a separate source identity and never a MediaAsset.id.
  const referenced = new Set(normalized.flatMap(l => [...l.galleryMediaIds, ...(l.featuredMediaId ? [l.featuredMediaId] : [])]));
  const prepared: PreparedMedia[] = [];
  for (const id of referenced) {
    const item = byMedia.get(id);
    if (!item) throw new Error(`missing source media ${id}`);
    const mediaRoot = path.resolve(root, "public/media");
    const mediaPath = path.resolve(mediaRoot, item.storage_path);
    if (!mediaPath.startsWith(`${mediaRoot}${path.sep}`)) throw new Error(`invalid media path ${item.storage_path}`);
    const bytes = await readFile(mediaPath);
    const meta = await sharp(bytes, { limitInputPixels: 100_000_000 }).metadata();
    if (!meta.width || !meta.height || !meta.format) throw new Error(`invalid media ${id}`);
    const digest = hash(bytes);
    const sourceKey = `listings-import/legacy/${id}/sha256/${digest}.${meta.format}`;
    const optimized = await optimizeImage(bytes, { limitInputPixels: 100_000_000, maxInputBytes: 100 * 1024 * 1024 });
    const key = optimizedImageKey(sourceKey, optimized.sha256);
    const blogExt = meta.format === "jpeg" ? "jpg" : meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
    const blogKey = `blog-import/sha256/${digest}.${blogExt}`;
    prepared.push({ id, wpId: item.wp_id, item, sourceBytes: bytes, sourceHash: digest, sourceKey, bytes: optimized.bytes, digest: optimized.sha256, key, mime: optimized.mimeType, width: optimized.width, height: optimized.height, sourceMime: `image/${meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format}`, sourceWidth: meta.width, sourceHeight: meta.height, blogSourceKeys: [blogKey, `blog-import/source/${id}/sha256/${digest}.${blogExt}`] });
  }
  const catalogTerms = terms.filter(t => ["hp_listing_category", "hp_listing_pets"].includes(t.taxonomy));
  const expectedTermIds = [15, 16, 17, 19, 23, 24];
  if (catalogTerms.length !== expectedTermIds.length || new Set(catalogTerms.map(t => t.id)).size !== expectedTermIds.length || expectedTermIds.some(id => !catalogTerms.some(t => t.id === id))) throw new Error(`unexpected catalogue term inventory: ${catalogTerms.map(t => t.id).join(",")}`);
  const selectedTermIds = new Set(catalogTerms.map(t => t.id));
  const termById = new Map(terms.map(t => [t.id, t]));
  for (const rel of catalogRels) if (!selectedTermIds.has(rel.term_id) || !termById.has(rel.term_id)) throw new Error(`unexpected catalogue relationship term ${rel.term_id}`);
  const wantedRels = catalogRels.filter(r => selectedTermIds.has(r.term_id));
  const existingListings = await db.orm.public.Listing.all();
  const existingTerms = await db.orm.public.ListingTerm.all();
  const existingAssets = await db.orm.public.MediaAsset.all();
  const existingAssignments = await db.orm.public.ListingTermAssignment.all();
  const existingListingMedia = await db.orm.public.ListingMedia.all();
  const mappings = await db.orm.public.BlogImportMapping.where({ source: "wordpress-v1" }).all();
  const blogMediaMappings = new Map(mappings.filter(m => m.targetKind === "media" && m.sourceId.startsWith("media:")).map(m => [Number(m.sourceId.slice(6)), m]));
  const mappingsBySourceId = new Map(mappings.map(m => [m.sourceId, m]));
  const assetsById = new Map(existingAssets.map(a => [a.id, a]));
  const assetBySource = new Map<number, (typeof existingAssets)[number]>();
  const objectSourceKeyBySource = new Map<number, string>();
  for (const item of prepared) {
    const blogMapping = blogMediaMappings.get(item.id);
    const sourceMapping = mappingsBySourceId.get(`media:${item.id}`);
    if (sourceMapping && sourceMapping.targetKind !== "media") throw new Error(`invalid blog media mapping ${item.id}`);
    const legacyAsset = existingAssets.find(a => a.legacyMediaId === BigInt(item.id));
    const asset = blogMapping ? assetsById.get(blogMapping.targetId) : legacyAsset;
    if (blogMapping && !asset) throw new Error(`blog media mapping target missing: legacy ${item.id}`);
    if (blogMapping && asset?.legacyMediaId != null && asset.legacyMediaId !== BigInt(item.id)) throw new Error(`blog media mapping has conflicting legacy id: ${item.id}`);
    if (blogMapping && blogMapping.targetKind !== "media") throw new Error(`invalid blog media mapping ${item.id}`);
    const blogSourceKey = blogMapping && asset ? item.blogSourceKeys.find(sourceKey => {
      const optimizedKey = optimizedImageKey(sourceKey, item.digest);
      return asset.objectKey === sourceKey || asset.objectKey === optimizedKey;
    }) : undefined;
    const expectedSourceKey = blogSourceKey ?? item.sourceKey;
    const expectedOptimizedKey = blogSourceKey ? optimizedImageKey(blogSourceKey, item.digest) : item.key;
    const legacy = (asset?.objectKey === item.sourceKey || (!!blogSourceKey && asset?.objectKey === blogSourceKey)) && Number(asset.sizeBytes) === item.sourceBytes.length && asset.width === item.sourceWidth && asset.height === item.sourceHeight && asset.mimeType === item.sourceMime;
    const optimized = (asset?.objectKey === item.key || (!!blogSourceKey && asset?.objectKey === expectedOptimizedKey)) && Number(asset.sizeBytes) === item.bytes.length && asset.width === item.width && asset.height === item.height && asset.mimeType === item.mime;
    if (legacyAsset && !blogMapping && !legacy && !optimized) throw new Error(`destination media key differs: legacy ${item.id}`);
    if (asset && ((!legacy && !optimized) || asset.defaultAlt !== item.item.alt_text || asset.originalName !== path.basename(item.item.original_filename || item.item.storage_path))) throw new Error(`destination media metadata differs: legacy ${item.id}`);
    if (verify && !asset) throw new Error(`destination media missing: legacy ${item.id}`);
    if (asset) { assetBySource.set(item.id, asset); objectSourceKeyBySource.set(item.id, expectedSourceKey); }
  }
  for (const t of catalogTerms) {
    const old = existingTerms.find(x => x.id === t.id);
    if (verify && !old) throw new Error(`destination term missing: ${t.id}`);
    if (old && (old.taxonomy !== t.taxonomy || old.slug !== t.slug || old.name !== t.name || old.wpId !== (t.wp_id == null ? null : BigInt(t.wp_id)))) throw new Error(`destination term differs: ${t.id}`);
    const slugCollision = existingTerms.find(x => x.taxonomy === t.taxonomy && x.slug === t.slug);
    if (slugCollision && slugCollision.id !== t.id) throw new Error(`term slug collision: ${t.taxonomy}/${t.slug}`);
  }
  const expectedRelKey = (listingId: number, termId: number) => `${listingId}:${termId}`;
  for (const l of normalized) {
    const slugCollision = existingListings.find(x => x.slug === l.slug && x.id !== l.id);
    const wpCollision = l.wpId == null ? undefined : existingListings.find(x => x.wpId === l.wpId && x.id !== l.id);
    if (slugCollision || wpCollision) throw new Error(`listing identity collision: ${l.id}/${l.slug}`);
    const old = existingListings.find(x => x.id === l.id);
    const expected = { id: l.id, wpId: l.wpId, slug: l.slug, title: l.title, contentHtml: l.contentHtml, attributes: { ...l.attributes, _sourceOrdinal: l.sourceOrdinal }, active: true, coverMediaId: l.featuredMediaId == null ? null : assetBySource.get(l.featuredMediaId)?.id ?? null, pricePerNightCents: l.pricePerNightCents, cleaningFeeCents: l.cleaningFeeCents, extraGuestFeeCents: l.extraGuestFeeCents, petFeeCents: l.petFeeCents, ivaBasisPoints: l.ivaBasisPoints, tourismBasisPoints: l.tourismBasisPoints, maxGuests: l.maxGuests, baseGuests: l.baseGuests, petsAllowed: l.petsAllowed, minStayNights: l.minStayNights, checkInSeconds: l.checkInSeconds, checkOutSeconds: l.checkOutSeconds };
    if (verify && !old) throw new Error(`destination listing missing: ${l.id}`);
    if (old) {
      if (old.archivedAt !== null) throw new Error(`destination listing is archived: ${l.id}`);
      const snapshot = Object.fromEntries(Object.keys(expected).map(k => [k, (old as unknown as Record<string, unknown>)[k]]));
      assertEqual(expected, snapshot, `listing ${l.id}`);
      const expectedTerms = wantedRels.filter(r => r.listing_id === l.id).map(r => expectedRelKey(l.id, r.term_id)).sort();
      const actualTerms = existingAssignments.filter(r => r.listingId === l.id).map(r => expectedRelKey(r.listingId, r.termId)).sort();
      assertEqual(expectedTerms, actualTerms, `listing ${l.id} terms`);
      const expectedMedia = l.galleryMediaIds.map((legacyId, position) => {
        const sourceMedia = prepared.find(m => m.id === legacyId)!;
        const targetId = assetBySource.get(legacyId)?.id;
        if (!targetId) throw new Error(`destination media mapping missing for existing listing ${l.id}/${legacyId}`);
        return { listingId: l.id, mediaId: targetId, position, alt: sourceMedia.item.alt_text, roomGroup: l.galleryGroups[legacyId] ?? null };
      });
      const actualMedia = existingListingMedia.filter(r => r.listingId === l.id).sort((a,b) => a.position-b.position);
      assertEqual(expectedMedia, actualMedia, `listing ${l.id} gallery`);
    }
  }
  const existingTermById = new Map(existingTerms.map(t => [t.id, t]));
  const termRowsById = new Map(catalogTerms.map(t => [t.id, t]));
  for (const r of wantedRels) if (!termRowsById.has(r.term_id)) throw new Error(`missing source catalog term ${r.term_id}`);
  if (verify) {
    const s3 = s3Client = storage.getS3Client(); const bucket = storage.getBlogMediaBucket();
    for (const item of prepared) {
      const asset = assetBySource.get(item.id);
      if (!asset) throw new Error(`destination media missing: legacy ${item.id}`);
      const sourceKey = objectSourceKeyBySource.get(item.id) ?? item.sourceKey;
      const oldRepresentation = asset.objectKey === item.sourceKey || item.blogSourceKeys.includes(asset.objectKey);
      const expectedHash = oldRepresentation ? item.sourceHash : item.digest;
      const expectedMime = oldRepresentation ? item.sourceMime : item.mime;
      const expectedBytes = oldRepresentation ? item.sourceBytes : item.bytes;
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.objectKey }));
      if (head.Metadata?.sha256 !== expectedHash || (!oldRepresentation && (head.Metadata?.["source-sha256"] !== item.sourceHash || head.Metadata?.["source-key"] !== sourceKey)) || head.ContentType !== expectedMime || Number(head.ContentLength) !== expectedBytes.length) throw new Error(`S3 hash/size/type mismatch: ${asset.objectKey}`);
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: asset.objectKey }));
      if (!obj.Body || hash(await obj.Body.transformToByteArray()) !== expectedHash) throw new Error(`S3 bytes mismatch: ${asset.objectKey}`);
    }
    return { mode: "verified", listings: normalized.length, media: prepared.length, terms: catalogTerms.length, ignoredOrphanListingRelations: orphanTermRelations };
  }
  if (!apply) return { mode: "dry-run", listings: normalized.length, media: prepared.length, terms: catalogTerms.length, ignoredOrphanListingRelations: orphanTermRelations, missingListings: normalized.filter(l => !existingListings.some(x => x.id === l.id)).length };

  const s3 = s3Client = storage.getS3Client(); const bucket = storage.getBlogMediaBucket();
  const uploadedKeys: string[] = [];
  try {
    const toUpload: typeof prepared = [];
    for (const item of prepared) {
      const existingAsset = assetBySource.get(item.id);
      const key = existingAsset?.objectKey ?? item.key;
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        const sourceKey = objectSourceKeyBySource.get(item.id) ?? item.sourceKey;
        const oldRepresentation = existingAsset && (key === item.sourceKey || item.blogSourceKeys.includes(key));
        if (oldRepresentation) {
          if (head.Metadata?.sha256 !== item.sourceHash || head.ContentType !== item.sourceMime || Number(head.ContentLength) !== item.sourceBytes.length) throw new Error(`S3 hash/size/type mismatch: ${key}`);
          const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          if (!obj.Body || hash(await obj.Body.transformToByteArray()) !== item.sourceHash) throw new Error(`S3 bytes mismatch: ${key}`);
          continue;
        }
        if (head.Metadata?.sha256 !== item.digest || head.Metadata?.["source-sha256"] !== item.sourceHash || head.Metadata?.["source-key"] !== sourceKey || head.ContentType !== item.mime || Number(head.ContentLength) !== item.bytes.length) throw new Error(`S3 hash/size/type mismatch: ${key}`);
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!obj.Body || hash(await obj.Body.transformToByteArray()) !== item.digest) throw new Error(`S3 bytes mismatch: ${key}`);
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404 && (e as { name?: string }).name !== "NotFound") throw e;
        if (existingAsset) throw new Error(`mapped media object missing: ${key}`);
        toUpload.push(item);
      }
    }
    for (const item of toUpload) {
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: item.key, Body: item.bytes, ContentLength: item.bytes.length, ContentType: item.mime, IfNoneMatch: "*", Metadata: { sha256: item.digest, "source-sha256": item.sourceHash, "source-key": item.sourceKey } }));
        uploadedKeys.push(item.key);
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 412 && (e as { name?: string }).name !== "PreconditionFailed") throw e;
      }
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: item.key }));
      if (head.Metadata?.sha256 !== item.digest || head.Metadata?.["source-sha256"] !== item.sourceHash || head.Metadata?.["source-key"] !== item.sourceKey || head.ContentType !== item.mime || Number(head.ContentLength) !== item.bytes.length) throw new Error(`uploaded S3 object verification failed: ${item.key}`);
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.key }));
      if (!obj.Body || hash(await obj.Body.transformToByteArray()) !== item.digest) throw new Error(`uploaded S3 object content verification failed: ${item.key}`);
    }
    const result = await db.transaction(async tx => {
      const lock = db.raw.sql`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(72190426)) SELECT 1 AS locked FROM lock`.returnsRow({ locked: "pg/int4@1" }).build();
      const [lockResult] = await tx.query(lock);
      if (lockResult?.locked !== 1) throw new Error("could not acquire catalogue import lock");
      await tx.execute(db.raw.sql`LOCK TABLE "Listing", "ListingTerm" IN SHARE ROW EXCLUSIVE MODE`.affectedCount().build());
      const mediaIds = new Map<number, number>();
      for (const item of prepared) {
        const mapped = blogMediaMappings.get(item.id);
        let asset = mapped ? assetsById.get(mapped.targetId) : await tx.orm.public.MediaAsset.where({ legacyMediaId: BigInt(item.id) }).first();
        if (!asset) asset = await tx.orm.public.MediaAsset.create({ legacyMediaId: BigInt(item.id), objectKey: item.key, originalName: path.basename(item.item.original_filename || item.item.storage_path), mimeType: item.mime, sizeBytes: BigInt(item.bytes.length), width: item.width, height: item.height, defaultAlt: item.item.alt_text });
        mediaIds.set(item.id, asset.id);
      }
      const termIds = new Map<number, number>();
      for (const t of catalogTerms) {
        let row = existingTermById.get(t.id);
        if (!row) row = await tx.orm.public.ListingTerm.create({ id: t.id, wpId: t.wp_id == null ? null : BigInt(t.wp_id), taxonomy: t.taxonomy, slug: t.slug, name: t.name });
        termIds.set(t.id, row.id);
      }
      for (const l of normalized) {
        const payload = { id: l.id, wpId: l.wpId, slug: l.slug, title: l.title, contentHtml: l.contentHtml, attributes: { ...l.attributes, _sourceOrdinal: l.sourceOrdinal }, active: true, coverMediaId: l.featuredMediaId == null ? null : mediaIds.get(l.featuredMediaId)!, pricePerNightCents: l.pricePerNightCents, cleaningFeeCents: l.cleaningFeeCents, extraGuestFeeCents: l.extraGuestFeeCents, petFeeCents: l.petFeeCents, ivaBasisPoints: l.ivaBasisPoints, tourismBasisPoints: l.tourismBasisPoints, maxGuests: l.maxGuests, baseGuests: l.baseGuests, petsAllowed: l.petsAllowed, minStayNights: l.minStayNights, checkInSeconds: l.checkInSeconds, checkOutSeconds: l.checkOutSeconds };
        if (!existingListings.some(x => x.id === l.id)) await tx.orm.public.Listing.create(payload);
        for (const r of wantedRels.filter(x => x.listing_id === l.id)) if (!existingAssignments.some(x => x.listingId === l.id && x.termId === termIds.get(r.term_id))) await tx.orm.public.ListingTermAssignment.create({ listingId: l.id, termId: termIds.get(r.term_id)! });
        for (const [position, legacyMediaId] of l.galleryMediaIds.entries()) {
          const sourceMedia = prepared.find(m => m.id === legacyMediaId)!;
          const value = { listingId: l.id, mediaId: mediaIds.get(legacyMediaId)!, position, alt: sourceMedia.item.alt_text, roomGroup: l.galleryGroups[legacyMediaId] ?? null };
          if (!existingListingMedia.some(x => x.listingId === l.id)) await tx.orm.public.ListingMedia.create(value);
        }
      }
      for (const listing of normalized) await enqueueRagSource(tx, "listing", listing.id);
      const listingSequence = db.raw.sql`SELECT setval(pg_get_serial_sequence('"Listing"', 'id'), GREATEST((SELECT last_value FROM "Listing_id_seq"), (SELECT COALESCE(MAX(id),1) FROM "Listing")), true) AS value`.returnsRow({ value: "pg/int8@1" }).build();
      const [listingSeq] = await tx.query(listingSequence);
      if (!listingSeq) throw new Error("could not advance Listing sequence");
      const termSequence = db.raw.sql`SELECT setval(pg_get_serial_sequence('"ListingTerm"', 'id'), GREATEST((SELECT last_value FROM "ListingTerm_id_seq"), (SELECT COALESCE(MAX(id),1) FROM "ListingTerm")), true) AS value`.returnsRow({ value: "pg/int8@1" }).build();
      const [termSeq] = await tx.query(termSequence);
      if (!termSeq) throw new Error("could not advance ListingTerm sequence");
      return { mode: "applied", listings: normalized.length, media: prepared.length, terms: catalogTerms.length, ignoredOrphanListingRelations: orphanTermRelations };
    });
    return result;
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${uploadedKeys.length ? `; immutable objects retained for safe retry (no existing object deleted): ${uploadedKeys.join(", ")}` : ""}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let dbClient: { close(): Promise<void> } | undefined;
  try {
    const [sourceRoot, ...args] = process.argv.slice(2).filter(arg => arg !== "--");
    if (!sourceRoot || sourceRoot.startsWith("--") || args.some(a => !["--apply", "--verify"].includes(a)) || (args.includes("--apply") && args.includes("--verify"))) throw new Error("usage: pnpm listings:import <source-root> [--apply | --verify]");
    nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
    const [{ db }] = await Promise.all([import("../infrastructure/prisma/db.ts")]);
    dbClient = db;
    process.stdout.write(`${JSON.stringify(await importListings(path.resolve(sourceRoot), args.includes("--apply"), args.includes("--verify")), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`listings import aborted: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    s3Client?.destroy();
    await dbClient?.close();
  }
}
