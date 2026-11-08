import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { listAdminReferralCodes } from "@/modules/referrals/referral-admin";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ReferralCodesPage() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();

  const codes = await listAdminReferralCodes(actor);

  return (
    <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10 [&_a]:text-[#394342] [&_a]:underline-offset-4 [&_a:hover]:underline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-[#0277bd]">
      <p className="mb-2 mt-0 text-xs uppercase tracking-wider text-slate-500">Administración · Operación</p>
      <h1 className="m-0 font-heading text-[32px] font-medium leading-9">Códigos de referido</h1>
      <p className="mb-0 mt-2">Consulta el estado y los usos de cada código.</p>
      <Link href="/admin/referrals/new" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 font-medium">Crear código</Link>
      <p aria-live="polite" className="mb-3 mt-6">{codes.length} {codes.length === 1 ? "código" : "códigos"}</p>
      {codes.length === 0 ? <section className="mt-4 rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-8 text-center"><h2 className="m-0 font-heading text-xl font-medium">No hay códigos de referido</h2><p className="mb-0 mt-2">Los códigos disponibles aparecerán aquí.</p></section> : <>
        <ul className="m-0 grid list-none gap-4 p-0 sm:hidden">
          {codes.map((item) => <li key={item.code} className="rounded-xl border border-slate-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 break-all font-heading text-lg font-medium">{item.code}</h2><span className={`rounded-full px-3 py-1 text-xs font-medium ${item.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{item.active ? "Activo" : "Inactivo"}</span></div>
            <p className="mb-0 mt-3">{item.total} {item.total === 1 ? "uso" : "usos"}<span className="block text-sm text-slate-600">{item.pending} pendientes · {item.confirmed} confirmadas · {item.cancelled} canceladas</span></p>
            <Link className="mt-4 inline-flex min-h-11 items-center rounded-full border border-slate-200 px-4 font-medium" href={`/admin/referrals/${encodeURIComponent(item.code)}`}>Ver detalle<span className="sr-only"> de {item.code}</span> →</Link>
          </li>)}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-[rgba(7,36,86,.075)] bg-white sm:block">
          <table className="w-full min-w-[650px] border-collapse text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Código", "Estado", "Usos", "Pendientes", "Confirmadas", "Canceladas"].map(label => <th scope="col" key={label} className="border-b border-slate-100 p-4 font-medium">{label}</th>)}<th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{codes.map(item => <tr key={item.code} className="hover:bg-slate-50/60 [&_td]:border-b [&_td]:border-slate-100 [&_td]:py-4"><th scope="row" className="break-all p-4 text-left font-medium">{item.code}</th><td className="p-4">{item.active ? "Activo" : "Inactivo"}</td><td className="p-4 tabular-nums">{item.total}</td><td className="p-4 tabular-nums">{item.pending}</td><td className="p-4 tabular-nums">{item.confirmed}</td><td className="p-4 tabular-nums">{item.cancelled}</td><td className="p-3"><Link className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 font-medium hover:bg-slate-100" href={`/admin/referrals/${encodeURIComponent(item.code)}`}>Ver detalle<span className="sr-only"> de {item.code}</span> →</Link></td></tr>)}</tbody>
          </table>
        </div>
      </>}
    </main>
  );
}
