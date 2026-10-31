import "server-only";

import type { TermSummary } from "@/data/types/taxonomies";
import { hasPublicSupabaseConfig, publicSupabaseClient } from "@/infrastructure/data/local-client";
import { getMediaByIds } from "@/shared/media/server/media";
import { blogUtcDayRange } from "@/modules/content/paths";
import { parseSiteContent, SITE_CONTENT_SLUG, type SiteContent } from "@/modules/content/site-content";
import { resolveBlogContentSource } from "@/modules/content/blog-source";
import { connection } from "next/server";

// Draft/private pages must not be served at public permalinks.
export async function getPageBySlug(slug: string) {
  if (!hasPublicSupabaseConfig()) return null;
  const supabase = publicSupabaseClient();
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "publish")
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch page "${slug}": ${error.message}`, { cause: error });
  }
  return data;
}

const PUBLISHED = "published";

/** Static remains the default until the reviewed import and deployment cutover. */
export function blogContentSource(): "static" | "postgres" {
  return resolveBlogContentSource(process.env.BLOG_CONTENT_SOURCE);
}

async function postgresContent() {
  // A DB read below must happen per request, not during prerender/build.
  await connection();
  return import("@/modules/content/server/content-postgres");
}

export async function getPostBySlugAndDate(year: string, month: string, day: string, slug: string) {
  if (blogContentSource() === "postgres") return (await postgresContent()).getPostBySlugAndDate(year, month, day, slug);
  if (!hasPublicSupabaseConfig()) return null;
  const range = blogUtcDayRange(year, month, day);
  if (!range) return null;
  const supabase = publicSupabaseClient();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("status", PUBLISHED)
    .eq("slug", slug)
    .gte("published_at", range.start)
    .lt("published_at", range.endExclusive)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch post "${slug}": ${error.message}`, { cause: error });
  }
  return data;
}

// Post cards share the same media/category join. Tags must not occupy category badges.
async function attachPostCardData<T extends { id: number; featured_media_id: number | null }>(posts: T[]) {
  if (posts.length === 0) return [];
  const supabase = publicSupabaseClient();
  const { data: relations, error: relationsError } = await supabase
    .from("post_terms")
    .select("post_id, term_id")
    .in(
      "post_id",
      posts.map((p) => p.id)
    );
  if (relationsError) {
    throw new Error(`Failed to fetch post categories: ${relationsError.message}`, { cause: relationsError });
  }
  const termIds = [...new Set((relations ?? []).map((r) => r.term_id))];
  let categoryTermsById = new Map<number, TermSummary>();
  if (termIds.length > 0) {
    const { data: terms, error: termsError } = await supabase
      .from("terms")
      .select("id, name, slug")
      .eq("taxonomy", "category")
      .in("id", termIds);
    if (termsError) {
      throw new Error(`Failed to fetch post category terms: ${termsError.message}`, { cause: termsError });
    }
    categoryTermsById = new Map((terms ?? []).map((t) => [t.id, t]));
  }
  const categoriesByPostId = new Map<number, TermSummary[]>();
  for (const { post_id, term_id } of relations ?? []) {
    const term = categoryTermsById.get(term_id);
    if (!term) continue;
    const existing = categoriesByPostId.get(post_id);
    if (existing) existing.push(term);
    else categoriesByPostId.set(post_id, [term]);
  }
  const media = await getMediaByIds(posts.map((p) => p.featured_media_id).filter((id): id is number => id != null));
  const mediaById = new Map(media.map((m) => [m.id, m]));
  return posts.map((p) => ({
    ...p,
    featured_media: p.featured_media_id != null ? (mediaById.get(p.featured_media_id) ?? null) : null,
    categories: categoriesByPostId.get(p.id) ?? [],
  }));
}

// Count only published posts and order by count, then name.
export async function getPostCategoriesWithCounts() {
  if (blogContentSource() === "postgres") return (await postgresContent()).getPostCategoriesWithCounts();
  const posts = await getAllPosts();
  const byslug = new Map<string, { name: string; slug: string; count: number }>();
  for (const post of posts) {
    for (const category of post.categories ?? []) {
      const existing = byslug.get(category.slug);
      if (existing) existing.count += 1;
      else byslug.set(category.slug, { name: category.name, slug: category.slug, count: 1 });
    }
  }
  return [...byslug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getAllPosts() {
  if (blogContentSource() === "postgres") return (await postgresContent()).getAllPosts();
  if (!hasPublicSupabaseConfig()) return [];
  const supabase = publicSupabaseClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, slug, title, published_at, featured_media_id")
    .eq("status", PUBLISHED)
    .order("published_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to fetch all posts: ${error.message}`, { cause: error });
  }
  return attachPostCardData(data ?? []);
}

// An existing category with no posts is an empty archive, not a missing route.
export async function getPostsByCategory(slug: string) {
  if (blogContentSource() === "postgres") return (await postgresContent()).getPostsByCategory(slug);
  if (!hasPublicSupabaseConfig()) return null;
  const supabase = publicSupabaseClient();
  const { data: term, error: termError } = await supabase
    .from("terms")
    .select("id, name, slug")
    .eq("taxonomy", "category")
    .eq("slug", slug)
    .single();
  if (termError) {
    if (termError.code === "PGRST116") return null;
    throw new Error(`Failed to fetch category "${slug}": ${termError.message}`, { cause: termError });
  }
  const { data: relations, error: relationsError } = await supabase
    .from("post_terms")
    .select("post_id")
    .eq("term_id", term.id);
  if (relationsError) {
    throw new Error(`Failed to fetch category relations for "${slug}": ${relationsError.message}`, {
      cause: relationsError,
    });
  }
  const postIds = (relations ?? []).map((r) => r.post_id);
  if (postIds.length === 0) return { term, posts: [] };
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, slug, title, published_at, featured_media_id")
    .eq("status", PUBLISHED)
    .in("id", postIds)
    .order("published_at", { ascending: false });
  if (postsError) {
    throw new Error(`Failed to fetch posts for category "${slug}": ${postsError.message}`, {
      cause: postsError,
    });
  }
  return { term, posts: await attachPostCardData(posts ?? []) };
}

export async function getRecentPosts(limit = 3) {
  if (blogContentSource() === "postgres") return (await postgresContent()).getRecentPosts(limit);
  if (!hasPublicSupabaseConfig()) return [];
  const supabase = publicSupabaseClient();
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, slug, title, published_at, featured_media_id")
    .eq("status", PUBLISHED)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (postsError) {
    throw new Error(`Failed to fetch recent posts: ${postsError.message}`, { cause: postsError });
  }
  return attachPostCardData(posts ?? []);
}

// Site copy deliberately reads the draft settings row; public page lookup still rejects it.
// Failed reads fall back to shipped defaults rather than failing the whole homepage.
export async function getSiteContent(): Promise<SiteContent> {
  if (!hasPublicSupabaseConfig()) return {};
  const supabase = publicSupabaseClient();
  const { data, error } = await supabase
    .from("pages")
    .select("content_html")
    .eq("slug", SITE_CONTENT_SLUG)
    .maybeSingle();
  if (error || !data) return {};
  return parseSiteContent(data.content_html);
}
