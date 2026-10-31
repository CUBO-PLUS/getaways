import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../infrastructure/prisma/db.ts";
import { getBlogMediaBucket, getS3Client } from "../infrastructure/storage/s3.ts";
import { BLOG_DOCUMENT_SCHEMA_VERSION, validateBlogDocument } from "../modules/content/blog-schema.ts";
import { analyzeBlogSources } from "./blog-import-dry-run.mjs";
import { assertApproved, canonicalJson, makeApprovalTemplate as buildApprovalTemplate, type Approval } from "./blog-import-approval.mts";
import { assertSourceTree, resolveMediaFile } from "./blog-import-paths.mts";
import { assertImportedSnapshot } from "./blog-import-snapshot.mts";
import { publicationInstant } from "../modules/content/publication-instant.mjs";
import { readSourceJsonSnapshot, snapshotMediaFiles, sourceManifestSha256, type MediaSnapshot } from "./blog-import-source.mts";

type Media = { id: number; wp_id: number; storage_path: string; original_filename: string; alt_text: string | null };
type Article = {
  source: { wpId: number; localId: number; slug: string; title: string; excerpt: string; seoTitle: string | null; seoDescription: string | null; publishedAtUtc: string; categories: Array<{ sourceLocalId: number; wpId: number; name: string; slug: string }>; coverMedia: { ref: string; localId: number; wpId: number; storagePath: string; catalogAlt: string | null } | null };
  status: string; documentSchemaVersion: number; document: Record<string, unknown>; mediaRefs: string[];
  losses: unknown[]; warnings: unknown[]; schemaValid: boolean; importAllowed?: boolean;
  sourceBlockers?: unknown[];
};
type Conversion = { articles: Article[]; sourceJsonSha256: string; sourceSha256: string };
type PreparedMedia = { source: Media; bytes: Buffer; hash: string; sourceFingerprint: string; key: string; mime: string; width: number; height: number };
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const SOURCE = "wordpress-v1";

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const stable = canonicalJson;
const fingerprint = (value: unknown) => digest(stable(value));
function asJson(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("value is not JSON serializable");
  return JSON.parse(serialized) as JsonValue;
}

async function readMediaSnapshot(root: string, media: Media[]): Promise<MediaSnapshot> {
  return snapshotMediaFiles(media, async (item) => readFile(await resolveMediaFile(root, item.storage_path)));
}

function remapDocument(node: unknown, mediaIds: Map<string, number>): unknown {
  if (Array.isArray(node)) return node.map((item) => remapDocument(item, mediaIds));
  if (!node || typeof node !== "object") return node;
  const result = { ...(node as Record<string, unknown>) };
  if (result.type === "image" && result.attrs && typeof result.attrs === "object") {
    const attrs = { ...(result.attrs as Record<string, unknown>) };
    if (typeof attrs.mediaId !== "string" || !mediaIds.has(attrs.mediaId)) throw new Error(`unmapped media reference ${String(attrs.mediaId)}`);
    attrs.mediaId = String(mediaIds.get(attrs.mediaId));
    result.attrs = attrs;
  }
  if (result.content !== undefined) result.content = remapDocument(result.content, mediaIds);
  return result;
}

async function verifyObject(s3: ReturnType<typeof getS3Client>, bucket: string, item: PreparedMedia): Promise<void> {
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: item.key }));
  if (head.Metadata?.sha256 !== item.hash || Number(head.ContentLength) !== item.bytes.length) throw new Error(`object metadata mismatch: ${item.key}`);
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.key }));
  if (!result.Body || digest(await result.Body.transformToByteArray()) !== item.hash) throw new Error(`object content hash mismatch: ${item.key}`);
}

export async function makeApprovalTemplate(root: string, conversionBytes: Uint8Array) {
  await assertSourceTree(root);
  const conversion = JSON.parse(Buffer.from(conversionBytes).toString("utf8")) as Conversion;
  const source = await readSourceJsonSnapshot(root);
  const dryRun = analyzeBlogSources(root, source.data);
  if (dryRun.blockers.length) throw new Error(`source preflight has ${dryRun.blockers.length} blockers`);
  const usedWpIds = new Set(conversion.articles.flatMap((article) => [
    ...article.mediaRefs.map((ref) => Number(ref.slice("wp-media:".length))),
    ...(article.source.coverMedia ? [article.source.coverMedia.wpId] : []),
  ]));
  const media = source.data.media as Media[];
  const selectedMedia = media.filter((item) => usedWpIds.has(item.wp_id));
  if (selectedMedia.length !== usedWpIds.size) throw new Error("source media mapping is incomplete");
  const sourceMediaSnapshot = await readMediaSnapshot(root, selectedMedia);
  const sourceSha256 = sourceManifestSha256(source, sourceMediaSnapshot);
  if (conversion.sourceJsonSha256 !== source.sourceJsonSha256 || conversion.sourceSha256 !== sourceSha256) {
    throw new Error("conversion source snapshot differs from current source JSON/media bytes");
  }
  return buildApprovalTemplate(sourceSha256, conversionBytes, conversion.articles);
}

export async function importBlog(root: string, conversionBytes: Uint8Array, approval: Approval, execute: boolean) {
  await assertSourceTree(root);
  const conversion = JSON.parse(Buffer.from(conversionBytes).toString("utf8")) as Conversion;
  const source = await readSourceJsonSnapshot(root);
  const dryRun = analyzeBlogSources(root, source.data);
  if (dryRun.blockers.length) throw new Error(`source preflight has ${dryRun.blockers.length} blockers`);
  if (!conversion.articles.length) throw new Error("conversion contains no articles");
  const mediaCatalog = source.data.media as Media[];
  const byWp = new Map(mediaCatalog.map((item) => [item.wp_id, item]));
  const allRefs = new Set(conversion.articles.flatMap((article) => [
    ...article.mediaRefs,
    ...(article.source.coverMedia ? [article.source.coverMedia.ref] : []),
  ]));
  const sourceMedia = [...allRefs].map((ref) => {
    const match = /^wp-media:([1-9]\d*)$/.exec(ref);
    const item = match ? byWp.get(Number(match[1])) : undefined;
    if (!item) throw new Error(`unresolved source media ${ref}`);
    return item;
  }).filter((item, index, rows) => rows.findIndex((other) => other.id === item.id) === index);
  const sourceMediaSnapshot = await readMediaSnapshot(root, sourceMedia);
  const sourceSha256 = sourceManifestSha256(source, sourceMediaSnapshot);
  if (conversion.sourceJsonSha256 !== source.sourceJsonSha256 || conversion.sourceSha256 !== sourceSha256) {
    throw new Error("conversion source snapshot differs from current source JSON/media bytes");
  }
  assertApproved(sourceSha256, conversionBytes, approval, conversion.articles);
  if (conversion.articles.some((article) => article.documentSchemaVersion !== BLOG_DOCUMENT_SCHEMA_VERSION)) throw new Error("unsupported document schema version");
  const sourceLocalIdByWp = new Map(sourceMedia.map((item) => [item.wp_id, item.id]));
  const sourceMediaIds = new Set(sourceMedia.map((item) => item.id));
  for (const article of conversion.articles) {
    if (!article.source.slug) {
      throw new Error(`invalid slug/date for article ${article.source.wpId}`);
    }
    try { publicationInstant(article.source.publishedAtUtc); } catch {
      throw new Error(`invalid slug/date for article ${article.source.wpId}`);
    }
    const draftDoc = remapDocument(article.document, new Map([...sourceLocalIdByWp].map(([wpId, localId]) => [`wp-media:${wpId}`, localId])));
    await validateBlogDocument(draftDoc, { schemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION, hasMedia: (id) => /^\d+$/.test(id) && sourceMediaIds.has(Number(id)) });
  }
  if (new Set(conversion.articles.map(({ source }) => source.slug)).size !== conversion.articles.length) throw new Error("conversion contains duplicate slugs");

  const prepared: PreparedMedia[] = [];
  for (const item of sourceMedia) {
    const bytes = sourceMediaSnapshot.bytesById.get(item.id);
    if (!bytes) throw new Error(`source media was not included in the verified snapshot: ${item.id}`);
    const metadata = await sharp(bytes, { limitInputPixels: 100_000_000 }).metadata();
    const formats = { jpeg: ["jpg", "image/jpeg"], png: ["png", "image/png"], webp: ["webp", "image/webp"] } as const;
    const format = metadata.format as keyof typeof formats;
    const descriptor = formats[format];
    if (!descriptor || !metadata.width || !metadata.height) throw new Error(`unsupported/corrupt source media ${item.storage_path}`);
    const hash = digest(bytes);
    prepared.push({ source: item, bytes, hash, sourceFingerprint: fingerprint({ id: item.id, wpId: item.wp_id, storagePath: item.storage_path, filename: item.original_filename, alt: item.alt_text, hash }), key: `blog-import/sha256/${hash}.${descriptor[0]}`, mime: descriptor[1], width: metadata.width, height: metadata.height });
  }

  // Resolve existing IDs and reject all collisions before the first object upload.
  const existingMappings = await db.orm.public.BlogImportMapping.all();
  const mappings = new Map(existingMappings.filter((row) => row.source === SOURCE).map((row) => [row.sourceId, row]));
  const existingAssets = await db.orm.public.MediaAsset.all();
  const idsByWp = new Map<number, number>();
  const missingMedia: PreparedMedia[] = [];
  for (const item of prepared) {
    const row = mappings.get(`media:${item.source.id}`);
    if (!row) { missingMedia.push(item); continue; }
    if (row.targetKind !== "media" || row.fingerprint !== item.sourceFingerprint) throw new Error(`source media mapping changed: ${item.source.id}`);
    const asset = existingAssets.find((candidate) => candidate.id === row.targetId);
    const originalName = path.basename(item.source.original_filename || item.source.storage_path);
    if (!asset || asset.objectKey !== item.key || asset.mimeType !== item.mime || Number(asset.sizeBytes) !== item.bytes.length || asset.width !== item.width || asset.height !== item.height || asset.defaultAlt !== item.source.alt_text || asset.originalName !== originalName) throw new Error(`mapped destination media changed: ${item.source.id}`);
    idsByWp.set(item.source.wp_id, row.targetId);
  }
  const categoryRows = new Map<number, number>();
  const categories = new Map<number, { name: string; slug: string }>();
  for (const article of conversion.articles) for (const category of article.source.categories) categories.set(category.sourceLocalId, { name: category.name, slug: category.slug });
  const existingCategories = await db.orm.public.BlogCategory.all();
  for (const [localId, category] of categories) {
    const row = mappings.get(`category:${localId}`);
    if (row && (row.targetKind !== "category" || row.fingerprint !== fingerprint(category))) throw new Error(`category mapping changed: ${localId}`);
    if (row) {
      const destination = existingCategories.find((candidate) => candidate.id === row.targetId);
      if (!destination || destination.name !== category.name || destination.slug !== category.slug) throw new Error(`mapped destination category changed: ${localId}`);
      categoryRows.set(localId, row.targetId);
    }
  }
  const existingPosts = await db.orm.public.BlogPost.all();
  const existingPublications = await db.orm.public.BlogPublication.all();
  const existingPostCategories = await db.orm.public.BlogPostCategory.all();
  const existingPublicationCategories = await db.orm.public.BlogPublicationCategory.all();
  for (const article of conversion.articles) {
    const row = mappings.get(`post:${article.source.wpId}`);
    if (row && (row.targetKind !== "post" || row.fingerprint !== fingerprint({ sourceWpId: article.source.wpId, slug: article.source.slug }))) throw new Error(`post source mapping changed: ${article.source.wpId}`);
    if (row) {
      const current = existingPosts.find((post) => post.id === row.targetId);
      if (!current) throw new Error(`mapped destination post disappeared: ${article.source.wpId}`);
      const mappedDocument = asJson(remapDocument(article.document, new Map([...idsByWp].map(([wpId, id]) => [`wp-media:${wpId}`, id]))));
      const coverId = article.source.coverMedia ? idsByWp.get(article.source.coverMedia.wpId) : null;
      if (article.source.coverMedia && !coverId) throw new Error(`mapped post has no persistent cover mapping: ${article.source.wpId}`);
      const expected = { slug: article.source.slug, title: article.source.title, excerpt: article.source.excerpt, document: mappedDocument,
        documentSchemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION, coverMediaId: coverId ?? null,
        coverAlt: article.source.coverMedia?.catalogAlt ?? null, seoTitle: article.source.seoTitle, seoDescription: article.source.seoDescription };
      const expectedCategoryIds = article.source.categories.map((category) => {
        const id = categoryRows.get(category.sourceLocalId);
        if (!id) throw new Error(`persistent category mapping missing for imported post ${article.source.wpId}`);
        return id;
      });
      const publication = existingPublications.find((candidate) => candidate.postId === row.targetId) as unknown as Record<string, unknown> | undefined;
      try {
        assertImportedSnapshot(expected, current as unknown as Record<string, unknown>, publication ?? null,
          existingPostCategories.filter((relation) => relation.postId === row.targetId).map((relation) => relation.categoryId),
          existingPublicationCategories.filter((relation) => relation.publicationPostId === row.targetId).map((relation) => relation.categoryId),
          expectedCategoryIds, article.source.publishedAtUtc);
      } catch (error) {
        throw new Error(`cannot safely re-import post ${article.source.wpId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (existingPosts.some((post) => post.slug === article.source.slug)) {
      throw new Error(`slug already exists without an import mapping: ${article.source.slug}`);
    }
  }

  const s3 = getS3Client();
  const bucket = getBlogMediaBucket();
  const uploaded: Array<{ item: PreparedMedia; created: boolean }> = [];
  const uploadedKeys: string[] = [];
  try {
    for (const item of prepared) {
      let created = false;
      try {
        await verifyObject(s3, bucket, item);
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404 && (error as { name?: string }).name !== "NotFound") throw error;
        if (!execute) { uploaded.push({ item, created: false }); continue; }
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: item.key, Body: item.bytes, ContentLength: item.bytes.length, ContentType: item.mime, IfNoneMatch: "*", Metadata: { sha256: item.hash } }));
        uploadedKeys.push(item.key);
        await verifyObject(s3, bucket, item);
        created = true;
      }
      uploaded.push({ item, created });
    }
  } catch (error) {
    const note = uploadedKeys.length ? `; verified-or-pending immutable objects retained for safe retry: ${uploadedKeys.join(", ")}` : "";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${note}`);
  }

  if (!execute) return { mode: "preflight", articles: conversion.articles.length, media: prepared.length, missingMediaMappings: missingMedia.length, uploadsNeeded: uploaded.filter(({ created }) => created).length };

  // Object writes are immutable/content-addressed. On DB failure they are retained as safe orphans;
  // deleting here could race another import that has already referenced the same hash.
  try { return await db.transaction(async (tx) => {
    const txMappings = await tx.orm.public.BlogImportMapping.all();
    const currentMappings = new Map(txMappings.filter((row) => row.source === SOURCE).map((row) => [row.sourceId, row]));
    const mediaIds = new Map(idsByWp);
    for (const item of prepared) {
      const sourceId = `media:${item.source.id}`;
      let row = currentMappings.get(sourceId);
      if (!row) {
        const asset = await tx.orm.public.MediaAsset.create({ objectKey: item.key, originalName: path.basename(item.source.original_filename || item.source.storage_path), mimeType: item.mime, sizeBytes: BigInt(item.bytes.length), width: item.width, height: item.height, defaultAlt: item.source.alt_text });
        row = await tx.orm.public.BlogImportMapping.create({ source: SOURCE, sourceId, targetKind: "media", targetId: asset.id, fingerprint: item.sourceFingerprint });
      }
      if (row.targetKind !== "media" || row.fingerprint !== item.sourceFingerprint) throw new Error(`concurrent source media mapping conflict: ${sourceId}`);
      mediaIds.set(item.source.wp_id, row.targetId);
    }
    for (const [localId, category] of categories) {
      const sourceId = `category:${localId}`;
      let row = currentMappings.get(sourceId);
      if (!row) {
        const categoryRow = await tx.orm.public.BlogCategory.create(category);
        row = await tx.orm.public.BlogImportMapping.create({ source: SOURCE, sourceId, targetKind: "category", targetId: categoryRow.id, fingerprint: fingerprint(category) });
      }
      if (row.targetKind !== "category" || row.fingerprint !== fingerprint(category)) throw new Error(`concurrent category mapping conflict: ${sourceId}`);
      categoryRows.set(localId, row.targetId);
    }
    const knownMediaIds = new Set(mediaIds.values());
    for (const article of conversion.articles) {
      const document = remapDocument(article.document, new Map([...mediaIds].map(([wpId, id]) => [`wp-media:${wpId}`, id])));
      const validatedDocument = await validateBlogDocument(document, { schemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION, hasMedia: (id) => /^\d+$/.test(id) && knownMediaIds.has(Number(id)) });
      const coverId = article.source.coverMedia ? mediaIds.get(article.source.coverMedia.wpId) : null;
      if (article.source.coverMedia && !coverId) throw new Error(`cover media mapping missing for post ${article.source.wpId}`);
      const payload = { slug: article.source.slug, title: article.source.title, excerpt: article.source.excerpt, document: asJson(validatedDocument),
        documentSchemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION, coverMediaId: coverId ?? null,
        coverAlt: article.source.coverMedia?.catalogAlt ?? null, seoTitle: article.source.seoTitle, seoDescription: article.source.seoDescription };
      const sourceId = `post:${article.source.wpId}`;
      const mapping = currentMappings.get(sourceId);
      if (mapping) {
        const current = await tx.orm.public.BlogPost.where({ id: mapping.targetId }).forUpdate().first();
        const publication = await tx.orm.public.BlogPublication.where({ postId: mapping.targetId }).forUpdate().first();
        const expectedCategoryIds = article.source.categories.map((category) => {
          const id = categoryRows.get(category.sourceLocalId);
          if (!id) throw new Error(`persistent category mapping missing for imported post ${article.source.wpId}`);
          return id;
        });
        const currentPostCategories = await tx.orm.public.BlogPostCategory.where({ postId: mapping.targetId }).all();
        const currentLiveCategories = await tx.orm.public.BlogPublicationCategory.where({ publicationPostId: mapping.targetId }).all();
        assertImportedSnapshot(payload, current as unknown as Record<string, unknown> | null,
          publication as unknown as Record<string, unknown> | null,
          currentPostCategories.map((relation) => relation.categoryId), currentLiveCategories.map((relation) => relation.categoryId),
          expectedCategoryIds, article.source.publishedAtUtc);
        continue;
      }
      const slugCollision = await tx.orm.public.BlogPost.where({ slug: payload.slug }).first();
      if (slugCollision) throw new Error(`slug collision during import: ${payload.slug}`);
      const publishedAt = publicationInstant(article.source.publishedAtUtc);
      const post = await tx.orm.public.BlogPost.create({ ...payload, firstPublishedAt: publishedAt });
      const publication = await tx.orm.public.BlogPublication.create({
        postId: post.id, title: payload.title, excerpt: payload.excerpt, document: payload.document,
        documentSchemaVersion: payload.documentSchemaVersion, coverMediaId: payload.coverMediaId,
        coverAlt: payload.coverAlt, seoTitle: payload.seoTitle, seoDescription: payload.seoDescription,
        publishedAt,
      });
      for (const category of article.source.categories) {
        const categoryId = categoryRows.get(category.sourceLocalId);
        if (!categoryId) throw new Error(`category mapping missing: ${category.sourceLocalId}`);
        await tx.orm.public.BlogPostCategory.create({ postId: post.id, categoryId });
        await tx.orm.public.BlogPublicationCategory.create({ publicationPostId: publication.postId, categoryId });
      }
      await tx.orm.public.BlogImportMapping.create({ source: SOURCE, sourceId, targetKind: "post", targetId: post.id, fingerprint: fingerprint({ sourceWpId: article.source.wpId, slug: article.source.slug }) });
    }
    return { mode: "imported", articles: conversion.articles.length, media: prepared.length };
  }); } catch (error) {
    const note = uploadedKeys.length ? `; immutable objects retained for safe retry (no source or existing object was deleted): ${uploadedKeys.join(", ")}` : "";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${note}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const execute = args.includes("--execute");
    const positional = args.filter((arg) => arg !== "--execute");
    if (positional.length !== 3) throw new Error("usage: blog:import <source-root> <final-conversion.json> <approval.json> [--execute]");
    const [root, conversionPath, approvalPath] = positional.map((value) => path.resolve(value));
    const conversionBytes = await readFile(conversionPath);
    const approval = JSON.parse(await readFile(approvalPath, "utf8")) as Approval;
    const result = await importBlog(root, conversionBytes, approval, execute);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`blog import aborted: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
