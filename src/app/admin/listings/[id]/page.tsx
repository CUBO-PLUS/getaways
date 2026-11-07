import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { listingAccessAllowed, staffListingDetail, staffMediaLibrary } from "@/modules/listings/server/listing-admin";
import ListingEditor from "@/modules/listings/client/listing-editor";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ListingPage({ params }: PageProps<"/admin/listings/[id]">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (!listingAccessAllowed(actor.role, "editorial")) notFound();
  const rawId = (await params).id;
  if (!/^[1-9]\d*$/.test(rawId) || Number(rawId) > 2_147_483_647) notFound();
  const [listing, library] = await Promise.all([staffListingDetail(actor, Number(rawId)), staffMediaLibrary(actor)]);
  if (!listing) notFound();

  return (
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
      <Link href="/admin/listings" className="inline-flex min-h-10 items-center font-body text-[14px] font-medium text-[#394342] hover:underline focus-visible:outline-2 focus-visible:outline-[#0277bd]">← Volver a hospedajes</Link>
      {/* Keyed by version: a reload after a conflict starts from the saved state, never a stale draft. */}
      <ListingEditor key={listing.version} listing={listing} library={library} admin={actor.role === "ADMIN"} />
    </main>
  );
}
