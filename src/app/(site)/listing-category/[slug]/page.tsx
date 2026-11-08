import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getListingCategoriesWithCounts, getListingCategoryWithListings } from "@/modules/listings/server/listings";
import { visibleListingCategories } from "@/modules/listings/categories";
import { mediaPublicUrl } from "@/shared/media/media";
import PropertyArchive from "@/components/organisms/PropertyArchive";
import type { ArchiveSearchParams } from "@/modules/listings/properties-filter";
import { listingCategoryAliasTarget } from "@/modules/categories/server/category-aliases";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const target = await listingCategoryAliasTarget(slug);
  if (target) permanentRedirect(`/listing-category/${encodeURIComponent(target)}`);
  const result = await getListingCategoryWithListings(slug);
  if (!result || result.listings.length === 0) return { title: "Not Found" };

  return {
    title: result.term.name,
    // Names the towns and the count. "in El Salvador" competed with every
    // rental site in the country and told a searcher nothing.
    description: `${result.listings.length} ${result.term.name.toLowerCase()} to rent in El Zonte, La Libertad. Book direct with no booking fees.`,
    alternates: { canonical: `/listing-category/${slug}` },
  };
}

export default async function ListingCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ArchiveSearchParams>;
}) {
  const { slug } = await params;
  const target = await listingCategoryAliasTarget(slug);
  if (target) permanentRedirect(`/listing-category/${encodeURIComponent(target)}`);
  const [result, sp, allCategories] = await Promise.all([
    getListingCategoryWithListings(slug),
    searchParams,
    getListingCategoriesWithCounts(),
  ]);
  // A category with no live property is a thin page: an empty grid under a
  // hero, which Google indexes and a guest bounces from. Deactivating the last
  // property in a category takes the category page down with it, and
  // reactivating one brings it back.
  if (!result || result.listings.length === 0) notFound();

  const { term } = result;
  const heroListing = result.listings.find((listing) => listing.featured_media);
  const heroUrl = heroListing?.featured_media ? mediaPublicUrl(heroListing.featured_media.storage_path) : null;
  const lead = `${term.name} in Surf City, close to the waves, restaurants and slow mornings by the coast.`;

  return (
    <div className="flex flex-col gap-12">
      <section
        className={`relative grid grid-cols-[minmax(0,_1fr)_minmax(260px,_340px)] items-end min-h-130 overflow-hidden bg-button-bg p-12
          gap-8 rounded-[8px] before:absolute before:inset-0
          before:[background:linear-gradient(90deg,_rgba(15,_23,_39,_0.72),_rgba(15,_23,_39,_0.26)_62%,_rgba(15,_23,_39,_0.54)),_linear-gradient(0deg,_rgba(15,_23,_39,_0.58),_rgba(15,_23,_39,_0.02)_52%)]
          max-[820.001px]:grid-cols-1 max-[820.001px]:min-h-140 max-[820.001px]:px-6 max-[820.001px]:py-8
          ${heroUrl ? "bg-center bg-cover bg-no-repeat" : ""}`}
        style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
      >
        <div className="relative z-1 max-w-175">
          <p className="mt-0 mb-3 mx-0">
            <span className="inline-block bg-[rgba(255,_255,_255,_0.35)] text-white text-[11px] font-normal leading-[16.5px] tracking-[1px] uppercase px-3
              py-1.5 rounded-full">
              {result.listings.length} {result.listings.length === 1 ? "Listing" : "Listings"}
            </span>
          </p>
          <h1 className="text-[rgb(250,_251,_249)] mt-0 mb-4 mx-0 max-[560.001px]:text-[40px] max-[560.001px]:leading-[50px]">{term.name}</h1>
          <p className="max-w-155 text-[rgba(250,_251,_249,_0.84)] text-[20px] leading-[32px] mt-0 mb-6 mx-0 max-[560.001px]:text-[17px] max-[560.001px]:leading-[28px]">{lead}</p>
        </div>
      </section>

      <div className="w-[min(100%_-_48px,_1240px)] mt-0 mb-20 mx-auto
        max-[860.001px]:w-[min(100%_-_32px,_720px)] max-[640.001px]:w-full">
        <PropertyArchive
          listings={result.listings}
          categories={visibleListingCategories(allCategories)}
          searchParams={sp}
          basePath={`/listing-category/${slug}`}
          categoryLinks
          activeCategorySlug={slug}
        />
      </div>
    </div>
  );
}
