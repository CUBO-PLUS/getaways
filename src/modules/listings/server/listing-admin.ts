import "server-only";
import { Temporal } from "temporal-polyfill/full";
import { db } from "@/infrastructure/prisma/db";
import { enqueueRagSource } from "@/infrastructure/prisma/rag-source-queue";
import type { Role, Session } from "@/modules/auth/server/auth";
import {
  AMENITY_KEYS,
  LISTING_CATEGORY_TAXONOMY,
  activationProblems,
  applyDescriptiveAttributes,
  commercialProblem,
  type AmenityKey,
  type CommercialPatch,
  type CommercialValues,
  type ContentPatch,
  type StatusChange,
} from "@/modules/listings/listing-admin-fields";

/*
 * Listing administration (plan 4). ADMIN and EDITOR edit the descriptive
 * content; prices, capacity, policies and the lifecycle are ADMIN only. Every
 * mutation re-reads the staff account inside its transaction, locks the
 * listing row and compares the expected version, so a revoked session or a
 * concurrent edit never overwrites anything.
 *
 * Bookings keep the prices and conditions they were created with (their
 * pricing snapshot), so nothing here re-prices or re-checks existing bookings.
 * The public pages read PostgreSQL on every request (force-dynamic), so there
 * is no cache to invalidate after a commit.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Access = "editorial" | "admin";

const MAX_INT4 = 2_147_483_647;
const validId = (id: number) => Number.isSafeInteger(id) && id > 0 && id <= MAX_INT4;

export class ListingAdminError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409;
  constructor(status: 400 | 401 | 403 | 404 | 409, message: string) { super(message); this.status = status; }
}

export const listingAccessAllowed = (role: Role | string, access: Access) =>
  role === "ADMIN" || (access === "editorial" && role === "EDITOR");

export function requireListingAccess(actor: Session, access: Access) {
  if (!listingAccessAllowed(actor.role, access)) throw new ListingAdminError(403, "Access denied");
}

/** The role and session are checked again under lock: a revoked or demoted account writes nothing. */
async function recheck(tx: Transaction, actor: Session, access: Access) {
  const user = await tx.orm.public.AdminUser.where({ id: actor.id }).forUpdate().first();
  if (!user || !user.active || user.authVersion !== actor.authVersion) throw new ListingAdminError(401, "Your session has ended. Sign in again; your changes are still on the page.");
  if (!listingAccessAllowed(user.role, access)) throw new ListingAdminError(403, "Access denied");
}

async function lockListing(tx: Transaction, id: number, version: number) {
  if (!validId(id)) throw new ListingAdminError(404, "Listing not found");
  const listing = await tx.orm.public.Listing.where({ id }).forUpdate().first();
  if (!listing) throw new ListingAdminError(404, "Listing not found");
  if (listing.version !== version) throw new ListingAdminError(409, "Someone else saved this listing. Your changes are still on the page; reload to see the latest version.");
  return listing;
}

const conflict = () => new ListingAdminError(409, "Someone else saved this listing. Your changes are still on the page; reload to see the latest version.");

async function bookingCount(runner: { query: Transaction["query"] }, listingId: number): Promise<number> {
  const [row] = await runner.query(db.raw.sql`SELECT count(*)::int AS total FROM "Booking" WHERE "listingId" = ${listingId}`
    .returnsRow({ total: "pg/int4@1" }).build());
  return row?.total ?? 0;
}

export type ListingStatus = "active" | "inactive" | "archived";
export type ListingListFilters = { q: string; status: ListingStatus | "" };

export function parseListingListFilters(query: Record<string, string | string[] | undefined>): ListingListFilters | null {
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const q = value("q").trim();
  const status = value("status");
  if (q.length > 120 || !["", "active", "inactive", "archived"].includes(status)) return null;
  return { q, status: status as ListingListFilters["status"] };
}

export async function staffListingList(actor: Session, filters: ListingListFilters) {
  requireListingAccess(actor, "editorial");
  // ILIKE wildcards in the search text are matched literally.
  const pattern = `%${filters.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const rows = await db.runtime().query(db.raw.sql`SELECT l.id, l.slug, l.title, l.active, (l."archivedAt" IS NOT NULL) AS archived,
      (SELECT count(*)::int FROM "Booking" b WHERE b."listingId" = l.id) AS bookings
    FROM "Listing" l
    WHERE (l.title ILIKE ${pattern} ESCAPE '\\' OR l.slug ILIKE ${pattern} ESCAPE '\\')
      AND (${filters.status} = ''
        OR (${filters.status} = 'active' AND l.active AND l."archivedAt" IS NULL)
        OR (${filters.status} = 'inactive' AND NOT l.active AND l."archivedAt" IS NULL)
        OR (${filters.status} = 'archived' AND l."archivedAt" IS NOT NULL))
    ORDER BY l.title, l.id`
    .returnsRow({ id: "pg/int4@1", slug: "pg/text@1", title: "pg/text@1", active: "pg/bool@1", archived: "pg/bool@1", bookings: "pg/int4@1" }).build());
  return rows.map((row) => ({
    id: row.id, slug: row.slug, title: row.title,
    status: (row.archived ? "archived" : row.active ? "active" : "inactive") as ListingStatus,
    // The booking count only matters for lifecycle decisions, which are ADMIN's.
    bookings: actor.role === "ADMIN" ? row.bookings : null,
  }));
}

const asString = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : null);
const asSeoText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const asCount = (value: unknown) => {
  const parsed = Number(asString(value));
  return asString(value) !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export async function staffListingDetail(actor: Session, id: number) {
  requireListingAccess(actor, "editorial");
  if (!validId(id)) return null;
  const row = await db.orm.public.Listing.where({ id })
    .include("media", (media) => media.select("position", "mediaId", "alt", "roomGroup").include("media", (asset) => asset.select("id", "defaultAlt", "width", "height", "originalName")))
    .include("terms", (assignment) => assignment.select("termId").include("term", (term) => term.select("id", "name", "taxonomy")))
    .first();
  if (!row) return null;
  const [categories, bookings] = await Promise.all([
    db.orm.public.ListingTerm.where({ taxonomy: LISTING_CATEGORY_TAXONOMY }).all(),
    actor.role === "ADMIN" ? bookingCount(db.runtime(), id) : Promise.resolve(null),
  ]);
  const attributes = (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, unknown>;
  const commercial: CommercialValues = {
    pricePerNightCents: row.pricePerNightCents, cleaningFeeCents: row.cleaningFeeCents, extraGuestFeeCents: row.extraGuestFeeCents,
    petFeeCents: row.petFeeCents, ivaBasisPoints: row.ivaBasisPoints, tourismBasisPoints: row.tourismBasisPoints,
    maxGuests: row.maxGuests, baseGuests: row.baseGuests, petsAllowed: row.petsAllowed, minStayNights: row.minStayNights,
    checkInSeconds: row.checkInSeconds, checkOutSeconds: row.checkOutSeconds,
  };
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    status: (row.archivedAt ? "archived" : row.active ? "active" : "inactive") as ListingStatus,
    bookings,
    content: {
      title: row.title,
      description: row.contentHtml,
      location: asString(attributes.location),
      building: asString(attributes.building),
      bedrooms: asCount(attributes.bedrooms),
      bathrooms: asCount(attributes.bathrooms),
      parking: asCount(attributes.parking),
      videoUrl: asString(attributes.video_url),
      seoTitle: asSeoText(attributes.seo_title, 200),
      seoDescription: asSeoText(attributes.seo_description, 500),
      amenities: AMENITY_KEYS.filter((key) => attributes[key] != null && String(attributes[key]).trim() !== "") as AmenityKey[],
      categoryIds: row.terms.flatMap(({ term }) => (term && term.taxonomy === LISTING_CATEGORY_TAXONOMY ? [term.id] : [])),
      coverMediaId: row.coverMediaId,
      gallery: [...row.media].sort((a, b) => a.position - b.position).map((item) => ({
        mediaId: item.mediaId,
        // An empty stored alt is an explicit "decorative"; null falls back to the image's shared default.
        alt: item.alt ?? item.media?.defaultAlt ?? "",
        decorative: item.alt === "",
        roomGroup: item.roomGroup,
        width: item.media?.width ?? 0,
        height: item.media?.height ?? 0,
        name: item.media?.originalName ?? "",
      })),
    },
    commercial,
    categories: categories.map((term) => ({ id: term.id, name: term.name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type StaffListingDetail = NonNullable<Awaited<ReturnType<typeof staffListingDetail>>>;

/** Images that can be added to a gallery: the shared library, newest first. */
export async function staffMediaLibrary(actor: Session) {
  requireListingAccess(actor, "editorial");
  const rows = await db.orm.public.MediaAsset.select("id", "originalName", "width", "height", "defaultAlt").all();
  return rows.map((row) => ({ id: row.id, name: row.originalName, width: row.width, height: row.height, defaultAlt: row.defaultAlt }))
    .sort((a, b) => b.id - a.id);
}

export async function saveListingContent(actor: Session, id: number, patch: ContentPatch) {
  requireListingAccess(actor, "editorial");
  return db.transaction(async (tx) => {
    await recheck(tx, actor, "editorial");
    const current = await lockListing(tx, id, patch.version);

    const mediaIds = [...new Set([...(patch.gallery ?? []).map((item) => item.mediaId), ...(patch.coverMediaId ? [patch.coverMediaId] : [])])];
    if (mediaIds.length) {
      const found = await tx.orm.public.MediaAsset.where((asset) => asset.id.in(mediaIds)).select("id").all();
      if (found.length !== mediaIds.length) throw new ListingAdminError(400, "One of the images no longer exists. Reload the page and choose it again.");
    }
    if (patch.categoryIds?.length) {
      const terms = await tx.orm.public.ListingTerm.where((term) => term.id.in(patch.categoryIds!)).all();
      if (terms.length !== patch.categoryIds.length || terms.some((term) => term.taxonomy !== LISTING_CATEGORY_TAXONOMY)) {
        throw new ListingAdminError(400, "Choose existing categories only.");
      }
    }

    const updated = await tx.orm.public.Listing.where({ id, version: patch.version }).update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { contentHtml: patch.description } : {}),
      ...(patch.coverMediaId !== undefined ? { coverMediaId: patch.coverMediaId } : {}),
      attributes: applyDescriptiveAttributes(current.attributes, patch),
      version: patch.version + 1,
    });
    if (!updated) throw conflict();

    if (patch.gallery) {
      // Removing an image from this gallery only removes the association; the shared asset stays.
      // deleteAndCount, not delete: delete() removes only the first matching row.
      await tx.orm.public.ListingMedia.where({ listingId: id }).deleteAndCount();
      for (const [position, item] of patch.gallery.entries()) {
        await tx.orm.public.ListingMedia.create({ listingId: id, mediaId: item.mediaId, position, alt: item.decorative ? "" : item.alt, roomGroup: item.roomGroup });
      }
    }
    if (patch.categoryIds) {
      const assigned = await tx.orm.public.ListingTermAssignment.where({ listingId: id })
        .include("term", (term) => term.select("id", "taxonomy")).all();
      const wanted = new Set(patch.categoryIds);
      // Only category assignments change here; other taxonomies (pets) are left as they are.
      for (const assignment of assigned) {
        if (assignment.term?.taxonomy === LISTING_CATEGORY_TAXONOMY && !wanted.has(assignment.termId)) {
          await tx.orm.public.ListingTermAssignment.where({ listingId: id, termId: assignment.termId }).delete();
        }
      }
      const present = new Set(assigned.map((assignment) => assignment.termId));
      for (const termId of patch.categoryIds) {
        if (!present.has(termId)) await tx.orm.public.ListingTermAssignment.create({ listingId: id, termId });
      }
    }
    await enqueueRagSource(tx, "listing", id);
    return { version: updated.version };
  });
}

export async function saveListingCommercial(actor: Session, id: number, patch: CommercialPatch) {
  requireListingAccess(actor, "admin");
  return db.transaction(async (tx) => {
    await recheck(tx, actor, "admin");
    const current = await lockListing(tx, id, patch.version);
    const { version, ...changes } = patch;
    const merged: CommercialValues = {
      pricePerNightCents: current.pricePerNightCents, cleaningFeeCents: current.cleaningFeeCents,
      extraGuestFeeCents: current.extraGuestFeeCents, petFeeCents: current.petFeeCents,
      ivaBasisPoints: current.ivaBasisPoints, tourismBasisPoints: current.tourismBasisPoints,
      maxGuests: current.maxGuests, baseGuests: current.baseGuests, petsAllowed: current.petsAllowed,
      minStayNights: current.minStayNights, checkInSeconds: current.checkInSeconds, checkOutSeconds: current.checkOutSeconds,
      ...changes,
    };
    const problem = commercialProblem(merged, current.active);
    if (problem) throw new ListingAdminError(400, problem);
    // Existing bookings keep their own pricing snapshot; only new quotes use these values.
    const updated = await tx.orm.public.Listing.where({ id, version }).update({ ...changes, version: version + 1 });
    if (!updated) throw conflict();
    await enqueueRagSource(tx, "listing", id);
    return { version: updated.version };
  });
}

export async function changeListingStatus(actor: Session, id: number, change: StatusChange) {
  requireListingAccess(actor, "admin");
  return db.transaction(async (tx) => {
    await recheck(tx, actor, "admin");
    const current = await lockListing(tx, id, change.version);
    let values: { active?: boolean; archivedAt?: Temporal.Instant | null };
    switch (change.action) {
      case "activate": {
        if (current.archivedAt) throw new ListingAdminError(409, "Restore the listing from the archive before putting it on sale.");
        const missing = activationProblems(current);
        if (missing.length) throw new ListingAdminError(400, `Before it can go on sale this listing needs ${missing.join(", ")}.`);
        values = { active: true };
        break;
      }
      case "deactivate":
        values = { active: false };
        break;
      case "archive":
        // Withdrawn from sale; the row stays for its bookings, receipts and referrals.
        values = { active: false, archivedAt: current.archivedAt ?? Temporal.Now.instant() };
        break;
      case "restore":
        // Back from the archive as inactive: going on sale again is a separate, explicit step.
        values = { archivedAt: null };
        break;
    }
    const updated = await tx.orm.public.Listing.where({ id, version: change.version }).update({ ...values, version: change.version + 1 });
    if (!updated) throw conflict();
    await enqueueRagSource(tx, "listing", id);
    return { version: updated.version, status: (updated.archivedAt ? "archived" : updated.active ? "active" : "inactive") as ListingStatus };
  });
}

export async function createListing(actor: Session, input: { title: string; slug: string }) {
  requireListingAccess(actor, "admin");
  return db.transaction(async (tx) => {
    await recheck(tx, actor, "admin");
    if (await tx.orm.public.Listing.where({ slug: input.slug }).first()) {
      throw new ListingAdminError(409, "Another listing already uses this slug.");
    }
    // New listings start off sale: they cannot be activated until the minimum data is complete.
    const created = await tx.orm.public.Listing.create({ slug: input.slug, title: input.title, contentHtml: "", attributes: {}, active: false });
    await enqueueRagSource(tx, "listing", created.id);
    return { id: created.id, version: created.version };
  });
}

export async function deleteListing(actor: Session, id: number, version: number) {
  requireListingAccess(actor, "admin");
  return db.transaction(async (tx) => {
    await recheck(tx, actor, "admin");
    // FOR UPDATE conflicts with the lock a new booking takes on its listing, so the count below is final.
    await lockListing(tx, id, version);
    if (await bookingCount(tx, id) > 0) {
      throw new ListingAdminError(409, "This listing has bookings, so it cannot be deleted. Archive it instead to keep its history.");
    }
    // Associations go; the shared images themselves stay in the library.
    await enqueueRagSource(tx, "listing", id);
    await tx.orm.public.ListingMedia.where({ listingId: id }).deleteAndCount();
    await tx.orm.public.ListingTermAssignment.where({ listingId: id }).deleteAndCount();
    const deleted = await tx.orm.public.Listing.where({ id, version }).delete();
    if (!deleted) throw conflict();
    return { deleted: true };
  });
}
