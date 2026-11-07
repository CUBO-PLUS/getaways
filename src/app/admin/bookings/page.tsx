import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { staffBookingList } from "@/modules/bookings/server/booking-admin";
import { parseBookingListFilters, type BookingListFilters } from "@/modules/bookings/server/booking-admin-http";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

function pageUrl(filters: BookingListFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.listingId !== undefined) query.set("listingId", String(filters.listingId));
  if (filters.status) query.set("status", filters.status);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  query.set("page", String(page));
  return `/admin/bookings?${query}`;
}

const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const statusLabel: Record<string, string> = { pending_payment: "Pendiente de pago", confirmed: "Confirmada", cancelled: "Cancelada" };

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN" && actor.role !== "BOOKING_MANAGER") notFound();

  const query = await searchParams;
  const filters = parseBookingListFilters(query);
  if (!filters) redirect("/admin/bookings");
  const data = await staffBookingList(actor, filters);

  return (
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10 [&_a]:font-body [&_a]:text-[#394342] [&_a]:underline-offset-4 [&_a:hover]:underline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-[#0277bd] [&_button]:font-body [&_input]:font-body [&_select]:font-body">
      <p className="mb-2 mt-0 text-xs uppercase tracking-wider text-slate-500">Administración · Operación</p>
      <h1 className="m-0 font-heading text-[32px] font-medium leading-9">Reservas</h1>
      <p className="mb-0 mt-2">Consulta estancias y gestiona solicitudes del huésped.</p>
      <form method="get" className="my-6 rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-5 shadow-sm">
        <h2 className="mb-4 mt-0 font-heading text-lg font-medium">Filtrar reservas</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid min-w-0 gap-1.5 font-medium">
          Hospedaje
           <select name="listingId" defaultValue={filters.listingId?.toString() ?? ""} className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-[#0277bd]">
            <option value="">Todos</option>
            {data.listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title}{listing.archived ? " (archivado)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 font-medium">
          Estado
          <select name="status" defaultValue={filters.status ?? ""} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-[#0277bd]">
            <option value="">Todos</option>
            <option value="pending_payment">Pendiente de pago</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 font-medium">Estancias desde<input type="date" name="from" defaultValue={filters.from ?? ""} className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-[#0277bd]" /></label>
        <label className="grid min-w-0 gap-1.5 font-medium">Estancias hasta<input type="date" name="to" defaultValue={filters.to ?? ""} className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-[#0277bd]" /></label>
        </div>
        <p className="m-0 mt-3 text-xs leading-5 text-slate-500">El rango incluye reservas cuya estancia coincida con esas fechas.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="min-h-11 rounded-full bg-[#394342] px-5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Aplicar filtros</button>
          <Link href="/admin/bookings" className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5">Limpiar filtros</Link>
        </div>
      </form>

      <p aria-live="polite" className="mb-3 mt-0">{data.total} {data.total === 1 ? "reserva" : "reservas"} · página {data.page} de {data.pages}</p>
      {data.bookings.length === 0 ? <section className="rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-8 text-center"><h2 className="m-0 font-heading text-xl font-medium">No hay reservas con estos filtros</h2><p className="mb-0 mt-2">Prueba otro hospedaje, estado o rango de fechas.</p></section> : <>
        <ul className="m-0 grid list-none gap-4 p-0 sm:hidden">
          {data.bookings.map(booking => <li key={booking.id} className="relative rounded-xl border border-slate-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">Reserva #{booking.id}</span><span className={`rounded-full px-3 py-1 text-xs font-medium ${booking.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : booking.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-900"}`}>{statusLabel[booking.status] ?? booking.status}</span></div>
            <h2 className="m-0 mt-4 font-heading text-base font-medium leading-6">{booking.listing.title}{booking.listing.archived ? " (archivado)" : ""}</h2>
            <p className="m-0 mt-2 text-sm leading-6">{date(booking.checkIn)} – {date(booking.checkOut)}</p>
            <p className="m-0 mt-3 break-words text-sm font-medium">{booking.guestName}<span className="mt-1 block break-all text-xs font-normal text-slate-500">{booking.guestEmail}</span></p>
            {booking.paymentReviewRequired && <p className="mb-0 mt-3 text-sm text-amber-800">Requiere revisión de pago</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="font-heading text-lg tabular-nums">{new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(booking.totalCents / 100)}</span><Link href={`/admin/bookings/${booking.id}`} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 px-4 font-body text-sm font-medium">Ver reserva<span className="sr-only"> #{booking.id}</span> →</Link></div>
          </li>)}
        </ul>
        <div className="relative hidden overflow-x-auto rounded-xl border border-[rgba(7,36,86,.075)] bg-white sm:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Huésped", "Hospedaje", "Estancia", "Estado", "Total"].map((label) => <th scope="col" key={label} className="border-b border-slate-100 p-4 font-medium">{label}</th>)}<th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {data.bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-slate-50/60 [&_td]:border-slate-100 [&_td]:py-5">
                <td className="border-b p-3">{booking.guestName}<br /><span className="text-slate-600">{booking.guestEmail}</span></td>
                <td className="border-b p-3">{booking.listing.title}{booking.listing.archived ? " (archivado)" : ""}</td>
                <td className="border-b p-3">{date(booking.checkIn)} – {date(booking.checkOut)}</td>
                <td className="border-b p-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${booking.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : booking.status === "cancelled" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900"}`}>{statusLabel[booking.status] ?? booking.status}</span>{booking.paymentReviewRequired && <span className="mt-1 block text-xs text-amber-800">Revisión de pago</span>}</td>
                <td className="whitespace-nowrap border-b p-3 tabular-nums">{new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(booking.totalCents / 100)}</td>
                <td className="border-b p-3"><Link className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 font-medium hover:bg-slate-100" href={`/admin/bookings/${booking.id}`}>Ver reserva<span className="sr-only"> #{booking.id}</span> →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></>}
      <nav aria-label="Paginación" className="mt-5 flex items-center justify-between gap-4">
        {filters.page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5" href={pageUrl(filters, filters.page - 1)}>← Anterior</Link> : <span />}
        <span aria-live="polite">Página {data.page} de {data.pages}</span>
        {filters.page < data.pages && filters.page < 10_000 ? <Link className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5" href={pageUrl(filters, filters.page + 1)}>Siguiente →</Link> : <span />}
      </nav>
    </main>
  );
}
