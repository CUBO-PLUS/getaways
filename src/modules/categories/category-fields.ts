export const CATEGORY_KINDS = ["blog", "listings"] as const;
export type CategoryKind = typeof CATEGORY_KINDS[number];
export type CategorySummary = { id: number; name: string; slug: string; usageCount: number };

export function parseCategoryKind(value: string): CategoryKind | null {
  return CATEGORY_KINDS.includes(value as CategoryKind) ? value as CategoryKind : null;
}

export function parseCategoryId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export function parseCategoryInput(value: unknown): { name: string; slug: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { name, slug } = value as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "name" && key !== "slug")) return null;
  if (typeof name !== "string" || typeof slug !== "string") return null;
  const cleanName = name.trim();
  const cleanSlug = slug;
  if (cleanName.length < 1 || cleanName.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug) || cleanSlug.length > 100) return null;
  return { name: cleanName, slug: cleanSlug };
}
