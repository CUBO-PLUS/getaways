import "server-only";

import type { ReactNode } from "react";
import { getPageBySlug, getPostBySlugAndDate } from "@/modules/content/server/content";
import { sanitizeContentHtml } from "@/shared/security/server/sanitize-html";
import { articleSchema } from "@/shared/seo/structured-data";

export async function getEditorialData(segments: string[]) {
  if (segments.length === 1) {
    const page = await getPageBySlug(segments[0]);
    if (!page) return null;
    return {
      kind: "page" as const,
      title: page.title,
      path: `/${page.slug}`,
      isContact: page.slug === "contact-us",
      html: sanitizeContentHtml(page.content_html),
      article: null,
    };
  }
  if (segments.length === 4) {
    const [year, month, day, slug] = segments;
    const post = await getPostBySlugAndDate(year, month, day, slug);
    if (!post) return null;
    const path = `/${segments.join("/")}`;
    const coverPath = post.coverPath;
    const body: ReactNode = await (await import("@/modules/content/server/content-postgres")).renderPublicationDocument(post.document);
    return {
      kind: "post" as const,
      title: post.title,
      path,
      isContact: false,
      html: null,
      body,
      article: articleSchema({
        title: post.title,
        slug: post.slug,
        path,
        published_at: post.published_at ?? null,
        description: post.seo_description || post.excerpt || "",
        imagePath: coverPath,
      }),
    };
  }
  return null;
}

export type EditorialData = NonNullable<Awaited<ReturnType<typeof getEditorialData>>>;
