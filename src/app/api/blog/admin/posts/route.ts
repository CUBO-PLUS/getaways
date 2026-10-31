import { revalidatePath } from "next/cache";
import { db } from "@/infrastructure/prisma/db";
import { assertSameOrigin, isBlogAdmin } from "@/modules/content/server/blog-auth";
import { createBlogDraft } from "@/modules/content/server/blog-operations";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return new Response(null, { status: 403 });
    if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
    const draft = await createBlogDraft();
    revalidatePath("/blog");
    return Response.json(draft, { status: 201, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) { console.error("Blog draft creation failed", error); return new Response(null, { status: 503 }); }
}

export async function GET(request: Request) {
  if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
  const posts = await db.orm.public.BlogPost.include("publication").orderBy((post) => post.updatedAt.desc()).all();
  return Response.json(posts, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
