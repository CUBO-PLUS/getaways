import "server-only";

import { hasPublicSupabaseConfig, publicSupabaseClient } from "@/infrastructure/data/local-client";
import { parseSiteContent, SITE_CONTENT_SLUG, type SiteContent } from "@/modules/content/site-content";
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

async function postgresContent() {
  // A DB read below must happen per request, not during prerender/build.
  await connection();
  return import("@/modules/content/server/content-postgres");
}

export async function getPostBySlugAndDate(year: string, month: string, day: string, slug: string) {
  return (await postgresContent()).getPostBySlugAndDate(year, month, day, slug);
}

export async function getPostCategoriesWithCounts() {
  return (await postgresContent()).getPostCategoriesWithCounts();
}

export async function getAllPosts() {
  return (await postgresContent()).getAllPosts();
}

// An existing category with no posts is an empty archive, not a missing route.
export async function getPostsByCategory(slug: string) {
  return (await postgresContent()).getPostsByCategory(slug);
}

export async function getRecentPosts(limit = 3) {
  return (await postgresContent()).getRecentPosts(limit);
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
