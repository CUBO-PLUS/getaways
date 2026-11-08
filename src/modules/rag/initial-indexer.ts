import "server-only";
import { Temporal } from "temporal-polyfill";

import { db } from "../../infrastructure/prisma/db.ts";
import { enqueueRagSource } from "../../infrastructure/prisma/rag-source-queue.ts";
import {
  countDocumentTokens,
  EMBEDDING_CONTEXT_TOKENS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_MODEL_REVISION,
  RAG_CHUNK_TOKEN_LIMIT,
} from "../../ai/embedding.ts";
import { chunkRagSourceByTokens, extractBlogPublication, extractPublicListing, isIndexableRagSource, type RagSource } from "./initial-index.ts";

const MAX_BATCH_SIZE = 32;
export type InitialIndexReport = {
  dryRun: boolean;
  eligible: number;
  queued: number;
  unchanged: number;
  omitted: number;
  failed: number;
  chunks: number;
  failures: string[];
};

async function process(source: RagSource, report: InitialIndexReport) {
  report.eligible++;
  if (!isIndexableRagSource(source)) {
    report.omitted++;
    if (!report.dryRun) {
      try {
        await db.transaction((tx) => enqueueRagSource(tx, source.sourceType, source.sourceId));
        report.queued++;
      } catch {
        report.failed++;
        report.failures.push(`${source.sourceType}:${source.sourceId}`);
      }
    }
    return;
  }
  try {
    if (report.dryRun) {
      report.chunks += (await chunkRagSourceByTokens(source, countDocumentTokens, RAG_CHUNK_TOKEN_LIMIT)).length;
      return;
    }
    const existing = await db.orm.public.RagSource.where({ sourceType: source.sourceType, sourceId: source.sourceId }).first();
    if (existing?.contentHash === source.contentHash && existing.canonicalUrl === source.url && existing.extractorVersion === source.extractorVersion &&
      existing.embeddingModel === EMBEDDING_MODEL && existing.embeddingRevision === EMBEDDING_MODEL_REVISION &&
      existing.embeddingDimensions === EMBEDDING_DIMENSIONS) {
      report.unchanged++;
      return;
    }
    await db.transaction((tx) => enqueueRagSource(tx, source.sourceType, source.sourceId));
    report.queued++;
  } catch {
    report.failed++;
    report.failures.push(`${source.sourceType}:${source.sourceId}`);
  }
}

async function processPublications(after: number, limit: number, report: InitialIndexReport) {
  const rows = await db.orm.public.BlogPublication
    .where((publication) => publication.postId.gt(after))
    .where((publication) => publication.publishedAt.lte(Temporal.Now.instant()))
    .select("postId", "title", "excerpt", "document", "publishedAt")
    .include("post", (post) => post.select("slug"))
    .include("categories", (categories) => categories.select("categoryId").include("category", (category) => category.select("name")))
    .orderBy((publication) => publication.postId.asc())
    .limit(limit)
    .all();
  for (const row of rows) {
    if (!row.post) {
      report.failed++;
      report.failures.push(`blog:${row.postId}`);
      continue;
    }
    const categories = row.categories.flatMap(({ category }) => category ? [category.name] : []);
    await process(extractBlogPublication({
      postId: row.postId, slug: row.post.slug, title: row.title, excerpt: row.excerpt,
      document: row.document, publishedAt: row.publishedAt.toString(), categories,
    }), report);
  }
  return rows.at(-1)?.postId ?? null;
}

async function processListings(after: number, limit: number, report: InitialIndexReport) {
  const rows = await db.orm.public.Listing
    .where({ active: true, archivedAt: null })
    .where((listing) => listing.id.gt(after))
    .select("id", "slug", "title", "contentHtml", "attributes", "maxGuests", "baseGuests", "petsAllowed", "minStayNights", "checkInSeconds", "checkOutSeconds")
    .include("terms", (assignments) => assignments.select("termId").include("term", (term) => term.select("taxonomy", "name")))
    .orderBy((listing) => listing.id.asc())
    .limit(limit)
    .all();
  for (const row of rows) {
    const categories = row.terms.flatMap(({ term }) => term?.taxonomy === "hp_listing_category" ? [term.name] : []);
    const petsTerms = row.terms.flatMap(({ term }) => term?.taxonomy === "hp_listing_pets" ? [term.name] : []);
    await process(extractPublicListing({
      id: row.id, slug: row.slug, title: row.title, contentHtml: row.contentHtml,
      attributes: row.attributes as Record<string, unknown>, maxGuests: row.maxGuests,
      baseGuests: row.baseGuests, petsAllowed: row.petsAllowed, minStayNights: row.minStayNights,
      checkInSeconds: row.checkInSeconds, checkOutSeconds: row.checkOutSeconds, categories, petsTerms,
    }), report);
  }
  return rows.at(-1)?.id ?? null;
}

async function removeIneligible(report: InitialIndexReport) {
  let after = 0;
  while (true) {
    const rows = await db.orm.public.RagSource.where((source) => source.id.gt(after))
      .orderBy((source) => source.id.asc()).limit(MAX_BATCH_SIZE).all();
    if (!rows.length) return;
    for (const source of rows) {
      const eligible = source.sourceType === "blog"
        ? Boolean(await db.orm.public.BlogPublication.where({ postId: Number(source.sourceId) })
          .where((publication) => publication.publishedAt.lte(Temporal.Now.instant())).first())
        : source.sourceType === "listing"
          ? Boolean(await db.orm.public.Listing.where({ id: Number(source.sourceId), active: true, archivedAt: null }).first())
          : false;
      if (!eligible) {
        await db.transaction((tx) => enqueueRagSource(tx, source.sourceType as "blog" | "listing", source.sourceId));
        report.queued++;
      }
    }
    after = rows.at(-1)!.id;
  }
}

/**
 * Reconciliation queues stale or missing sources; only the fenced worker publishes
 * embeddings. Writes require the caller to opt in explicitly.
 */
export async function runInitialRagIndex({ write = false, batchSize = MAX_BATCH_SIZE } = {}): Promise<InitialIndexReport> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`batchSize must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  const report: InitialIndexReport = {
    dryRun: !write, eligible: 0, queued: 0, unchanged: 0, omitted: 0, failed: 0, chunks: 0, failures: [],
  };
  let blogAfter = 0;
  while (true) {
    const last = await processPublications(blogAfter, batchSize, report);
    if (last === null) break;
    blogAfter = last;
  }
  let listingAfter = 0;
  while (true) {
    const last = await processListings(listingAfter, batchSize, report);
    if (last === null) break;
    listingAfter = last;
  }
  if (write && report.failed === 0) await removeIneligible(report);
  return report;
}

export { EMBEDDING_CONTEXT_TOKENS, RAG_CHUNK_TOKEN_LIMIT };
