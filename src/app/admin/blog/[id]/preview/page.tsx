import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/infrastructure/prisma/db";
import { parseBlogId } from "@/modules/content/blog-ids";
import { renderBlogDocument } from "@/modules/content/blog-renderer";
import { validateBlogDocument } from "@/modules/content/blog-schema";
import { isBlogAdmin } from "@/modules/content/server/blog-auth";
import { validateMedia } from "@/modules/content/server/blog-operations";

export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const cookie = (await cookies()).toString();
  if (!(await isBlogAdmin(new Request("http://localhost", { headers: { cookie } })))) redirect("/admin/blog/login");

  const id = parseBlogId((await params).id);
  if (id === null) notFound();
  const post = await db.orm.public.BlogPost.where({ id }).first();
  if (!post) notFound();
  const document = await validateBlogDocument(post.document, {
    schemaVersion: post.documentSchemaVersion,
    hasMedia: validateMedia,
  });

  return <main className="mx-auto max-w-3xl bg-white px-6 py-12 md:px-12">
    <p className="text-xs uppercase tracking-[.2em] text-[#6c776c]">Vista previa · Blog</p>
    <h1 className="mt-4">{post.title || "Sin título"}</h1>
    {post.excerpt && <p>{post.excerpt}</p>}
    <article className="mt-10">{renderBlogDocument(document, (mediaId) => `/api/blog/media/${mediaId}`)}</article>
  </main>;
}
