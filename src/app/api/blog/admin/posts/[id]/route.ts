import { db } from "@/infrastructure/prisma/db";
import { assertSameOrigin, isBlogAdmin } from "@/modules/content/server/blog-auth";
import { BlogConflict, saveBlogDraft } from "@/modules/content/server/blog-operations";
import { parseBlogId } from "@/modules/content/blog-ids";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, { params }: Context) {
  if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
  const id = parseBlogId((await params).id);
  if (!id) return new Response(null, { status: 404 });
  const post = await db.orm.public.BlogPost.where({ id }).include("categories").include("publication").first();
  if (!post) return new Response(null, { status: 404, headers: privateHeaders });
  const publication = post.publication;
  let hasUnpublishedChanges = false;
  if (publication) {
    const publishedCategories = await db.orm.public.BlogPublicationCategory.where({ publicationPostId: id }).all();
    const draftCategoryIds = post.categories.map(({ categoryId }) => categoryId).sort((a, b) => a - b);
    const publishedCategoryIds = publishedCategories.map(({ categoryId }) => categoryId).sort((a, b) => a - b);
    const fields = ["title", "excerpt", "document", "documentSchemaVersion", "coverMediaId", "coverAlt", "seoTitle", "seoDescription"] as const;
    hasUnpublishedChanges = fields.some((field) => JSON.stringify(post[field]) !== JSON.stringify(publication[field]))
      || JSON.stringify(draftCategoryIds) !== JSON.stringify(publishedCategoryIds);
  }
  return Response.json({ ...post, hasUnpublishedChanges }, { headers: privateHeaders });
}

export async function PUT(request: Request, { params }: Context) {
  try {
    if (!assertSameOrigin(request)) return new Response(null, { status: 403 });
    if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
    const id = parseBlogId((await params).id);
    if (!id) return new Response(null, { status: 404 });
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "invalid_input" }, { status: 400, headers: privateHeaders });
    const saved = await saveBlogDraft(id, input as Record<string, unknown>);
    if (!saved) return new Response(null, { status: 404, headers: privateHeaders });
    return Response.json(saved, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof BlogConflict) return Response.json({ error: "version_conflict", currentVersion: error.currentVersion }, { status: 409, headers: privateHeaders });
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof Error && error.message.startsWith("Invalid blog document:")) return Response.json({ error: "invalid_input", message: error.message }, { status: 400, headers: privateHeaders });
    console.error("Blog draft save failed", error);
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
