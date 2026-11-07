import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import BlogAdmin from "@/modules/content/client/blog-admin";
import { db } from "@/infrastructure/prisma/db";
import { getBlogVisits } from "@/modules/analytics/server/umami";

export default async function Page() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN" && actor.role !== "EDITOR") redirect("/admin");
  const posts = await db.orm.public.BlogPost.include("publication").orderBy((post) => post.updatedAt.desc()).all();
  const articles = await Promise.all(posts.map(async ({ id, title, slug, publication }) => ({
    id, title, slug, publication: Boolean(publication), visits: await getBlogVisits(actor, slug),
  })));
  return <BlogAdmin posts={articles} />;
}
