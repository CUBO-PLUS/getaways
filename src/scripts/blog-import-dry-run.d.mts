import type { SourceData } from "./blog-import-source.mts";

export function analyzeBlogSources(root?: string, sourceData?: SourceData): {
  schemaVersion: number;
  mode: "read-only-dry-run";
  sourceCounts: { publishedPosts: number; categories: number; relationsForPosts: number };
  articles: Array<{
    id: number;
    wpId: number;
    title: string;
    slug: string;
    publishedAt: string;
    publishedAtUtc: string | null;
    url: string | null;
    categories: Array<{ id: number; wpId: number; name: string; slug: string }>;
    cover: { localId: number; wpId: number; storagePath: string; fileExists: boolean } | null;
    images: Array<{ src: string; wpId: number | null; mediaLocalId: number | null; storagePath: string | null; alt: string | null; status: "resolved" | "missing" }>;
    blocks: Array<{ name: string; count: number; reviewRequired: boolean }>;
    blockAttributes: Array<{ name: string; attributes: Record<string, unknown> }>;
    captions: string[];
    htmlAttributes: Array<{ tag: string; attributes: Array<{ name: string; value: string }> }>;
  }>;
  mediaFiles: Array<{ localId: number; wpId: number; storagePath: string; fileExists: boolean }>;
  summary: { blockers: number; warnings: number; missingMediaFiles: number; unresolvedImages: number };
  blockers: Array<Record<string, unknown>>;
  warnings: Array<Record<string, unknown>>;
};
