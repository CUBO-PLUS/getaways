import { describe, expect, it } from "vitest";
import { blogCategorySitemapEntries } from "@/modules/content/sitemap";

describe("blogCategorySitemapEntries", () => {
  it("includes only categories with visible published posts", () => {
    const lastModified = new Date("2026-10-31T00:00:00Z");
    expect(blogCategorySitemapEntries([
      { slug: "surf", count: 2 },
      { slug: "empty", count: 0 },
    ], "https://example.com", lastModified)).toEqual([
      {
        url: "https://example.com/category/surf",
        lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
      },
    ]);
  });
});
