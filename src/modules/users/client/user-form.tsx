"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type UserRole = "ADMIN" | "EDITOR" | "BOOKING_MANAGER";
export type DisplayUser = { id: number; name: string; email: string; role: UserRole; active: boolean };
export const roleNames: Record<UserRole, string> = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  BOOKING_MANAGER: "Gestor de reservas",
};

const input = "mt-1 w-full rounded-lg border border-[rgba(7,36,86,.18)] bg-white px-3 py-2.5 font-body text-[14px] text-[#394342] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";
const button = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";
const secondaryLink = "inline-flex min-h-11 items-center rounded-full px-4 font-body text-[14px] text-[#0277bd] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#0277bd]";

function apiMessage(status: number, operation: "create" | "update" | "reset" = "update") {
  if (status === 401) return "La sesión no es válida o la contraseña actual es incorrecta.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status === 404) return "No encontramos esta cuenta.";
  if (status === 409 && operation === "create") return "Ese correo ya está asociado a otra cuenta. Usa una dirección distinta.";
  if (status === 409) return "No se pudo guardar. Puede que deba permanecer un administrador activo o que los datos hayan cambiado.";
  if (status === 429) return "Demasiados intentos. Espera antes de volver a intentarlo.";
  if (status === 503) return "El servicio no está disponible. Inténtalo más tarde.";
  return "No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.";
}

function PageFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main lang="es" className="min-h-screen bg-[#f4f5f2] px-4 py-8 text-[#394342] sm:px-6 sm:py-10 lg:px-10">
        <div className="mx-auto max-w-6xl">
        <Link href="/admin/users" className="mb-5 inline-flex min-h-11 items-center font-body text-sm font-medium text-[#394342] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">← Volver a usuarios</Link>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[.16em] text-[#0277bd]">Panel de administración · Usuarios</p>
        <h1 className="m-0 font-heading text-[32px] font-medium leading-9">{title}</h1>
        <p className="mb-6 mt-2 font-body text-[14px]">{description}</p>
        {children}
      </div>
    </main>
  );
}

function RoleField({ value, onChange }: { value: UserRole; onChange: (value: UserRole) => void }) {
  return (
    <div>
      <label className="block font-body text-[14px] font-medium" htmlFor="user-role">Rol</label>
      <select id="user-role" className={input} value={value} onChange={event => onChange(event.target.value as UserRole)}>
        {Object.entries(roleNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <p className="mb-0 mt-2 font-body text-[14px] text-[#65706d]">
        {value === "ADMIN" && "Acceso completo a la administración."}
        {value === "EDITOR" && "Edita el blog y el contenido de hospedajes; no modifica tarifas."}
        {value === "BOOKING_MANAGER" && "Gestiona reservas."}
      </p>
    </div>
  );
}

export function CreateUserForm() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("EDITOR");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!window.confirm(`¿Crear la cuenta ${data.get("email")} con el rol ${roleNames[role]}?`)) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
          role,
          currentPassword: data.get("currentPassword"),
        }),
      });
      if (!response.ok) throw new Error(apiMessage(response.status, "create"));
      form.reset();
      router.push("/admin/users?created=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el usuario.");
      setBusy(false);
    }
  }

  return (
    <PageFrame title="Crear usuario" description="Añade una cuenta para el equipo. La contraseña no se mostrará después de crearla.">
      <form method="post" action="/api/admin/users" onSubmit={submit} className="grid max-w-2xl gap-5 rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block font-body text-[14px] font-medium">Nombre
            <input className={input} name="name" maxLength={200} autoComplete="name" required />
          </label>
          <label className="block font-body text-[14px] font-medium">Correo
            <input className={input} name="email" type="email" maxLength={254} autoComplete="off" required />
          </label>
        </div>
        <RoleField value={role} onChange={setRole} />
        <div className="rounded-lg bg-[#f4f5f2] p-4">
          <label className="block font-body text-[14px] font-medium">Contraseña inicial
            <input className={input} name="password" type="password" autoComplete="new-password" minLength={8} maxLength={32} required />
          </label>
          <p className="mb-0 mt-2 font-body text-[14px] text-[#65706d]">Entre 8 y 32 caracteres. No caduca ni exige cambio inicial; entrégala por un canal privado.</p>
        </div>
        <label className="block font-body text-[14px] font-medium">Tu contraseña actual
          <input className={input} name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="m-0 font-body text-[14px] text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</button>
          <Link href="/admin/users" className={secondaryLink}>Volver a usuarios</Link>
        </div>
      </form>
    </PageFrame>
  );
}

export function EditUserForm({ user, currentUserId }: { user: DisplayUser; currentUserId: number }) {
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const own = user.id === currentUserId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const accessChanged = role !== user.role || active !== user.active;
    const warning = accessChanged ? " Cambiar el rol o estado cerrará todas sus sesiones." : "";
    if (!window.confirm(`¿Guardar los cambios de ${user.email}?${warning}`)) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          role: own ? user.role : role,
          active: own ? user.active : active,
          currentPassword: data.get("currentPassword"),
        }),
      });
      if (!response.ok) throw new Error(apiMessage(response.status));
      (form.elements.namedItem("currentPassword") as HTMLInputElement).value = "";
      setNotice("Cambios guardados.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame title="Editar usuario" description="Actualiza los datos y permisos de esta cuenta.">
      <div className="grid max-w-2xl gap-5">
        <form method="post" action={`/api/admin/users/${user.id}`} onSubmit={submit} className="grid gap-5 rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-5 sm:p-7">
          <div>
            <p className="m-0 font-body text-[14px] font-medium">Cuenta</p>
            <p className="mb-0 mt-1 font-body text-[14px] text-[#65706d]">{user.email} · el correo no se puede cambiar</p>
          </div>
          <label className="block font-body text-[14px] font-medium">Nombre
            <input className={input} name="name" defaultValue={user.name} maxLength={200} required />
          </label>
          {own ? (
            <div className="rounded-lg bg-[#f4f5f2] p-4"><p className="m-0 font-body text-[14px]">Tu cuenta conserva el rol de administrador y permanece activa para evitar perder acceso.</p><Link href="/admin/account/password" className="mt-2 inline-flex min-h-11 items-center font-body text-sm font-medium text-[#394342] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#0277bd]">Cambiar tu contraseña →</Link></div>
          ) : (
            <>
              <RoleField value={role} onChange={setRole} />
              <label className="flex min-h-11 items-center gap-3 font-body text-[14px]">
                <input type="checkbox" className="size-4 accent-[#0277bd] focus-visible:outline-2 focus-visible:outline-[#0277bd]" checked={active} onChange={event => setActive(event.target.checked)} />
                Cuenta activa
              </label>
              <p className="m-0 font-body text-[14px] text-[#65706d]">Un cambio de rol o estado cierra las sesiones de esta cuenta. No puedes desactivar al último administrador.</p>
            </>
          )}
          <label className="block font-body text-[14px] font-medium">Tu contraseña actual
            <input className={input} name="currentPassword" type="password" autoComplete="current-password" required />
          </label>
          {error && <p role="alert" className="m-0 font-body text-[14px] text-red-800">{error}</p>}
          {notice && <p role="status" className="m-0 font-body text-[14px] text-emerald-800">{notice}</p>}
          <div className="flex flex-wrap gap-3">
            <button className={button} disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
            <Link href="/admin/users" className={secondaryLink}>Volver a usuarios</Link>
          </div>
        </form>
        {!own && <ResetPassword user={user} />}
      </div>
    </PageFrame>
  );
}

function ResetPassword({ user }: { user: DisplayUser }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!window.confirm(`¿Restablecer la contraseña de ${user.email}? Se cerrarán todas sus sesiones.`)) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: data.get("newPassword"),
          confirmation: data.get("confirmation"),
          currentPassword: data.get("currentPassword"),
        }),
      });
      if (!response.ok) throw new Error(apiMessage(response.status, "reset"));
      form.reset();
      setNotice("Contraseña restablecida. Las sesiones anteriores han sido cerradas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#e8d7cd] bg-white p-5 sm:p-7">
      <p className="mb-2 font-body text-[12px] font-semibold uppercase tracking-[.14em] text-[#8a4d1e]">Acción sensible</p>
      <h2 className="m-0 font-heading text-xl font-medium">Restablecer contraseña</h2>
      <p className="mb-5 mt-2 font-body text-[14px]">Se cerrarán todas las sesiones de {user.name}. No uses esta opción para tu propia cuenta.</p>
      <form method="post" action={`/api/admin/users/${user.id}/reset-password`} onSubmit={submit} className="grid gap-4">
        <label className="block font-body text-[14px] font-medium">Nueva contraseña
          <input className={input} name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={32} required />
        </label>
        <label className="block font-body text-[14px] font-medium">Confirmar contraseña nueva
          <input className={input} name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={32} required />
        </label>
        <label className="block font-body text-[14px] font-medium">Tu contraseña actual
          <input className={input} name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="m-0 font-body text-[14px] text-red-800">{error}</p>}
        {notice && <p role="status" className="m-0 font-body text-[14px] text-emerald-800">{notice}</p>}
        <button className={button} disabled={busy}>{busy ? "Restableciendo…" : "Restablecer contraseña"}</button>
      </form>
    </section>
  );
}
