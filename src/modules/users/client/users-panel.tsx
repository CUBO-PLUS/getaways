"use client";

import { useEffect, useState, type FormEvent } from "react";

type Role = "ADMIN" | "EDITOR" | "BOOKING_MANAGER";
type User = { id: number; name: string; email: string; role: Role; active: boolean };
const roles: Record<Role, string> = { ADMIN: "Administrador", EDITOR: "Editor", BOOKING_MANAGER: "Gestor de reservas" };
const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#394342]";
const button = "rounded-full bg-[#394342] px-5 py-2 text-base text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#394342]";

function message(status: number) {
  if (status === 401) return "La sesión no es válida o la contraseña actual es incorrecta.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status === 409) return "No se pudo completar: existe un conflicto o debe permanecer un administrador activo.";
  if (status === 429) return "Demasiados intentos. Espera antes de volver a intentarlo.";
  if (status === 503) return "El servicio no está disponible. Inténtalo más tarde.";
  return "No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.";
}

async function request(url: string, method: string, body?: object) {
  const response = await fetch(url, { method, cache: "no-store", ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(message(response.status));
  return response;
}

function PasswordInput({ id, label = "Tu contraseña actual" }: { id: string; label?: string }) {
  return <label htmlFor={id} className="block text-sm font-medium">{label}<input id={id} name="currentPassword" type="password" autoComplete="current-password" required className={input} /></label>;
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (value: Role) => void }) {
  return <select className={input} value={value} onChange={event => onChange(event.target.value as Role)}>{Object.entries(roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}

export default function UsersPanel({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>("EDITOR");
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  async function load() {
    const response = await request("/api/admin/users", "GET");
    setUsers(await response.json() as User[]);
  }
  useEffect(() => { let active = true; request("/api/admin/users", "GET").then(r => r.json()).then(data => { if (active) setUsers(data as User[]); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);

  async function submit(event: FormEvent<HTMLFormElement>, url: string, method: string, body: object, confirmation: string) {
    event.preventDefault();
    if (!window.confirm(confirmation)) return;
    const form = event.currentTarget;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(url, method, body);
      form.reset(); setEditing(null); setResetting(null);
      setNotice("Cambios guardados.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la solicitud."); }
    finally { setBusy(false); }
  }

  return <main lang="es" className="min-h-screen bg-[#f4f5f2] px-4 py-10 text-[#394342] sm:px-8">
    <div className="mx-auto max-w-5xl">
      <header><p className="mb-2 text-xs uppercase tracking-[.18em]">Panel de administración</p><h1 className="text-4xl">Usuarios</h1><p className="mt-3">Administra el acceso del equipo. El correo no se puede modificar.</p></header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-white p-3">{notice}</p>}
      <section className="mt-8 rounded-xl bg-white p-6 shadow-sm" aria-labelledby="users-heading">
        <h2 id="users-heading" className="m-0 text-2xl">Equipo</h2>
        {!users && !error && <p className="mt-4">Cargando usuarios…</p>}
        {users?.length === 0 && <p className="mt-4">No hay usuarios para mostrar.</p>}
        <ul className="m-0 list-none divide-y divide-gray-200 p-0">{users?.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><p className="m-0 font-medium">{user.name} {user.id === currentUserId && "(tu cuenta)"}</p><p className="m-0 text-sm">{user.email} · {roles[user.role]} · {user.active ? "Activa" : "Inactiva"}</p></div>
          <div className="flex gap-3"><button type="button" onClick={() => { setEditing(user); setResetting(null); }} className="rounded border px-4 py-2 text-sm">Editar</button>{user.id !== currentUserId && <button type="button" onClick={() => { setResetting(user); setEditing(null); }} className="rounded border px-4 py-2 text-sm">Restablecer contraseña</button>}</div>
        </li>)}</ul>
      </section>
      {editing && <EditUser key={editing.id} user={editing} currentUserId={currentUserId} busy={busy} onCancel={() => setEditing(null)} onSubmit={submit} />}
      {resetting && <section className="mt-6 rounded-xl bg-white p-6"><h2 className="m-0 text-2xl">Restablecer contraseña</h2><p>Cuenta: {resetting.name} ({resetting.email}). Se cerrarán todas sus sesiones.</p><form method="post" action={`/api/admin/users/${resetting.id}/reset-password`} className="grid max-w-lg gap-4" onSubmit={e => { const data = new FormData(e.currentTarget); void submit(e, `/api/admin/users/${resetting.id}/reset-password`, "POST", { currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword"), confirmation: data.get("confirmation") }, `¿Restablecer la contraseña de ${resetting.email}? Se cerrarán todas sus sesiones.`); }}><label htmlFor="reset-new" className="text-sm font-medium">Nueva contraseña<input id="reset-new" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={32} required className={input} /></label><label htmlFor="reset-confirm" className="text-sm font-medium">Confirmar contraseña nueva<input id="reset-confirm" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={32} required className={input} /></label><PasswordInput id="reset-current" /><div className="flex gap-3"><button disabled={busy} className={button}>Restablecer</button><button type="button" onClick={() => setResetting(null)} className="rounded border px-4">Cancelar</button></div></form></section>}
      <section className="mt-6 rounded-xl bg-white p-6" aria-labelledby="create-heading"><h2 id="create-heading" className="m-0 text-2xl">Crear usuario</h2><p>Entrega la contraseña por un canal privado. No caduca ni exige cambio inicial.</p>
        <form method="post" action="/api/admin/users" className="grid max-w-lg gap-4" onSubmit={e => { const data = new FormData(e.currentTarget); void submit(e, "/api/admin/users", "POST", { name: data.get("name"), email: data.get("email"), password: data.get("password"), role, currentPassword: data.get("currentPassword") }, `¿Crear la cuenta ${data.get("email")} con el rol ${roles[role]}?`); }}>
          <label htmlFor="new-name" className="text-sm font-medium">Nombre<input id="new-name" name="name" required className={input} /></label>
          <label htmlFor="new-email" className="text-sm font-medium">Correo<input id="new-email" name="email" type="email" autoComplete="off" required className={input} /></label>
          <label className="text-sm font-medium">Rol<RoleSelect value={role} onChange={setRole} /></label>
          <label htmlFor="new-password" className="text-sm font-medium">Contraseña<input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={32} required className={input} /></label>
          <PasswordInput id="create-current" /><button disabled={busy} className={`${button} justify-self-start`}>Crear usuario</button>
        </form>
      </section>
    </div>
  </main>;
}

function EditUser({ user, currentUserId, busy, onCancel, onSubmit }: { user: User; currentUserId: number; busy: boolean; onCancel: () => void; onSubmit: (e: FormEvent<HTMLFormElement>, url: string, method: string, body: object, confirmation: string) => Promise<void> }) {
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  return <section className="mt-6 rounded-xl bg-white p-6"><h2 className="m-0 text-2xl">Editar usuario</h2><p>Cuenta: {user.email}. Cambiar el rol o estado cerrará todas sus sesiones.</p>
    <form method="post" action={`/api/admin/users/${user.id}`} className="grid max-w-lg gap-4" onSubmit={e => { const data = new FormData(e.currentTarget); void onSubmit(e, `/api/admin/users/${user.id}`, "PATCH", { name: data.get("name"), role, active, currentPassword: data.get("currentPassword") }, `¿Guardar los cambios de ${user.email}? Cambiar el rol o estado cerrará sus sesiones.`); }}>
      <label htmlFor="edit-name" className="text-sm font-medium">Nombre<input id="edit-name" name="name" defaultValue={user.name} required className={input} /></label>
      {user.id !== currentUserId && <><label className="text-sm font-medium">Rol<RoleSelect value={role} onChange={setRole} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Cuenta activa</label></>}
      <PasswordInput id="edit-current" /><div className="flex gap-3"><button disabled={busy} className={button}>Guardar cambios</button><button type="button" onClick={onCancel} className="rounded border px-4">Cancelar</button></div>
    </form>
  </section>;
}
