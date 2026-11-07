import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import ListingCreateForm from "@/modules/listings/client/listing-create-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function NewListingPage() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();

  return (
    <main lang="es" className="mx-auto max-w-2xl px-6 py-10 text-[#394342]">
      <Link href="/admin/listings">← Hospedajes</Link>
      <h1 className="mt-5 text-3xl">Nuevo hospedaje</h1>
      <ListingCreateForm />
    </main>
  );
}
