import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";

import { getPostCategoriesWithCounts, getPostsByCategory } from "@/modules/content/server/content";
import PostCard from "@/components/molecules/PostCard";
import { blogCategoryAliasTarget } from "@/modules/categories/server/category-aliases";

/*
 * Blog category archive (Task 27), the /category/<slug>/ URL WordPress gives
 * every `category` term. The real site links here from its footer "Blog"
 * widget (Getaways Guides, Uncategorized) and from each post card's category
 * label. Cards reuse /blog's components/molecules/PostCard verbatim so the two
 * archives look like the same site.
 *
 * A category with no posts is a 404, not an empty state -- the same rule
 * listing categories already follow. Five terms came over from WordPress with
 * nothing filed under them (Tips, Trends, Ideas, Uncategorized, and now
 * Getaways Guides, whose posts were sorted into real sections), and each was
 * a page with a heading and nothing else for Google to index. An unknown slug
 * 404s too (see getPostsByCategory).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const target = await blogCategoryAliasTarget(slug);
  if (target) permanentRedirect(`/category/${encodeURIComponent(target)}`);
  const result = await getPostsByCategory(slug);
  if (!result || result.posts.length === 0) return { title: "Not Found" };

  return {
    title: result.term.name,
    description: `Posts filed under ${result.term.name} in the Getaways El Salvador journal.`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function JournalCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = await blogCategoryAliasTarget(slug);
  if (target) permanentRedirect(`/category/${encodeURIComponent(target)}`);
  const [result, categories] = await Promise.all([
    getPostsByCategory(slug),
    getPostCategoriesWithCounts(),
  ]);
  if (!result || result.posts.length === 0) notFound();

  return (
    <div className="w-[min(100%_-_48px,_1100px)] mt-[clamp(30px,_4vw,_52px)] mb-[clamp(56px,_7vw,_90px)] mx-auto max-[640.001px]:w-full">
      <header className="mt-0 mb-5.5 mx-0">
        {/* The section, then the category. Landing here from a search result
            otherwise gives no clue what site you are on the journal of. */}
        <p className="mt-0 mb-2.5 text-[11px] font-extrabold tracking-[0.08em] uppercase mx-0">
          <Link className="text-muted-text no-underline [transition:color_0.15s_ease] hover:text-heading focus-visible:text-heading" href="/blog">Getaways Journal</Link>
        </p>
        <h1 className="text-[clamp(32px,_4vw,_46px)] leading-[1.12] m-0">{result.term.name}</h1>
      </header>

      {categories.length > 1 && (
        <nav className="flex flex-wrap mt-0 mb-7 mx-0 gap-2" aria-label="Journal categories">
          <Link href="/blog" className="inline-flex items-center min-h-10 bg-transparent text-body-text text-[14px] no-underline px-4 py-2 gap-1.75 rounded-full border
            border-solid border-border hover:border-[rgba(15,_23,_39,_0.45)]">
            All
          </Link>
          {categories.map((category) => {
            const active = category.slug === slug;
            return (
              <Link
                key={category.slug}
                href={`/category/${category.slug}`}
                className={`inline-flex items-center min-h-10 bg-transparent text-[14px] no-underline px-4 py-2 gap-1.75
                  rounded-full border border-solid ${active ? "text-heading font-semibold border-heading" : "text-body-text border-border hover:border-[rgba(15,_23,_39,_0.45)]"}`}
                aria-current={active ? "page" : undefined}
              >
                {category.name}
                <span className="text-[12px] text-[rgba(15,_23,_39,_0.45)] tabular-nums">{category.count}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* No empty state: an empty category never reaches this point, it 404s
          above. */}
      <div className="grid grid-cols-3 mx-0 my-6 gap-6 max-[960.001px]:grid-cols-2 max-[640.001px]:grid-cols-1">
        {result.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
