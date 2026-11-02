import type { BlogDocument } from "@/modules/content/blog-schema";

export type Draft = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  document: BlogDocument;
  documentSchemaVersion: number;
  coverMediaId: number | null;
  coverAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  version: number;
  categories: { categoryId: number }[];
  publication: { publishedAt?: string } | null;
  firstPublishedAt: string | null;
  hasUnpublishedChanges: boolean;
};

export type Category = { id: number; name: string };
export type ImageAttrs = {
  mediaId: string;
  alt: string;
  decorative: boolean;
  caption: string | null;
};
export type ImageTarget = { pos: number; attrs: ImageAttrs };
export type Panel = "images" | "image" | "insert" | "link" | null;

export async function responseError(response: Response, fallback: string) {
  if (response.status === 401) return "Tu sesión terminó. Conserva tus cambios y vuelve a iniciar sesión en otra pestaña antes de reintentar.";
  if (response.status === 403) return "No tienes permiso para realizar esta acción. Tus cambios locales se conservan.";
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export const control = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd] disabled:cursor-not-allowed disabled:opacity-40";
export const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[#0277bd]";
