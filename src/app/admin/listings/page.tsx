import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { listingAccessAllowed, parseListingListFilters, staffListingList, type ListingStatus } from "@/modules/listings/server/listing-admin";
import { ArrowRight, Plus, Search, SlidersHorizontal } from "lucide-react";

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
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div><p className="mb-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#687371]">Administración · Catálogo</p>
          <h1 className="m-0 font-heading text-[32px] font-medium leading-tight text-[#394342] sm:text-[36px]">Hospedajes</h1>
          <p className="mb-0 mt-2 max-w-xl text-[14px] leading-6 text-[#596260]">Consulta las fichas, su estado de venta y los datos que puedes gestionar.</p></div>
        <div className="flex flex-wrap gap-3">{admin && <Link href="/admin/listings/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white transition hover:bg-[#2f3938] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]"><Plus size={17} aria-hidden="true" />Nuevo hospedaje</Link>}<Link href="/admin/listings/categories" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(7,36,86,.16)] px-5 font-body text-[14px] font-medium text-[#394342] hover:bg-[#f4f5f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Categorías</Link></div>
      </header>
      {!admin && <p className="mb-6 rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-4 text-[14px] leading-6 text-[#596260]">Puedes editar descripción, imágenes y datos descriptivos. Precios, capacidad y estado los gestiona un administrador.</p>}

      <form method="get" className="mb-6 grid gap-4 rounded-2xl border border-[rgba(7,36,86,.075)] bg-white p-4 shadow-[0_5px_30px_rgba(7,36,86,.045)] sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end sm:p-5">
        <label className="grid gap-2 font-body text-[14px] font-medium text-[#394342]">
          <span className="flex items-center gap-2"><Search size={15} aria-hidden="true" />Buscar hospedaje</span>
          <input name="q" defaultValue={filters.q} maxLength={120} placeholder="Título o slug" className="min-h-11 w-full rounded-lg border border-[rgba(7,36,86,.16)] bg-white px-3 font-body text-[14px] text-[#394342] placeholder:text-[#818987] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0277bd]" />
        </label>
        <label className="grid gap-2 font-body text-[14px] font-medium text-[#394342]">
          <span className="flex items-center gap-2"><SlidersHorizontal size={15} aria-hidden="true" />Estado</span>
          <select name="status" defaultValue={filters.status} className="min-h-11 w-full rounded-lg border border-[rgba(7,36,86,.16)] bg-white px-3 font-body text-[14px] text-[#394342] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0277bd]">
            <option value="">Todos</option>
            <option value="active">A la venta</option>
            <option value="inactive">Inactivos</option>
            <option value="archived">Archivados</option>
          </select>
        </label>
        <button className="min-h-11 rounded-full border border-[rgba(7,36,86,.16)] px-5 font-body text-[14px] font-medium text-[#394342] hover:bg-[#f4f5f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Aplicar filtros</button>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="m-0 font-body text-[13px] text-[#687371]">{listings.length} {listings.length === 1 ? "hospedaje" : "hospedajes"} encontrados</p>
        {(filters.q || filters.status) && <Link href="/admin/listings" className="inline-flex min-h-11 items-center font-body text-sm font-medium text-[#394342] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#0277bd]">Limpiar filtros</Link>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[rgba(7,36,86,.075)] bg-white shadow-[0_5px_30px_rgba(7,36,86,.045)]">
        {listings.length ? <>
          <ul className="m-0 list-none divide-y divide-slate-100 p-0 sm:hidden">
            {listings.map(listing => <li key={listing.id} className="relative p-5">
              <h2 className="m-0 font-heading text-base font-medium leading-6 text-[#394342]">{listing.title}</h2>
              <p className="mb-0 mt-2 break-all font-mono text-xs leading-5 text-[#737d7a]">/listing/{listing.slug}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${listing.status === "active" ? "bg-[#eaf3eb] text-[#356b40]" : "bg-slate-100 text-slate-600"}`}>{STATUS_LABELS[listing.status]}</span>{admin && <span className="block text-xs text-[#596260]">{listing.bookings} reservas</span>}</div>
                <Link href={`/admin/listings/${listing.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-4 font-body text-sm font-medium text-[#394342] focus-visible:outline-2 focus-visible:outline-[#0277bd]">Editar<ArrowRight size={15} aria-hidden /><span className="sr-only"> {listing.title}</span></Link>
              </div>
            </li>)}
          </ul>
          <div className="relative hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left font-body text-[14px]">
          <thead className="bg-[#f8f9f7] text-[11px] uppercase tracking-[.1em] text-[#687371]"><tr className="border-b border-[rgba(7,36,86,.075)]">
            <th className="px-5 py-3 font-medium">Hospedaje</th><th className="px-4 py-3 font-medium">Estado</th>{admin && <th className="px-4 py-3 font-medium">Reservas</th>}<th className="px-5 py-3"><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>{listings.map((listing) => <tr key={listing.id} className="border-b border-[rgba(7,36,86,.075)] last:border-0 hover:bg-[#fbfcfa]">
            <td className="px-5 py-4"><p className="m-0 font-medium text-[#394342]">{listing.title}</p><p className="mb-0 mt-1 font-mono text-[12px] text-[#737d7a]">/listing/{listing.slug}</p></td>
            <td className="px-4 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-medium ${listing.status === "active" ? "bg-[#eaf3eb] text-[#356b40]" : listing.status === "archived" ? "bg-[#f0efed] text-[#686d6a]" : "bg-[#fff4df] text-[#795a1d]"}`}>{STATUS_LABELS[listing.status]}</span></td>
            {admin && <td className="px-4 py-4 tabular-nums text-[#596260]">{listing.bookings}</td>}
            <td className="px-5 py-4 text-right"><Link href={`/admin/listings/${listing.id}`} className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 font-body text-[14px] font-medium text-[#394342] hover:bg-[#f0f2ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Editar<ArrowRight size={15} aria-hidden="true" /><span className="sr-only"> {listing.title}</span></Link></td>
          </tr>)}</tbody></table></div></> : <div className="px-6 py-12 text-center"><p className="mb-1 font-heading text-[18px] font-medium text-[#394342]">No hay hospedajes con estos filtros</p><p className="mb-5 text-[14px] text-[#687371]">Prueba otra búsqueda o quita el filtro de estado.</p><Link href="/admin/listings" className="font-body text-[14px] font-medium text-[#394342] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#0277bd]">Limpiar filtros</Link></div>}
      </div>
    </main>
  );
}
