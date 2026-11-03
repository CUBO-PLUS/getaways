import { db } from "@/infrastructure/prisma/db";
import { requireBlogAccess, blogAccessResponse } from "@/modules/content/server/blog-auth";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  try {
    await requireBlogAccess(request);
    const categories = await db.orm.public.BlogCategory.orderBy((category) => category.name.asc()).all();
    return Response.json(categories, { headers: privateHeaders });
  } catch (error) { return blogAccessResponse(error) ?? new Response(null, { status: 503, headers: privateHeaders }); }
}
