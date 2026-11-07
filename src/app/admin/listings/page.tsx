import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { listingAccessAllowed, parseListingListFilters, staffListingList, type ListingStatus } from "@/modules/listings/server/listing-admin";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const STATUS_LABELS: Record<ListingStatus, string> = { active: "A la venta", inactive: "Inactivo", archived: "Archivado" };

export default async function ListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  // BOOKING_MANAGER gets only the operational summary inside the bookings panel.
  if (!listingAccessAllowed(actor.role, "editorial")) notFound();
  const filters = parseListingListFilters(await searchParams);
  if (!filters) redirect("/admin/listings");
  const listings = await staffListingList(actor, filters);
  const admin = actor.role === "ADMIN";

  return (
    <main lang="es" className="mx-auto max-w-5xl px-6 py-10 text-[#394342]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl">Hospedajes</h1>
        {admin && <Link href="/admin/listings/new" className="border px-4 py-2">Nuevo hospedaje</Link>}
      </div>
      {!admin && <p className="mt-2 text-sm">Puedes editar descripción, imágenes y datos descriptivos. Precios, capacidad y estado los gestiona un administrador.</p>}

      <form method="get" className="my-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label>
          Buscar
          <input name="q" defaultValue={filters.q} maxLength={120} placeholder="Título o slug" className="block w-full border p-2" />
        </label>
        <label>
          Estado
          <select name="status" defaultValue={filters.status} className="block w-full border p-2">
            <option value="">Todos</option>
            <option value="active">A la venta</option>
            <option value="inactive">Inactivos</option>
            <option value="archived">Archivados</option>
          </select>
        </label>
        <button className="self-end border px-4 py-2">Filtrar</button>
      </form>

      <p aria-live="polite">{listings.length} {listings.length === 1 ? "hospedaje" : "hospedajes"}</p>
      <table className="mt-3 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-3">Título</th>
            <th className="py-2 pr-3">Slug</th>
            <th className="py-2 pr-3">Estado</th>
            {admin && <th className="py-2 pr-3">Reservas</th>}
            <th className="py-2"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <tr key={listing.id} className="border-b align-top">
              <td className="py-2 pr-3">{listing.title}</td>
              <td className="py-2 pr-3 font-mono text-xs">{listing.slug}</td>
              <td className="py-2 pr-3">{STATUS_LABELS[listing.status]}</td>
              {admin && <td className="py-2 pr-3 tabular-nums">{listing.bookings}</td>}
              <td className="py-2"><Link href={`/admin/listings/${listing.id}`}>Editar<span className="sr-only"> {listing.title}</span></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {listings.length === 0 && <p className="mt-4">No hay hospedajes con estos filtros.</p>}
    </main>
  );
}
