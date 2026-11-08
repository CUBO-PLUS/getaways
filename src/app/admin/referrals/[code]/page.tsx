import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { getAdminReferralDetail } from "@/modules/referrals/referral-admin";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const dateTime = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const statusLabel: Record<string, string> = { pending: "Pendiente", pending_payment: "Pendiente de pago", confirmed: "Confirmada", cancelled: "Cancelada" };

export default async function ReferralDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  const { code } = await params;
  const detail = await getAdminReferralDetail(actor, code);
  if (!detail) notFound();

  return (
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10 [&_a]:text-[#394342] [&_a]:underline-offset-4 [&_a:hover]:underline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-[#0277bd]">
      <p className="mb-2 mt-0 text-xs uppercase tracking-wider text-slate-500">Administración · Operación · Referidos</p>
      <Link href="/admin/referrals" className="inline-flex min-h-11 items-center">← Todos los códigos</Link>
       <div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="m-0 break-all font-heading text-[32px] font-medium leading-9">{detail.code}</h1><span className={`rounded-full px-3 py-1 text-xs font-medium ${detail.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{detail.active ? "Activo" : "Inactivo"}</span><Link href={`/admin/referrals/${encodeURIComponent(detail.code)}/edit`} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 px-4 font-medium">Editar código</Link></div>
      <p aria-live="polite" className="mb-4 mt-2">{detail.attributions.length} {detail.attributions.length === 1 ? "atribución" : "atribuciones"}</p>
      {detail.attributions.length === 0 ? <section className="rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-8 text-center"><h2 className="m-0 font-heading text-xl font-medium">Todavía no hay atribuciones</h2><p className="mb-0 mt-2">Las reservas asociadas a este código aparecerán aquí.</p></section> : <>
        <ul className="m-0 grid list-none gap-4 p-0 sm:hidden">
          {detail.attributions.map((item, index) => <li key={`${item.bookingId}-${item.createdAt}-${index}`} className="rounded-xl border border-slate-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 font-heading text-base font-medium">Reserva #{item.bookingId}</h2><span className="text-xs text-slate-600">Atribuida {dateTime(item.createdAt)}</span></div>
            <dl className="mb-0 mt-4 grid gap-3"><div><dt className="text-xs text-slate-500">Huésped</dt><dd className="m-0 break-words">{item.guestName ?? "No disponible"}</dd></div><div><dt className="text-xs text-slate-500">Hospedaje</dt><dd className="m-0">{item.listingTitle ?? "No disponible"}</dd></div><div><dt className="text-xs text-slate-500">Estancia</dt><dd className="m-0">{item.checkIn && item.checkOut ? `${date(item.checkIn)} – ${date(item.checkOut)}` : "No disponible"}</dd></div><div><dt className="text-xs text-slate-500">Estado de atribución</dt><dd className="m-0">{statusLabel[item.status] ?? item.status}</dd></div><div><dt className="text-xs text-slate-500">Estado de reserva</dt><dd className="m-0">{item.bookingExists && item.bookingStatus ? statusLabel[item.bookingStatus] ?? item.bookingStatus : "No disponible"}</dd></div></dl>
            {item.bookingExists && <Link href={`/admin/bookings/${item.bookingId}`} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-slate-200 px-4 font-medium">Ver reserva #{item.bookingId} →</Link>}
          </li>)}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-[rgba(7,36,86,.075)] bg-white sm:block"><table className="w-full min-w-[950px] border-collapse text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Reserva", "Huésped", "Hospedaje", "Estancia", "Estado reserva", "Estado atribución", "Fecha atribución"].map(label => <th scope="col" key={label} className="border-b border-slate-100 p-4 font-medium">{label}</th>)}<th scope="col"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{detail.attributions.map((item, index) => <tr key={`${item.bookingId}-${item.createdAt}-${index}`} className="hover:bg-slate-50/60 [&_td]:border-b [&_td]:border-slate-100 [&_td]:py-4"><th scope="row" className="p-4 text-left font-medium">#{item.bookingId}</th><td className="p-4">{item.guestName ?? "No disponible"}</td><td className="p-4">{item.listingTitle ?? "No disponible"}</td><td className="whitespace-nowrap p-4">{item.checkIn && item.checkOut ? `${date(item.checkIn)} – ${date(item.checkOut)}` : "No disponible"}</td><td className="p-4">{item.bookingExists && item.bookingStatus ? statusLabel[item.bookingStatus] ?? item.bookingStatus : "No disponible"}</td><td className="p-4">{statusLabel[item.status] ?? item.status}</td><td className="whitespace-nowrap p-4">{dateTime(item.createdAt)}</td><td className="p-3">{item.bookingExists && <Link className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 font-medium hover:bg-slate-100" href={`/admin/bookings/${item.bookingId}`}>Ver reserva<span className="sr-only"> #{item.bookingId}</span> →</Link>}</td></tr>)}</tbody></table></div>
      </>}
    </main>
  );
}
