import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { descriptionFromHtml } from "@/modules/content/description";
import { getPageBySlug, getPostBySlugAndDate } from "@/modules/content/server/content";
import { mediaPublicUrl } from "@/shared/media/media";
import EditorialTemplate from "@/components/templates/EditorialTemplate";
import { getEditorialData, postCoverPath } from "@/modules/content/server/editorial";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}): Promise<Metadata> {
  const { segments } = await params;

  if (segments.length === 1) {
    const page = await getPageBySlug(segments[0]);
    if (!page) return { title: "Not Found" };
    return {
      title: page.seo_title || page.title,
      description:
        page.seo_description ||
        descriptionFromHtml(page.content_html) ||
        "Oceanfront vacation rentals in El Zonte, La Libertad.",
      alternates: { canonical: `/${segments[0]}` },
    };
  }

  if (segments.length === 4) {
    const [year, month, day, slug] = segments;
    const post = await getPostBySlugAndDate(year, month, day, slug);
    if (!post) return { title: "Not Found" };
    const coverPath = "coverPath" in post ? post.coverPath : await postCoverPath(post.featured_media_id);
    const cover = coverPath ? mediaPublicUrl(coverPath) : null;
    const contentHtml = "content_html" in post ? post.content_html : "";
    return {
      title: post.seo_title || post.title || "Getaways El Salvador",
      // The excerpt is the editor's own one-line summary of the post. It was
      // being written by the admin form and read by nothing, so a summary an
      // editor took the trouble to write appeared nowhere; it is a far better
      // meta description than the generic site blurb.
      // Falls back to the post's own opening prose before the site blurb:
      // all nine posts had neither a description nor an excerpt, so all nine
      // were describing themselves identically.
      description:
        post.seo_description ||
        post.excerpt ||
        descriptionFromHtml(contentHtml) ||
        "Guides and stories from the coast of El Salvador.",
      alternates: { canonical: `/${segments.join("/")}` },
      // The post's OWN photograph. Without this every post fell back to the
      // layout's site-wide hero, so a piece about one restaurant in El Zonte
      // shared as a drone shot of the coast -- and Google Discover, which is
      // a photograph with a headline on it, had nothing specific to show.
      openGraph: {
        type: "article",
        title: post.seo_title || post.title,
        url: `/${segments.join("/")}`,
        ...(post.published_at ? { publishedTime: post.published_at } : {}),
      ...(cover ? { images: [{ url: cover, alt: ("coverAlt" in post ? post.coverAlt : null) || post.title }] } : {}),
      },
    };
  }

  return { title: "Not Found" };
}

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  const data = await getEditorialData(segments);
  if (!data) notFound();
  return <EditorialTemplate data={data} />;
}
