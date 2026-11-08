import "server-only";

import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { db } from "../../infrastructure/prisma/db.ts";
import { countDocumentTokens, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_MODEL_REVISION, embedDocument, RAG_CHUNK_TOKEN_LIMIT } from "../../ai/embedding.ts";
import { chunkRagSourceByTokens, extractBlogPublication, extractPublicListing, isIndexableRagSource, type RagSource } from "./initial-index.ts";

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 60 * 60_000;

type Job = { sourceType: "blog" | "listing"; sourceId: string; generation: bigint; leaseToken: string; attempts: number };
export type RagWorkerReport = { claimed: number; indexed: number; unchanged: number; invalidated: number; superseded: number; failed: number };

async function claim(): Promise<Job | undefined> {
  const leaseToken = randomUUID();
  await db.runtime().execute(db.raw.sql`UPDATE "RagSourceQueue" SET status = 'failed', "lockedAt" = NULL,
    "leaseToken" = NULL, "lastError" = 'worker lease expired after retry limit', "updatedAt" = CURRENT_TIMESTAMP
    WHERE status = 'processing' AND attempts >= ${MAX_ATTEMPTS}
      AND "lockedAt" < CURRENT_TIMESTAMP - (${LEASE_MS} * interval '1 millisecond')`.affectedCount().build());
  const [job] = await db.runtime().query(db.raw.sql`WITH candidate AS (
      SELECT "sourceType", "sourceId" FROM "RagSourceQueue"
      WHERE (status = 'pending' AND "availableAt" <= CURRENT_TIMESTAMP)
         OR (status = 'processing' AND attempts < ${MAX_ATTEMPTS} AND "lockedAt" < CURRENT_TIMESTAMP - (${LEASE_MS} * interval '1 millisecond'))
      ORDER BY "availableAt", "updatedAt"
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE "RagSourceQueue" q SET status = 'processing', "lockedAt" = CURRENT_TIMESTAMP,
      "leaseToken" = ${leaseToken}, attempts = q.attempts + 1, "updatedAt" = CURRENT_TIMESTAMP
    FROM candidate c WHERE q."sourceType" = c."sourceType" AND q."sourceId" = c."sourceId"
    RETURNING q."sourceType", q."sourceId", q.generation, q."leaseToken", q.attempts`
    .returnsRow({ sourceType: "pg/text@1", sourceId: "pg/text@1", generation: "pg/int8@1", leaseToken: "pg/text@1", attempts: "pg/int4@1" }).build());
  return job as Job | undefined;
}

async function currentSource(job: Job): Promise<RagSource | undefined> {
  if (job.sourceType === "blog") {
    const publication = await db.orm.public.BlogPublication.where({ postId: Number(job.sourceId) })
      .where((row) => row.publishedAt.lte(Temporal.Now.instant())).select("postId", "title", "excerpt", "document", "publishedAt")
      .include("post", (post) => post.select("slug"))
      .include("categories", (categories) => categories.select("categoryId").include("category", (category) => category.select("name"))).first();
    if (!publication?.post) return undefined;
    return extractBlogPublication({ postId: publication.postId, slug: publication.post.slug, title: publication.title,
      excerpt: publication.excerpt, document: publication.document, publishedAt: publication.publishedAt.toString(),
      categories: publication.categories.flatMap(({ category }) => category ? [category.name] : []) });
  }
  const listing = await db.orm.public.Listing.where({ id: Number(job.sourceId), active: true, archivedAt: null })
    .select("id", "slug", "title", "contentHtml", "attributes", "maxGuests", "baseGuests", "petsAllowed", "minStayNights", "checkInSeconds", "checkOutSeconds")
    .include("terms", (assignments) => assignments.select("termId").include("term", (term) => term.select("taxonomy", "name"))).first();
  if (!listing) return undefined;
  const petsTerms = listing.terms.flatMap(({ term }) => term?.taxonomy === "hp_listing_pets" ? [term.name] : []);
  return extractPublicListing({ id: listing.id, slug: listing.slug, title: listing.title, contentHtml: listing.contentHtml,
    attributes: listing.attributes as Record<string, unknown>, maxGuests: listing.maxGuests, baseGuests: listing.baseGuests,
    petsAllowed: listing.petsAllowed, minStayNights: listing.minStayNights, checkInSeconds: listing.checkInSeconds,
    checkOutSeconds: listing.checkOutSeconds, categories: listing.terms.flatMap(({ term }) => term?.taxonomy === "hp_listing_category" ? [term.name] : []), petsTerms });
}

async function ownsLease(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], job: Job) {
  return tx.query(db.raw.sql`SELECT 1 AS owned FROM "RagSourceQueue" WHERE "sourceType" = ${job.sourceType}
    AND "sourceId" = ${job.sourceId} AND generation = ${job.generation} AND status = 'processing' AND "leaseToken" = ${job.leaseToken}
    FOR UPDATE`.returnsRow({ owned: "pg/int4@1" }).build());
}

async function invalidate(job: Job, report: RagWorkerReport) {
  const source = await currentSource(job);
  if (source && isIndexableRagSource(source)) {
    await db.runtime().execute(db.raw.sql`UPDATE "RagSourceQueue" SET status = 'pending', "lockedAt" = NULL,
      "leaseToken" = NULL, "attempts" = 0, "availableAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "sourceType" = ${job.sourceType} AND "sourceId" = ${job.sourceId} AND generation = ${job.generation}
      AND status = 'processing' AND "leaseToken" = ${job.leaseToken}`.affectedCount().build());
    return;
  }
  await db.transaction(async (tx) => {
    if (!(await ownsLease(tx, job)).length) { report.superseded++; return; }
    await tx.orm.public.RagSource.where({ sourceType: job.sourceType, sourceId: job.sourceId }).delete();
    await tx.execute(db.raw.sql`UPDATE "RagSourceQueue" SET status = 'failed', "lockedAt" = NULL, "leaseToken" = NULL,
      "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "sourceType" = ${job.sourceType} AND "sourceId" = ${job.sourceId}
      AND generation = ${job.generation} AND "leaseToken" = ${job.leaseToken}`.affectedCount().build());
    report.invalidated++;
  });
}

async function finish(job: Job, source: RagSource, chunks: Awaited<ReturnType<typeof chunkRagSourceByTokens>>, embeddings: number[][], report: RagWorkerReport) {
  return db.transaction(async (tx) => {
    if (!(await ownsLease(tx, job)).length) { report.superseded++; return; }
    // Every source writer must enqueue in the same transaction; generation fences writes
    // committed before this lock without taking source-row locks in reverse order.
    const existing = await tx.orm.public.RagSource.where({ sourceType: source.sourceType, sourceId: source.sourceId }).first();
    const row = existing
      ? await tx.orm.public.RagSource.where({ id: existing.id }).update({ canonicalUrl: source.url, title: source.title, contentHash: source.contentHash,
        extractorVersion: source.extractorVersion, embeddingModel: EMBEDDING_MODEL, embeddingRevision: EMBEDDING_MODEL_REVISION, embeddingDimensions: EMBEDDING_DIMENSIONS, indexedAt: Temporal.Now.instant() })
      : await tx.orm.public.RagSource.create({ sourceType: source.sourceType, sourceId: source.sourceId, canonicalUrl: source.url, title: source.title,
        contentHash: source.contentHash, extractorVersion: source.extractorVersion, embeddingModel: EMBEDDING_MODEL, embeddingRevision: EMBEDDING_MODEL_REVISION, embeddingDimensions: EMBEDDING_DIMENSIONS });
    if (!row) throw new Error("RAG source disappeared during publication");
    await tx.orm.public.RagChunk.where({ sourceId: row.id }).deleteAll();
    for (const [index, chunk] of chunks.entries()) await tx.orm.public.RagChunk.create({ sourceId: row.id, ordinal: chunk.ordinal,
      section: chunk.title, text: chunk.text, contentHash: chunk.contentHash, tokenCount: chunk.tokenCount, embedding: embeddings[index] });
    await tx.execute(db.raw.sql`UPDATE "RagSourceQueue" SET status = 'failed', "lockedAt" = NULL, "leaseToken" = NULL,
      "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "sourceType" = ${job.sourceType} AND "sourceId" = ${job.sourceId}
      AND generation = ${job.generation} AND "leaseToken" = ${job.leaseToken}`.affectedCount().build());
    report.indexed++;
  });
}

async function fail(job: Job, error: unknown) {
  const message = String(error).slice(0, 1000);
  const delay = Math.min(1_000 * 2 ** Math.max(0, job.attempts - 1), MAX_BACKOFF_MS);
  await db.runtime().execute(db.raw.sql`UPDATE "RagSourceQueue" SET status = ${job.attempts >= MAX_ATTEMPTS ? "failed" : "pending"},
    "availableAt" = CURRENT_TIMESTAMP + (${delay} * interval '1 millisecond'), "lockedAt" = NULL, "leaseToken" = NULL,
    "lastError" = ${message}, "updatedAt" = CURRENT_TIMESTAMP WHERE "sourceType" = ${job.sourceType} AND "sourceId" = ${job.sourceId}
    AND generation = ${job.generation} AND status = 'processing' AND "leaseToken" = ${job.leaseToken}`.affectedCount().build());
}

export async function runRagQueueBatch(limit = 10): Promise<RagWorkerReport> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be between 1 and 100");
  const report: RagWorkerReport = { claimed: 0, indexed: 0, unchanged: 0, invalidated: 0, superseded: 0, failed: 0 };
  for (let i = 0; i < limit; i++) {
    const job = await claim();
    if (!job) break;
    report.claimed++;
    try {
      const source = await currentSource(job);
      if (!source || !isIndexableRagSource(source)) { await invalidate(job, report); continue; }
      const previous = await db.orm.public.RagSource.where({ sourceType: source.sourceType, sourceId: source.sourceId }).first();
      if (previous?.contentHash === source.contentHash && previous.canonicalUrl === source.url && previous.extractorVersion === source.extractorVersion &&
        previous.embeddingModel === EMBEDDING_MODEL && previous.embeddingRevision === EMBEDDING_MODEL_REVISION && previous.embeddingDimensions === EMBEDDING_DIMENSIONS) {
        await db.runtime().execute(db.raw.sql`UPDATE "RagSourceQueue" SET status = 'failed', "lockedAt" = NULL, "leaseToken" = NULL,
          "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "sourceType" = ${job.sourceType} AND "sourceId" = ${job.sourceId}
          AND generation = ${job.generation} AND "leaseToken" = ${job.leaseToken}`.affectedCount().build());
        report.unchanged++;
        continue;
      }
      const chunks = await chunkRagSourceByTokens(source, countDocumentTokens, RAG_CHUNK_TOKEN_LIMIT);
      const embeddings: number[][] = [];
      for (const chunk of chunks) embeddings.push(await embedDocument(source.title, `${chunk.title}\n${chunk.text}`));
      await finish(job, source, chunks, embeddings, report);
    } catch (error) { await fail(job, error); report.failed++; }
  }
  return report;
}
