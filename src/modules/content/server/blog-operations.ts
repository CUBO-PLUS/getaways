import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { BLOG_DOCUMENT_SCHEMA_VERSION, type BlogDocument, validateBlogDocument } from "@/modules/content/blog-schema";
import { BLOG_ID_MAX } from "@/modules/content/blog-ids";
import { validatePublishableBlogPost } from "@/modules/content/blog-publication-validation";
import { publicationInstant } from "@/modules/content/publication-instant.mjs";
import { requireBlogAccess, recheckBlogAccess } from "./blog-auth";

export class BlogConflict extends Error {
  constructor(readonly currentVersion: number | null) { super("Blog draft version conflict"); }
}

export function validSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 180;
}

export async function validateMedia(id: string): Promise<boolean> {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > BLOG_ID_MAX) return false;
  return Boolean(await db.orm.public.MediaAsset.first({ id: Number(id) }));
}

export async function createBlogDraft(request?: Request) {
  const actor = await requireBlogAccess(request);
  const empty: BlogDocument = { type: "doc", content: [{ type: "paragraph" }] };
  const slug = `borrador-${crypto.randomUUID()}`;
  return db.transaction(async (tx) => {
    await recheckBlogAccess(tx, actor);
    const post = await tx.orm.public.BlogPost.create({ slug, title: "", excerpt: "", document: empty, documentSchemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION });
    return { id: post.id, slug: post.slug, version: post.version };
  });
}

export async function saveBlogDraft(id: number, input: Record<string, unknown>, request?: Request) {
  const actor = await requireBlogAccess(request);
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError("invalid post id");
  const version = input.version;
  if (!Number.isSafeInteger(version) || Number(version) < 1) throw new TypeError("version must be a positive integer");
  if (typeof input.title !== "string" || input.title.length > 300 || typeof input.excerpt !== "string" || input.excerpt.length > 1000 || !validSlug(input.slug)) throw new TypeError("invalid editorial fields");
  if (input.coverMediaId !== null && (!Number.isSafeInteger(input.coverMediaId) || Number(input.coverMediaId) < 1 || Number(input.coverMediaId) > BLOG_ID_MAX)) throw new TypeError("invalid cover media");
  if (input.coverAlt !== null && typeof input.coverAlt !== "string") throw new TypeError("invalid cover alt");
  for (const field of ["seoTitle", "seoDescription"]) if (input[field] !== null && typeof input[field] !== "string") throw new TypeError(`invalid ${field}`);
  if (!Array.isArray(input.categoryIds) || input.categoryIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1 || Number(id) > BLOG_ID_MAX)) throw new TypeError("invalid categories");
  const categoryIds = [...new Set(input.categoryIds as number[])];
  return db.transaction(async (tx) => {
    await recheckBlogAccess(tx, actor);
    const post = await tx.orm.public.BlogPost.where({ id }).forUpdate().first();
    if (!post) return null;
    if (post.version !== version) throw new BlogConflict(post.version);
    const hasMedia = async (mediaId: string) => {
      if (!/^[1-9]\d*$/.test(mediaId) || Number(mediaId) > BLOG_ID_MAX) return false;
      return Boolean(await tx.orm.public.MediaAsset.where({ id: Number(mediaId) }).forKeyShare().first());
    };
    if (input.coverMediaId !== null && !(await hasMedia(String(input.coverMediaId)))) throw new TypeError("invalid cover media");
    const categories = await tx.orm.public.BlogCategory.all();
    if (categoryIds.some((categoryId) => !categories.some((category) => category.id === categoryId))) throw new TypeError("unknown category");
    const document = await validateBlogDocument(input.document, { schemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION, hasMedia });
    if (post.firstPublishedAt && post.slug !== input.slug) throw new TypeError("slug is immutable after first publication");
  if (post.slug !== input.slug) {
      const slug = input.slug as string;
      const duplicate = await tx.orm.public.BlogPost.where({ slug }).first();
      if (duplicate && duplicate.id !== id) throw new TypeError("slug already exists");
    }
    const updated = await tx.orm.public.BlogPost.where({ id }).update({ slug: input.slug as string, title: input.title as string, excerpt: input.excerpt as string, document, documentSchemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION, coverMediaId: input.coverMediaId as number | null, coverAlt: input.coverAlt as string | null, seoTitle: input.seoTitle as string | null, seoDescription: input.seoDescription as string | null, version: Number(version) + 1 });
    if (!updated) throw new Error("Blog draft disappeared during update");
    await tx.orm.public.BlogPostCategory.where({ postId: id }).deleteAll();
    for (const categoryId of categoryIds) await tx.orm.public.BlogPostCategory.create({ postId: id, categoryId });
    return { id: updated.id, slug: updated.slug, version: updated.version };
  });
}

export async function publishBlogDraft(id: number, expectedVersion: number, request?: Request) {
  const actor = await requireBlogAccess(request, true);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("invalid post id or version");
  return db.transaction(async (tx) => {
    await recheckBlogAccess(tx, actor, true);
    const post = await tx.orm.public.BlogPost.where({ id }).forUpdate().first();
    if (!post) return null;
    if (post.version !== expectedVersion) throw new BlogConflict(post.version);
    const hasMedia = async (mediaId: string) => {
      if (!/^[1-9]\d*$/.test(mediaId) || Number(mediaId) > BLOG_ID_MAX) return false;
      return Boolean(await tx.orm.public.MediaAsset.where({ id: Number(mediaId) }).forKeyShare().first());
    };
    if (post.coverMediaId !== null && !(await hasMedia(String(post.coverMediaId)))) throw new TypeError("invalid cover media");
    const document = await validateBlogDocument(post.document, { schemaVersion: post.documentSchemaVersion, hasMedia });
    const publicationError = validatePublishableBlogPost({ title: post.title, document, coverMediaId: post.coverMediaId, coverAlt: post.coverAlt });
    if (publicationError) throw new TypeError(publicationError);
    const categories = await tx.orm.public.BlogPostCategory.where({ postId: id }).all();
    const now = publicationInstant();
    const publishedAt = post.firstPublishedAt ?? now;
    await tx.orm.public.BlogPublication.where({ postId: id }).deleteAll();
    const publication = await tx.orm.public.BlogPublication.create({ postId: id, title: post.title, excerpt: post.excerpt, document: post.document, documentSchemaVersion: post.documentSchemaVersion, coverMediaId: post.coverMediaId, coverAlt: post.coverAlt, seoTitle: post.seoTitle, seoDescription: post.seoDescription, publishedAt });
    for (const category of categories) await tx.orm.public.BlogPublicationCategory.create({ publicationPostId: id, categoryId: category.categoryId });
    if (!post.firstPublishedAt) await tx.orm.public.BlogPost.where({ id }).update({ firstPublishedAt: now });
    return { id, slug: post.slug, publishedAt: publication.publishedAt, firstPublishedAt: publishedAt, publication, hasUnpublishedChanges: false };
  });
}

export async function unpublishBlogDraft(id: number, expectedVersion: number, request?: Request) {
  const actor = await requireBlogAccess(request, true);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("invalid post id or version");
  return db.transaction(async (tx) => {
    await recheckBlogAccess(tx, actor, true);
    const post = await tx.orm.public.BlogPost.where({ id }).forUpdate().first();
    if (!post) return null;
    if (post.version !== expectedVersion) throw new BlogConflict(post.version);
    const publication = await tx.orm.public.BlogPublication.where({ postId: id }).first();
    await tx.orm.public.BlogPublication.where({ postId: id }).deleteAll();
    return { id, slug: post.slug, version: post.version, publishedAt: publication?.publishedAt ?? null, firstPublishedAt: post.firstPublishedAt, publication: null, hasUnpublishedChanges: false };
  });
}
