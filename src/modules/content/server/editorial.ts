import "server-only";

import type { ReactNode } from "react";
import { descriptionFromHtml } from "@/modules/content/description";
import { getMediaByIds } from "@/shared/media/server/media";
import { getPageBySlug, getPostBySlugAndDate } from "@/modules/content/server/content";
import { sanitizeContentHtml } from "@/shared/security/server/sanitize-html";
import { articleSchema } from "@/shared/seo/structured-data";

/** The featured image's storage path, or null when the post has none. */
export async function postCoverPath(featuredMediaId: number | null): Promise<string | null> {
  if (featuredMediaId == null) return null;
  const [media] = await getMediaByIds([featuredMediaId]);
  return media?.storage_path ?? null;
}

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
    const isPublication = "document" in post;
    const coverPath = isPublication ? post.coverPath : await postCoverPath(post.featured_media_id);
    const body: ReactNode = isPublication
      ? await (await import("@/modules/content/server/content-postgres")).renderPublicationDocument(post.document)
      : null;
    const contentHtml = "content_html" in post ? post.content_html : "";
    return {
      kind: "post" as const,
      title: post.title,
      path,
      isContact: false,
      html: isPublication ? null : sanitizeContentHtml(contentHtml),
      body,
      article: articleSchema({
        title: post.title,
        slug: post.slug,
        path,
        published_at: post.published_at ?? null,
        description: post.seo_description || post.excerpt || (contentHtml ? descriptionFromHtml(contentHtml) : ""),
        imagePath: coverPath,
      }),
    };
  }
  return null;
}

export type EditorialData = NonNullable<Awaited<ReturnType<typeof getEditorialData>>>;
