import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getSession } from "@/modules/auth/server/auth";
import { getBookingStatistics } from "@/modules/bookings/server/booking-statistics";
import { getUmamiStatistics } from "@/modules/analytics/server/umami";
import { UMAMI_ORIGIN, UMAMI_WEBSITE_ID } from "@/shared/analytics/umami";
import { ADMIN_STATISTICS_PERIODS, parseAdminStatisticsPeriod, type AdminStatisticsPeriod } from "@/shared/utils/admin-period";
import { navForRole } from "@/shared/ui/admin-navigation";

const money = (cents: number) => new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
const instantDate = (value: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeZone: "America/El_Salvador" }).format(new Date(value));
const card = "min-w-0 rounded-[10px] bg-white p-5 shadow-[0_5px_30px_0_rgba(7,36,86,0.075)]";
const metric = "mt-2 min-w-0 break-words [overflow-wrap:anywhere] font-heading text-[27px] font-medium tabular-nums leading-tight text-[#394342]";

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={card}>
      <p className="m-0 font-body text-[13px] text-muted-text">{label}</p>
      <p className={metric}>{value}</p>
      {note && <p className="m-0 mt-1 font-body text-[12px] text-muted-text">{note}</p>}
    </div>
  );
}

async function Traffic({ period }: { period: AdminStatisticsPeriod }) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "EDITOR")) return null;
  const result = await getUmamiStatistics(session, period);
  const deepLink = new URL(`/websites/${UMAMI_WEBSITE_ID}`, UMAMI_ORIGIN).toString();
  return (
    <section aria-labelledby="traffic-title" className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="traffic-title" className="m-0 font-heading text-[23px] font-medium text-heading">
            Tráfico del sitio
          </h2>
          <p className="m-0 mt-1 font-body text-[13px] text-muted-text">
            Sitio público · últimos {period} días
          </p>
        </div>
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#394342] px-5 font-body text-[14px] text-white no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]"
        >
          Ver más en Umami
          <ExternalLink aria-hidden className="size-4" />
          <span className="sr-only"> (se abre en una pestaña nueva)</span>
        </a>
      </div>
      {result.available ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Visitantes" value={result.data.visitors} />
          <Metric label="Visitas" value={result.data.visits} />
          <Metric label="Páginas vistas" value={result.data.pageviews} />
        </div>
      ) : (
        <p role="status" className={`${card} m-0 font-body text-[14px] text-body-text`}>
          Las estadísticas de tráfico no están disponibles ahora. Inténtalo más tarde.
        </p>
      )}
    </section>
  );
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const query = await searchParams;
  const period = parseAdminStatisticsPeriod(query.period);
  const hasBookings = session.role === "ADMIN" || session.role === "BOOKING_MANAGER";
  const hasTraffic = session.role === "ADMIN" || session.role === "EDITOR";
  const stats = hasBookings ? await getBookingStatistics(session, period) : null;
  const links = navForRole(session.role).flatMap((group) => group.items).filter((item) => !item.exact);

  return (
    <main lang="es" className="mx-auto max-w-5xl px-6 py-10 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <span aria-hidden className="block h-[5px] w-[50px] rounded-full bg-[#394342]" />
          <h1 className="mt-4 font-heading text-[34px] font-medium leading-tight text-heading lg:text-[42px]">
            Resumen
          </h1>
          <p className="m-0 mt-2 font-body text-[15px] leading-6 text-muted-text">
            Reservas y actividad del sitio, en un vistazo.
          </p>
        </div>
        {(hasBookings || hasTraffic) && (
          <form action="/admin" method="get" className="flex items-center gap-2 font-body text-[14px] text-body-text">
            <label htmlFor="period">Período</label>
            <select
              id="period"
              name="period"
              defaultValue={period}
              className="min-h-11 rounded-md border border-[rgba(7,36,86,0.16)] bg-white px-3 font-body text-[14px] text-[#394342] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]"
            >
              {ADMIN_STATISTICS_PERIODS.map((days) => (
                <option key={days} value={days}>
                  {days} días
                </option>
              ))}
            </select>
            <button className="min-h-11 rounded-full bg-[#394342] px-4 font-body text-[14px] text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">
              Aplicar
            </button>
          </form>
        )}
      </header>
      <p className="mt-3 font-body text-[12px] leading-5 text-muted-text">
        Períodos según fecha de creación de la reserva; fechas en America/El_Salvador.
      </p>
      {stats && (
        <>
          <section aria-labelledby="pending-title" className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="pending-title" className="m-0 font-heading text-[21px] font-medium text-heading">
                Por atender
              </h2>
              <span className="font-body text-[12px] text-muted-text">Todos los períodos</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Link
                href="/admin/bookings?status=pending_payment"
                className={`${card} border-l-4 border-l-amber-500 no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]`}
              >
                <p className="m-0 font-body text-[13px] text-body-text">Pagos pendientes</p>
                <p className={`${metric} flex flex-wrap items-baseline gap-x-2 text-amber-800`}>
                  <span>{stats.pendingPayment}</span>
                  <span className="font-body text-[13px] font-normal text-body-text">
                    · {money(stats.pendingPaymentCents)}
                  </span>
                </p>
                <span className="font-body text-[13px] text-[#394342]">Revisar reservas →</span>
              </Link>
              <div className={`${card} border-l-4 border-l-amber-500`}>
                <p className="m-0 font-body text-[13px] text-body-text">Pagos por revisar</p>
                <p className={`${metric} text-amber-800`}>{stats.paymentReviewRequired}</p>
              </div>
            </div>
          </section>
          <section aria-labelledby="booking-title" className="mt-10">
            <h2 id="booking-title" className="mb-4 font-heading text-[23px] font-medium text-heading">
              Reservas · últimos {period} días
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Reservas creadas" value={stats.total} />
              <Metric label="Confirmadas" value={stats.confirmed} />
              <Metric label="Canceladas" value={stats.cancelled} />
              <Metric
                label="Valor de reservas confirmadas"
                value={money(stats.confirmedReservationCents)}
                note="Pagos actuales en testnet"
              />
            </div>
            <div className={`${card} mt-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 font-heading text-[18px] font-medium text-heading">Reservas recientes</h3>
                <Link
                  href="/admin/bookings"
                  className="font-body text-[14px] text-[#394342] underline underline-offset-2"
                >
                  Ver todas las reservas
                </Link>
              </div>
              {stats.recent.length ? (
                <ul className="m-0 mt-4 list-none divide-y divide-[rgba(7,36,86,0.075)] p-0">
                  {stats.recent.map((booking) => (
                    <li
                      key={booking.id}
                      className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className="font-heading text-[15px] font-medium text-heading underline underline-offset-2"
                        >
                          {booking.guestName}
                        </Link>
                        <p className="m-0 mt-1 font-body text-[13px] text-body-text">
                          {booking.listingTitle} · {date(booking.checkIn)} – {date(booking.checkOut)}
                        </p>
                        <p className="m-0 mt-1 font-body text-[12px] text-muted-text">
                          Creada {instantDate(booking.createdAt)} · {booking.status === "confirmed"
                            ? "Confirmada"
                            : booking.status === "cancelled"
                              ? "Cancelada"
                              : booking.status === "pending_payment"
                                ? "Pago pendiente"
                                : booking.status}
                        </p>
                      </div>
                      <span className="min-w-0 break-words [overflow-wrap:anywhere] font-body text-[14px] font-medium tabular-nums text-[#394342]">
                        {money(booking.totalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-4 font-body text-[14px] text-body-text">
                  No hay reservas creadas en este período.
                </p>
              )}
            </div>
          </section>
        </>
      )}
      {hasTraffic && (
        <Suspense
          fallback={
            <section className="mt-10" aria-live="polite">
              <h2 className="font-heading text-[23px] font-medium text-heading">Tráfico del sitio</h2>
              <p className="font-body text-[14px] text-muted-text">Cargando estadísticas…</p>
            </section>
          }
        >
          <Traffic period={period} />
        </Suspense>
      )}
      {links.length > 0 && (
        <nav aria-label="Accesos rápidos" className="mt-10 border-t border-[rgba(7,36,86,0.075)] pt-5">
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-3 p-0">
            {links.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="font-body text-[13px] text-[#394342] underline underline-offset-2"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
