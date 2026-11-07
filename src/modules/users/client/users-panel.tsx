"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

type Role = "ADMIN" | "EDITOR" | "BOOKING_MANAGER";
type User = { id: number; name: string; email: string; role: Role; active: boolean };
const roles: Record<Role, string> = { ADMIN: "Administrador", EDITOR: "Editor", BOOKING_MANAGER: "Gestor de reservas" };

export default function UsersPanel({ users, currentUserId, created }: { users: User[]; currentUserId: number; created: boolean }) {
  return <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><p className="mb-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#687371]">Administración · Accesos</p>
        <h1 className="m-0 font-heading text-[32px] font-medium leading-tight text-[#394342] sm:text-[36px]">Usuarios</h1>
        <p className="mb-0 mt-2 max-w-xl text-[14px] leading-6 text-[#596260]">Gestiona quién puede entrar y qué puede hacer en el panel.</p></div>
      <Link href="/admin/users/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white transition hover:bg-[#2f3938] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]"><Plus size={17} aria-hidden="true" />Crear usuario</Link>
    </header>
    {created && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-white p-4 text-[14px] text-emerald-800">Usuario creado. Ya puede iniciar sesión con las credenciales que configuraste.</p>}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="m-0 text-[13px] text-[#687371]">{users.length} {users.length === 1 ? "usuario encontrado" : "usuarios encontrados"}</p>
    </div>
    <div className="overflow-hidden rounded-2xl border border-[rgba(7,36,86,.075)] bg-white shadow-[0_5px_30px_rgba(7,36,86,.045)]">
      {users.length ? <>
        <ul className="m-0 list-none divide-y divide-slate-100 p-0 sm:hidden">
          {users.map(user => <li key={user.id} className="p-5">
            <h2 className="m-0 break-words font-heading text-base font-medium leading-6 text-[#394342]">{user.name}{user.id === currentUserId && <span className="ml-2 rounded-full bg-[#eef5f7] px-2 py-1 font-body text-xs font-medium text-[#24556a]">Tu cuenta</span>}</h2>
            <p className="mb-0 mt-2 break-all text-xs leading-5 text-[#737d7a]">{user.email}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${user.active ? "bg-[#eaf3eb] text-[#356b40]" : "bg-[#fff4df] text-[#795a1d]"}`}>{user.active ? "Activa" : "Inactiva"}</span><span className="block text-xs text-[#596260]">{roles[user.role]}</span></div>
              <Link href={`/admin/users/${user.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium text-[#394342] focus-visible:outline-2 focus-visible:outline-[#0277bd]">Editar<ArrowRight size={15} aria-hidden="true" /><span className="sr-only"> {user.name}</span></Link>
            </div>
          </li>)}
        </ul>
        <div className="relative hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left font-body text-[14px]">
          <thead className="bg-[#f8f9f7] text-[11px] uppercase tracking-[.1em] text-[#687371]"><tr className="border-b border-[rgba(7,36,86,.075)]">
            <th className="px-5 py-3 font-medium">Usuario</th><th className="px-4 py-3 font-medium">Rol</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-5 py-3"><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>{users.map(user => <tr key={user.id} className="border-b border-[rgba(7,36,86,.075)] last:border-0 hover:bg-[#fbfcfa]">
            <td className="px-5 py-4"><p className="m-0 font-medium text-[#394342]">{user.name}{user.id === currentUserId && <span className="ml-2 rounded-full bg-[#eef5f7] px-2 py-1 text-xs font-medium text-[#24556a]">Tu cuenta</span>}</p><p className="mb-0 mt-1 break-all text-[12px] text-[#737d7a]">{user.email}</p></td>
            <td className="px-4 py-4 text-[#596260]">{roles[user.role]}</td>
            <td className="px-4 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-medium ${user.active ? "bg-[#eaf3eb] text-[#356b40]" : "bg-[#fff4df] text-[#795a1d]"}`}>{user.active ? "Activa" : "Inactiva"}</span></td>
            <td className="px-5 py-4 text-right"><Link href={`/admin/users/${user.id}`} className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[14px] font-medium text-[#394342] hover:bg-[#f0f2ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Editar<ArrowRight size={15} aria-hidden="true" /><span className="sr-only"> {user.name}</span></Link></td>
          </tr>)}</tbody>
        </table></div>
      </> : <div className="px-6 py-12 text-center"><p className="mb-1 font-heading text-[18px] font-medium text-[#394342]">Todavía no hay usuarios</p><p className="mb-5 text-[14px] text-[#687371]">Crea la primera cuenta para dar acceso al equipo.</p><Link href="/admin/users/new" className="text-[14px] font-medium text-[#394342] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#0277bd]">Crear usuario</Link></div>}
    </div>
    <p className="mb-0 mt-5 text-[14px]"><Link className="text-[#394342] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#0277bd]" href="/admin/account/password">Cambiar tu contraseña</Link></p>
  </main>;
}
