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
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
      <Link href="/admin/listings" className="inline-flex min-h-10 items-center font-body text-[14px] font-medium text-[#394342] hover:underline focus-visible:outline-2 focus-visible:outline-[#0277bd]">← Volver a hospedajes</Link>
      <header className="mb-7 mt-5"><p className="mb-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#687371]">Administración · Catálogo</p><h1 className="m-0 font-heading text-[32px] font-medium leading-tight text-[#394342] sm:text-[36px]">Nuevo hospedaje</h1><p className="mb-0 mt-2 max-w-xl text-[14px] leading-6 text-[#596260]">Crea la ficha y completa sus datos antes de ponerla a la venta.</p></header>
      <ListingCreateForm />
    </main>
  );
}
