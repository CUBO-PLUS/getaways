export function blogCategorySitemapEntries(
  categories: Array<{ slug: string; count: number }>,
  base: string,
  lastModified: Date,
) {
  return categories
    .filter((category) => category.count > 0)
    .map((category) => ({
      url: `${base}/category/${category.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
}
