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

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN" && actor.role !== "BOOKING_MANAGER") notFound();

  const query = await searchParams;
  const filters = parseBookingListFilters(query);
  if (!filters) redirect("/admin/bookings");
  const data = await staffBookingList(actor, filters);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-[#394342]">
      <Link href="/admin">← Panel</Link>
      <h1 className="mt-5 text-3xl">Reservas</h1>
      <form method="get" className="my-6 grid gap-3 sm:grid-cols-4">
        <label>
          Hospedaje
          <select name="listingId" defaultValue={filters.listingId?.toString() ?? ""} className="block w-full border p-2">
            <option value="">Todos</option>
            {data.listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title}{listing.archived ? " (archivado)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select name="status" defaultValue={filters.status ?? ""} className="block w-full border p-2">
            <option value="">Todos</option>
            <option value="pending_payment">Pendiente de pago</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </label>
        <label>Desde<input type="date" name="from" defaultValue={filters.from ?? ""} className="block w-full border p-2" /></label>
        <label>Hasta<input type="date" name="to" defaultValue={filters.to ?? ""} className="block w-full border p-2" /></label>
        <button className="border px-4 py-2">Filtrar</button>
      </form>

      <p aria-live="polite">{data.total} reservas · página {data.page} de {data.pages}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead><tr>{["Huésped", "Hospedaje", "Estancia", "Estado", "Total", ""].map((label) => <th key={label} className="border-b p-3">{label}</th>)}</tr></thead>
          <tbody>
            {data.bookings.map((booking) => (
              <tr key={booking.id}>
                <td className="border-b p-3">{booking.guestName}<br /><span>{booking.guestEmail}</span></td>
                <td className="border-b p-3">{booking.listing.title}{booking.listing.archived ? " (archivado)" : ""}</td>
                <td className="border-b p-3">{booking.checkIn} – {booking.checkOut}</td>
                <td className="border-b p-3">{booking.status}{booking.paymentReviewRequired ? " · requiere revisión de pago" : ""}</td>
                <td className="border-b p-3">USD {(booking.totalCents / 100).toFixed(2)}</td>
                <td className="border-b p-3"><Link href={`/admin/bookings/${booking.id}`}>Ver reserva</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Paginación" className="mt-5 flex gap-4">
        {filters.page > 1 && <Link href={pageUrl(filters, filters.page - 1)}>Anterior</Link>}
        {filters.page < data.pages && filters.page < 10_000 && <Link href={pageUrl(filters, filters.page + 1)}>Siguiente</Link>}
      </nav>
    </main>
  );
}
