import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { renderBlogDocument } from "@/modules/content/blog-renderer";
import type { BlogDocument } from "@/modules/content/blog-schema";
import { blogUtcDayRange } from "@/modules/content/paths";
import { Temporal } from "temporal-polyfill/full";

const categorySummary = (categories: Array<{ category: { id: number; name: string; slug: string } | null }>) =>
  categories.flatMap(({ category }) => category ? [category] : []);

async function publicationCards(limit?: number, categorySlug?: string) {
  const query = db.orm.public.BlogPublication
    .select("postId", "title", "publishedAt", "coverMediaId", "coverAlt")
    .include("post", (post) => post.select("slug"))
    .include("coverMedia", (media) => media.select("id", "defaultAlt"))
    .include("categories", (categories) => categories
      .select("categoryId")
      .include("category", (category) => category.select("id", "name", "slug")));
  let allowedIds: number[] | undefined;
  if (categorySlug) {
    const relations = await db.orm.public.BlogPublicationCategory
      .select("publicationPostId")
      .include("category", (category) => category.select("slug"))
      .all();
    allowedIds = relations.filter((relation) => relation.category?.slug === categorySlug).map((relation) => relation.publicationPostId);
    if (allowedIds.length === 0) return [];
  }
  const filtered = allowedIds ? query.where((publication) => publication.postId.in(allowedIds!)) : query;
  const ordered = filtered.orderBy((publication) => publication.publishedAt.desc());
  return limit === undefined ? ordered.all() : ordered.limit(limit).all();
}

function toCard(row: Awaited<ReturnType<typeof publicationCards>>[number]) {
  if (!row.post) throw new Error(`Publication ${row.postId} has no post row`);
  return {
    id: row.postId,
    slug: row.post.slug,
    title: row.title,
    published_at: row.publishedAt.toString(),
    featured_media_id: row.coverMediaId,
    featured_media: row.coverMedia ? {
      storage_path: `/api/blog/media/${row.coverMedia.id}`,
      alt_text: row.coverAlt ?? row.coverMedia.defaultAlt,
    } : null,
    categories: categorySummary(row.categories),
  };
}

export async function getAllPosts() {
  return (await publicationCards()).map(toCard);
}

export async function getRecentPosts(limit = 3) {
  return (await publicationCards(limit)).map(toCard);
}

export async function getPostCategoriesWithCounts() {
  const relations = await db.orm.public.BlogPublicationCategory
    .select("publicationPostId")
    .include("category", (category) => category.select("id", "name", "slug"))
    .all();
  const categories = new Map<string, { name: string; slug: string; count: number }>();
  for (const { category } of relations) {
    if (!category) continue;
    const existing = categories.get(category.slug);
    if (existing) existing.count += 1;
    else categories.set(category.slug, { name: category.name, slug: category.slug, count: 1 });
  }
  return [...categories.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getPostsByCategory(slug: string) {
  const term = await db.orm.public.BlogCategory.where({ slug }).select("id", "name", "slug").first();
  if (!term) return null;
  return { term, posts: (await publicationCards(undefined, slug)).map(toCard) };
}

export async function getPostBySlugAndDate(year: string, month: string, day: string, slug: string) {
  const range = blogUtcDayRange(year, month, day);
  if (!range) return null;
  const start = Temporal.Instant.from(range.start);
  const endExclusive = Temporal.Instant.from(range.endExclusive);
  const post = await db.orm.public.BlogPost.where({ slug }).select("id").first();
  if (!post) return null;
  const row = await db.orm.public.BlogPublication
    .where({ postId: post.id })
    .where((publication) => publication.publishedAt.gte(start))
    .where((publication) => publication.publishedAt.lt(endExclusive))
    .select("postId", "title", "excerpt", "document", "documentSchemaVersion", "coverMediaId", "coverAlt", "seoTitle", "seoDescription", "publishedAt")
    .include("coverMedia", (media) => media.select("id", "defaultAlt"))
    .first();
  if (!row) return null;
  return {
    id: row.postId,
    slug,
    title: row.title,
    excerpt: row.excerpt,
    document: row.document as BlogDocument,
    documentSchemaVersion: row.documentSchemaVersion,
    featured_media_id: row.coverMediaId,
    coverPath: row.coverMedia ? `/api/blog/media/${row.coverMedia.id}` : null,
    coverAlt: row.coverAlt ?? row.coverMedia?.defaultAlt ?? null,
    seo_title: row.seoTitle,
    seo_description: row.seoDescription,
    published_at: row.publishedAt.toString(),
  };
}

export async function renderPublicationDocument(document: BlogDocument) {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (node.type === "image" && typeof attrs?.mediaId === "string") ids.add(attrs.mediaId);
    Object.values(node).forEach(visit);
  };
  visit(document);
  const mediaIds = [...ids];
  const media = mediaIds.length
    ? await db.orm.public.MediaAsset.select("id").where((asset) => asset.id.in(mediaIds.map(Number))).all()
    : [];
  const known = new Set(media.map((asset) => String(asset.id)));
  return renderBlogDocument(document, (mediaId) => {
    if (!known.has(mediaId)) throw new Error("Published blog document references missing media");
    return `/api/blog/media/${mediaId}`;
  });
}
