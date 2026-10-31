import { db } from "@/infrastructure/prisma/db";
import { isBlogAdmin } from "@/modules/content/server/blog-auth";
export async function GET(request: Request) {
  if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
  const categories = await db.orm.public.BlogCategory.orderBy((category) => category.name.asc()).all();
  return Response.json(categories, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
