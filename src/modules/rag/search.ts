import "server-only";

import { embed } from "@/ai/embedding";
import { db } from "@/infrastructure/prisma/db";
import { AMENITY_KEYS } from "@/modules/listings/listing-admin-fields";

const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 100_000;

export type RagSearchFilters = {
  amenities?: string[];
  categories?: string[];
  guestsMin?: number | null;
  bedroomsMin?: number | null;
  bathroomsMin?: number | null;
  parkingMin?: number | null;
  location?: string | null;
  building?: string | null;
  petsAllowed?: boolean | null;
  minStayNightsMax?: number | null;
  checkInBySeconds?: number | null;
  checkOutFromSeconds?: number | null;
};

export type RagSearchResult = {
  sourceType: "blog" | "listing";
  sourceId: string;
  url: string;
  title: string;
  section: string;
  text: string;
  score: number;
  contentHash: string;
  imageUrl: string | null;
};

export type RagSearchPage = {
  results: RagSearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type ValidatedRagSearchInput = { query: string; page: number; pageSize: number; amenities: string[]; categories: string[]; guestsMin: number | null; bedroomsMin: number | null; bathroomsMin: number | null; parkingMin: number | null; location: string | null; building: string | null; petsAllowed: boolean | null; minStayNightsMax: number | null; checkInBySeconds: number | null; checkOutFromSeconds: number | null };

export function validateRagSearchInput(input: { query: string; filters?: RagSearchFilters; page?: number; pageSize?: number }): ValidatedRagSearchInput {
  if (!input || typeof input.query !== "string" || !input.query.trim() || input.query.length > 1000) {
    throw new Error("query must be a non-empty string of at most 1000 characters");
  }
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 10;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new Error(`page must be between 1 and ${MAX_PAGE}`);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new Error(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);

  const filters = input.filters ?? {};
  const allowed = ["amenities", "categories", "guestsMin", "bedroomsMin", "bathroomsMin", "parkingMin", "location", "building", "petsAllowed", "minStayNightsMax", "checkInBySeconds", "checkOutFromSeconds"];
  if (!filters || typeof filters !== "object" || Array.isArray(filters) || Object.keys(filters).some((key) => !allowed.includes(key))) {
    throw new Error("unsupported RAG search filter");
  }
  const amenities = filters.amenities ?? [];
  const categories = filters.categories ?? [];
  if (!Array.isArray(amenities) || amenities.some((key) => typeof key !== "string" || !(AMENITY_KEYS as readonly string[]).includes(key)) || new Set(amenities).size !== amenities.length) {
    throw new Error("amenities must contain unique known amenity keys");
  }
  if (!Array.isArray(categories) || categories.some((slug) => typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) || new Set(categories).size !== categories.length) {
    throw new Error("categories must contain unique category slugs");
  }
  const guestsMin = filters.guestsMin;
  if (guestsMin != null && (!Number.isSafeInteger(guestsMin) || guestsMin < 1 || guestsMin > 100)) {
    throw new Error("guestsMin must be an integer between 1 and 100");
  }
  const numbers = ["bedroomsMin", "bathroomsMin", "parkingMin", "minStayNightsMax"] as const;
  for (const key of numbers) if (filters[key] != null && (!Number.isSafeInteger(filters[key]) || filters[key] < 0 || filters[key] > 100)) throw new Error(`${key} must be an integer between 0 and 100`);
  for (const key of ["checkInBySeconds", "checkOutFromSeconds"] as const) if (filters[key] != null && (!Number.isSafeInteger(filters[key]) || filters[key] < 0 || filters[key] > 86399)) throw new Error(`${key} must be a valid time`);
  for (const key of ["location", "building"] as const) if (filters[key] != null && (typeof filters[key] !== "string" || !filters[key].trim() || filters[key].length > 120)) throw new Error(`${key} must be text of at most 120 characters`);
  if (filters.petsAllowed != null && typeof filters.petsAllowed !== "boolean") throw new Error("petsAllowed must be boolean");
  return { query: input.query.trim(), page, pageSize, amenities, categories, guestsMin: guestsMin ?? null, bedroomsMin: filters.bedroomsMin ?? null, bathroomsMin: filters.bathroomsMin ?? null, parkingMin: filters.parkingMin ?? null, location: filters.location ?? null, building: filters.building ?? null, petsAllowed: filters.petsAllowed ?? null, minStayNightsMax: filters.minStayNightsMax ?? null, checkInBySeconds: filters.checkInBySeconds ?? null, checkOutFromSeconds: filters.checkOutFromSeconds ?? null };
}

/**
 * Searches only currently eligible, synchronized sources. Listing filters are
 * mandatory predicates in SQL; unknown capacity never satisfies a minimum.
 */
export async function searchRag(input: {
  query: string;
  filters?: RagSearchFilters;
  page?: number;
  pageSize?: number;
}): Promise<RagSearchPage> {
  const validated = validateRagSearchInput(input);
  if (validated.categories.length) {
    const found = await db.runtime().query(db.raw.sql`SELECT slug FROM "ListingTerm"
      WHERE taxonomy = 'hp_listing_category' AND slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(validated.categories)}::jsonb))`
      .returnsRow({ slug: "pg/text@1" }).build());
    if (found.length !== validated.categories.length) throw new Error("categories must be existing listing category slugs");
  }

  const vector = await embed(validated.query);
  // The interpolated vector is generated from finite floats and cast by PostgreSQL;
  // all user-controlled search/filter data remains bound as query parameters.
  const vectorLiteral = `[${vector.map((value) => {
    if (!Number.isFinite(value)) throw new Error("query embedding contains an invalid value");
    return value;
  }).join(",")}]`;
  const offset = (validated.page - 1) * validated.pageSize;
  const rows = await db.runtime().query(db.raw.sql`WITH eligible AS (
      SELECT s.id AS "ragSourceId", s."sourceType", s."sourceId", s."canonicalUrl", s.title, s."contentHash",
        c.id AS "chunkId", c.section, c.text,
        1 - (c.embedding <=> ${vectorLiteral}::vector) AS semantic_score,
        ts_rank_cd(to_tsvector('simple', s.title || ' ' || c.section || ' ' || c.text),
          websearch_to_tsquery('simple', ${validated.query})) AS text_score
      FROM "RagSource" s
      JOIN "RagChunk" c ON c."sourceId" = s.id
      WHERE NOT EXISTS (
        SELECT 1 FROM "RagSourceQueue" q WHERE q."sourceType" = s."sourceType"
          AND q."sourceId" = s."sourceId" AND (q.status IN ('pending', 'processing') OR (q.status = 'failed' AND q."lastError" IS NOT NULL))
      )
        AND ((jsonb_array_length(${JSON.stringify(validated.amenities)}::jsonb) = 0 AND jsonb_array_length(${JSON.stringify(validated.categories)}::jsonb) = 0 AND ${validated.guestsMin === null}::boolean AND ${validated.bedroomsMin === null}::boolean AND ${validated.bathroomsMin === null}::boolean AND ${validated.parkingMin === null}::boolean AND ${validated.location === null}::boolean AND ${validated.building === null}::boolean AND ${validated.petsAllowed === null}::boolean AND ${validated.minStayNightsMax === null}::boolean AND ${validated.checkInBySeconds === null}::boolean AND ${validated.checkOutFromSeconds === null}::boolean) OR s."sourceType" = 'listing')
        AND (s."sourceType" <> 'blog' OR EXISTS (
          SELECT 1 FROM "BlogPublication" p WHERE p."postId"::text = s."sourceId" AND p."publishedAt" <= CURRENT_TIMESTAMP
        ))
        AND (s."sourceType" <> 'listing' OR EXISTS (
          SELECT 1 FROM "Listing" l WHERE l.id::text = s."sourceId" AND l.active = true AND l."archivedAt" IS NULL
            AND (jsonb_array_length(${JSON.stringify(validated.amenities)}::jsonb) = 0 OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(validated.amenities)}::jsonb) AS required(key)
              WHERE l.attributes ->> required.key IS DISTINCT FROM '1'
            ))
            AND (NOT ${validated.guestsMin !== null}::boolean OR l."maxGuests" >= ${validated.guestsMin ?? 0})
            AND (NOT ${validated.bedroomsMin !== null}::boolean OR CASE WHEN l.attributes ->> 'bedrooms' ~ '^[0-9]+$' THEN (l.attributes ->> 'bedrooms')::int >= ${validated.bedroomsMin ?? 0} ELSE false END)
            AND (NOT ${validated.bathroomsMin !== null}::boolean OR CASE WHEN l.attributes ->> 'bathrooms' ~ '^[0-9]+$' THEN (l.attributes ->> 'bathrooms')::int >= ${validated.bathroomsMin ?? 0} ELSE false END)
            AND (NOT ${validated.parkingMin !== null}::boolean OR CASE WHEN l.attributes ->> 'parking' ~ '^[0-9]+$' THEN (l.attributes ->> 'parking')::int >= ${validated.parkingMin ?? 0} ELSE false END)
            AND (NOT ${validated.location !== null}::boolean OR strpos(lower(l.attributes ->> 'location'), lower(${validated.location ?? ''})) > 0)
            AND (NOT ${validated.building !== null}::boolean OR strpos(lower(l.attributes ->> 'building'), lower(${validated.building ?? ''})) > 0)
            AND (NOT ${validated.petsAllowed !== null}::boolean OR l."petsAllowed" = ${validated.petsAllowed ?? false}::boolean)
            AND (NOT ${validated.minStayNightsMax !== null}::boolean OR l."minStayNights" <= ${validated.minStayNightsMax ?? 0})
            AND (NOT ${validated.checkInBySeconds !== null}::boolean OR l."checkInSeconds" <= ${validated.checkInBySeconds ?? 0})
            AND (NOT ${validated.checkOutFromSeconds !== null}::boolean OR l."checkOutSeconds" >= ${validated.checkOutFromSeconds ?? 0})
            AND (jsonb_array_length(${JSON.stringify(validated.categories)}::jsonb) = 0 OR EXISTS (
              SELECT 1 FROM "ListingTermAssignment" a JOIN "ListingTerm" t ON t.id = a."termId"
              WHERE a."listingId" = l.id AND t.taxonomy = 'hp_listing_category'
                AND t.slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(validated.categories)}::jsonb))
              GROUP BY a."listingId" HAVING count(DISTINCT t.slug) = jsonb_array_length(${JSON.stringify(validated.categories)}::jsonb)
            ))
        ))
    ), ranked_chunks AS (
      SELECT *, (0.65 * greatest(semantic_score, 0) + 0.35 * text_score) AS score,
        row_number() OVER (PARTITION BY "ragSourceId" ORDER BY (0.65 * greatest(semantic_score, 0) + 0.35 * text_score) DESC, "chunkId") AS chunk_rank
      FROM eligible WHERE semantic_score > 0 OR text_score > 0
    ), totals AS (
      SELECT count(*)::int AS total_count FROM ranked_chunks WHERE chunk_rank = 1
    )
    SELECT page."sourceType", page."sourceId", page."canonicalUrl", page.title, page."contentHash", page.section, page.text,
      CASE WHEN page."mediaId" IS NULL THEN NULL ELSE '/api/media/' || page."mediaId"::text END AS "imageUrl",
      page.score::float8 AS score, totals.total_count
    FROM totals LEFT JOIN LATERAL (
      SELECT ranked_chunks."sourceType", ranked_chunks."sourceId", ranked_chunks."canonicalUrl", ranked_chunks.title,
        ranked_chunks."contentHash", ranked_chunks.section, ranked_chunks.text, ranked_chunks.score,
        CASE ranked_chunks."sourceType"
          WHEN 'listing' THEN COALESCE(
            (SELECT l."coverMediaId" FROM "Listing" l WHERE l.id::text = ranked_chunks."sourceId" AND l.active = true AND l."archivedAt" IS NULL),
            (SELECT lm."mediaId" FROM "ListingMedia" lm JOIN "Listing" l ON l.id = lm."listingId"
             WHERE l.id::text = ranked_chunks."sourceId" AND l.active = true AND l."archivedAt" IS NULL ORDER BY lm.position LIMIT 1))
          WHEN 'blog' THEN (SELECT p."coverMediaId" FROM "BlogPublication" p
             WHERE p."postId"::text = ranked_chunks."sourceId" AND p."publishedAt" <= CURRENT_TIMESTAMP)
          ELSE NULL
        END AS "mediaId"
      FROM ranked_chunks WHERE chunk_rank = 1
      ORDER BY score DESC, "sourceType", "sourceId"
      LIMIT ${validated.pageSize} OFFSET ${offset}
    ) page ON TRUE`
    .returnsRow({ sourceType: { codecId: "pg/text@1", nullable: true }, sourceId: { codecId: "pg/text@1", nullable: true }, canonicalUrl: { codecId: "pg/text@1", nullable: true }, title: { codecId: "pg/text@1", nullable: true }, contentHash: { codecId: "pg/text@1", nullable: true }, section: { codecId: "pg/text@1", nullable: true }, text: { codecId: "pg/text@1", nullable: true }, imageUrl: { codecId: "pg/text@1", nullable: true }, score: { codecId: "pg/float8@1", nullable: true }, total_count: "pg/int4@1" }).build());

  return {
    results: rows.flatMap((row) => row.sourceId === null ? [] : [{ sourceType: row.sourceType as RagSearchResult["sourceType"], sourceId: row.sourceId,
      url: row.canonicalUrl!, title: row.title!, section: row.section!, text: row.text!, score: row.score!, contentHash: row.contentHash!, imageUrl: row.imageUrl ?? null }]),
    totalCount: rows[0]?.total_count ?? 0,
    page: validated.page,
    pageSize: validated.pageSize,
  };
}
