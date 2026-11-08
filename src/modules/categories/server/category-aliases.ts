import "server-only";
import { db } from "@/infrastructure/prisma/db";

export async function blogCategoryAliasTarget(slug: string): Promise<string | null> {
  const alias = await db.orm.public.BlogCategorySlugAlias.where({ slug }).include("category", (category) => category.select("slug")).first();
  return alias?.category?.slug ?? null;
}

export async function listingCategoryAliasTarget(slug: string): Promise<string | null> {
  const alias = await db.orm.public.ListingCategorySlugAlias.where({ slug }).include("category", (category) => category.select("slug", "taxonomy")).first();
  return alias?.category?.taxonomy === "hp_listing_category" ? alias.category.slug : null;
}
