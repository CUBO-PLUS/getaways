import "server-only";

import { db } from "@/infrastructure/prisma/db";
import type { TermRow } from "@/data/types/taxonomies";
import { readCatalogListings as publicListings } from "@/modules/listings/server/catalog";

export async function getListingBySlug(slug: string) {
  return (await publicListings()).find((listing) => listing.slug === slug) ?? null;
}

export async function getAllListings() {
  return (await publicListings()).sort((a, b) => a.title.localeCompare(b.title));
}

export async function getListingsForArchive() {
  return (await publicListings()).sort((a, b) => b.wp_id - a.wp_id);
}

export async function getFeaturedListings(limit = 6) {
  return (await getListingsForArchive()).slice(0, limit);
}

export async function getListingCategoryWithListings(slug: string) {
  const terms = await db.orm.public.ListingTerm.where({ taxonomy: "hp_listing_category", slug }).all();
  const term = terms[0];
  if (!term) return null;
  const listings = (await publicListings()).filter((listing) => listing.categories.some((category) => category.slug === slug))
    .sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  return { term: { id: term.id, name: term.name, slug: term.slug, taxonomy: term.taxonomy, wp_id: Number(term.wpId), parent_id: null } as TermRow, listings };
}

export async function getRelatedListings(listingId: number, limit = 4) {
  const listings = await publicListings();
  const current = listings.find((listing) => listing.id === listingId);
  if (!current) return [];
  return listings.filter((listing) => listing.id !== listingId && listing.categories.some((category) => current.categories.some((own) => own.slug === category.slug)))
    .sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
}

export async function getListingCategoriesWithCounts() {
  const [terms, listings] = await Promise.all([
    db.orm.public.ListingTerm.where({ taxonomy: "hp_listing_category" }).all(),
    publicListings(),
  ]);
  const countBySlug = new Map<string, number>();
  for (const listing of listings) for (const category of listing.categories) {
    countBySlug.set(category.slug, (countBySlug.get(category.slug) ?? 0) + 1);
  }
  return terms.map((term) => ({
    id: term.id, name: term.name, slug: term.slug, taxonomy: term.taxonomy, wp_id: Number(term.wpId), parent_id: null,
    listing_count: countBySlug.get(term.slug) ?? 0,
  } as TermRow & { listing_count: number }));
}

export async function getPetsTerms() {
  return (await db.orm.public.ListingTerm.where({ taxonomy: "hp_listing_pets" }).all()).map(({ id, name, slug }) => ({ id, name, slug }));
}
