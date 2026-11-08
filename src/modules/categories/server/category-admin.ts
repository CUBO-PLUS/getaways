import "server-only";
import { db } from "@/infrastructure/prisma/db";
import { enqueueRagSource } from "@/infrastructure/prisma/rag-source-queue";
import type { Session } from "@/modules/auth/server/auth";
import type { CategoryKind, CategorySummary } from "@/modules/categories/category-fields";
import { parseCategoryInput } from "@/modules/categories/category-fields";
import { ListingAdminError } from "@/modules/listings/server/listing-admin";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const taxonomy = "hp_listing_category";

function conflictError() { return new ListingAdminError(409, "That slug is already in use or reserved."); }

async function lockSlugs(tx: Tx, kind: CategoryKind) {
  // Serializes both taxonomy tables and alias tables for this slug namespace.
  const lockId = kind === "blog" ? 91402731 : 91402732;
  await tx.query(db.raw.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(726104813, ${lockId})`.returnsRow({ locked: "pg/int4@1" }).build());
}

async function ensureAccess(tx: Tx, actor: Session) {
  const user = await tx.orm.public.AdminUser.where({ id: actor.id }).forUpdate().first();
  if (!user || !user.active || user.authVersion !== actor.authVersion) throw new ListingAdminError(401, "Your session has ended. Sign in again.");
  if (user.role !== "ADMIN" && user.role !== "EDITOR") throw new ListingAdminError(403, "Access denied");
}

async function usage(kind: CategoryKind, id: number, runner: { query: Tx["query"] } = db.runtime()) {
  const [row] = kind === "blog"
    ? await runner.query(db.raw.sql`SELECT count(DISTINCT post_id)::int AS total FROM (
        SELECT "postId" AS post_id FROM "BlogPostCategory" WHERE "categoryId" = ${id}
        UNION SELECT "publicationPostId" FROM "BlogPublicationCategory" WHERE "categoryId" = ${id}
      ) associations`.returnsRow({ total: "pg/int4@1" }).build())
    : await runner.query(db.raw.sql`SELECT count(DISTINCT "listingId")::int AS total FROM "ListingTermAssignment" a JOIN "ListingTerm" t ON t.id = a."termId" WHERE a."termId" = ${id} AND t.taxonomy = ${taxonomy}`.returnsRow({ total: "pg/int4@1" }).build());
  return row?.total ?? 0;
}

export async function listCategories(actor: Session, kind: CategoryKind): Promise<CategorySummary[]> {
  if (actor.role !== "ADMIN" && actor.role !== "EDITOR") throw new ListingAdminError(403, "Access denied");
  const rows = kind === "blog"
    ? await db.orm.public.BlogCategory.orderBy((row) => row.name.asc()).all()
    : await db.orm.public.ListingTerm.where({ taxonomy }).all();
  return Promise.all(rows.map(async (row) => ({ id: row.id, name: row.name, slug: row.slug, usageCount: await usage(kind, row.id) })));
}

export async function createCategory(actor: Session, kind: CategoryKind, input: unknown) {
  const values = parseCategoryInput(input);
  if (!values) throw new ListingAdminError(400, "Provide a name (1–80 characters) and a valid lowercase slug.");
  return db.transaction(async (tx) => {
    await ensureAccess(tx, actor);
    await lockSlugs(tx, kind);
    const currentSlug = kind === "blog" ? await tx.orm.public.BlogCategory.where({ slug: values.slug }).first() : await tx.orm.public.ListingTerm.where({ taxonomy, slug: values.slug }).first();
    const reservedSlug = kind === "blog" ? await tx.orm.public.BlogCategorySlugAlias.where({ slug: values.slug }).first() : await tx.orm.public.ListingCategorySlugAlias.where({ slug: values.slug }).first();
    if (currentSlug || reservedSlug) throw conflictError();
    return kind === "blog"
      ? tx.orm.public.BlogCategory.create(values)
      : tx.orm.public.ListingTerm.create({ ...values, taxonomy });
  });
}

export async function updateCategory(actor: Session, kind: CategoryKind, id: number, input: unknown) {
  const values = parseCategoryInput(input);
  if (!values) throw new ListingAdminError(400, "Provide a name (1–80 characters) and a valid lowercase slug.");
  return db.transaction(async (tx) => {
    await ensureAccess(tx, actor);
    await lockSlugs(tx, kind);
    const current = kind === "blog"
      ? await tx.orm.public.BlogCategory.where({ id }).forUpdate().first()
      : await tx.orm.public.ListingTerm.where({ id, taxonomy }).forUpdate().first();
    if (!current) throw new ListingAdminError(404, "Category not found");
    const affectedSources = kind === "blog"
      ? values.name !== current.name
        ? await tx.query(db.raw.sql`SELECT post_id AS id FROM (
            SELECT "postId" AS post_id FROM "BlogPostCategory" WHERE "categoryId" = ${id}
            UNION SELECT "publicationPostId" FROM "BlogPublicationCategory" WHERE "categoryId" = ${id}
          ) associations`.returnsRow({ id: "pg/int4@1" }).build())
        : []
      : await tx.query(db.raw.sql`SELECT DISTINCT "listingId" AS id FROM "ListingTermAssignment" WHERE "termId" = ${id}`
          .returnsRow({ id: "pg/int4@1" }).build());
    if (values.slug !== current.slug) {
      const currentSlug = kind === "blog" ? await tx.orm.public.BlogCategory.where({ slug: values.slug }).first() : await tx.orm.public.ListingTerm.where({ taxonomy, slug: values.slug }).first();
      const reservedSlug = kind === "blog" ? await tx.orm.public.BlogCategorySlugAlias.where({ slug: values.slug }).first() : await tx.orm.public.ListingCategorySlugAlias.where({ slug: values.slug }).first();
      if ((currentSlug && currentSlug.id !== id) || (reservedSlug && reservedSlug.categoryId !== id)) throw conflictError();
      // Reclaiming this category's own historical URL replaces that alias with
      // the slug being retired below, atomically avoiding a self-redirect.
      if (reservedSlug) {
        if (kind === "blog") await tx.orm.public.BlogCategorySlugAlias.where({ slug: values.slug }).delete();
        else await tx.orm.public.ListingCategorySlugAlias.where({ slug: values.slug }).delete();
      }
      if (kind === "blog") await tx.orm.public.BlogCategorySlugAlias.create({ slug: current.slug, categoryId: id });
      else await tx.orm.public.ListingCategorySlugAlias.create({ slug: current.slug, categoryId: id });
    }
    const updated = kind === "blog"
      ? tx.orm.public.BlogCategory.where({ id }).update(values)
      : tx.orm.public.ListingTerm.where({ id, taxonomy }).update(values);
    const result = await updated;
    for (const source of affectedSources) await enqueueRagSource(tx, kind === "blog" ? "blog" : "listing", source.id);
    return result;
  });
}

export async function deleteCategory(actor: Session, kind: CategoryKind, id: number) {
  return db.transaction(async (tx) => {
    await ensureAccess(tx, actor);
    await lockSlugs(tx, kind);
    const current = kind === "blog"
      ? await tx.orm.public.BlogCategory.where({ id }).forUpdate().first()
      : await tx.orm.public.ListingTerm.where({ id, taxonomy }).forUpdate().first();
    if (!current) throw new ListingAdminError(404, "Category not found");
    if (await usage(kind, id, tx) > 0) throw new ListingAdminError(409, "Categories in use cannot be deleted.");
    if (kind === "blog") return tx.orm.public.BlogCategory.where({ id }).delete();
    return tx.orm.public.ListingTerm.where({ id, taxonomy }).delete();
  });
}

export function categoryFailure(error: unknown) {
  if (error && typeof error === "object" && "sqlState" in error) {
    const sqlState = (error as { sqlState?: unknown }).sqlState;
    if (sqlState === "23505") return new ListingAdminError(409, "That slug is already in use or reserved.");
    if (sqlState === "23503") return new ListingAdminError(409, "Categories in use cannot be deleted.");
  }
  return error;
}
