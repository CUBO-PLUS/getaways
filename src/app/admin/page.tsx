import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import Logout from "@/modules/auth/client/logout";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return <main lang="es" className="mx-auto max-w-4xl px-6 py-12 text-[#394342]">
    <h1 className="text-4xl">Panel de administración</h1>
    <p className="mt-4">Selecciona una sección para continuar.</p>
    <nav aria-label="Secciones del panel" className="mt-6 flex flex-col items-start gap-4">
      {(session.role === "ADMIN" || session.role === "EDITOR") && <Link href="/admin/blog">Blog</Link>}
      {session.role === "ADMIN" && <Link href="/admin/users">Usuarios</Link>}
      {(session.role === "ADMIN" || session.role === "BOOKING_MANAGER") && <Link href="/admin/bookings">Reservas</Link>}
      <Link href="/admin/account/password">Cambiar contraseña</Link>
    </nav>
    <Logout />
  </main>;
}
