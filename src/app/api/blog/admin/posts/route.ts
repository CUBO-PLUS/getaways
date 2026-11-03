import { revalidatePath } from "next/cache";
import { db } from "@/infrastructure/prisma/db";
import { assertSameOrigin } from "@/modules/auth/server/auth";
import { requireBlogAccess, blogAccessResponse } from "@/modules/content/server/blog-auth";
import { createBlogDraft } from "@/modules/content/server/blog-operations";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return new Response(null, { status: 403 });
    await requireBlogAccess(request);
    const draft = await createBlogDraft(request);
    revalidatePath("/blog");
    return Response.json(draft, { status: 201, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    const denied = blogAccessResponse(error); if (denied) return denied; console.error("Blog draft creation failed", error); return new Response(null, { status: 503 }); }
}

export async function GET(request: Request) {
  try {
    await requireBlogAccess(request);
    const posts = await db.orm.public.BlogPost.include("publication").orderBy((post) => post.updatedAt.desc()).all();
    return Response.json(posts.map(({ id, title, slug, publication }) => ({ id, title, slug, publication: Boolean(publication) })), { headers: privateHeaders });
  } catch (error) { return blogAccessResponse(error) ?? new Response(null, { status: 503, headers: privateHeaders }); }
}
