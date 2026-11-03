"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#394342]";

export default function PasswordForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    if (data.get("newPassword") !== data.get("confirmation")) { setError("Las contraseñas nuevas no coinciden."); return; }
    if (new TextEncoder().encode(String(data.get("newPassword"))).length > 72) { setError("La contraseña nueva no puede superar 72 bytes UTF-8."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/account/password", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword"), confirmation: data.get("confirmation") }) });
      if (!response.ok) {
        const message = response.status === 401 ? "La sesión no es válida o la contraseña actual es incorrecta." : response.status === 403 ? "No tienes permiso para cambiar esta contraseña." : response.status === 429 ? "Demasiados intentos. Espera antes de volver a intentarlo." : response.status === 503 ? "El servicio no está disponible. Inténtalo más tarde." : "No se pudo cambiar la contraseña. Revisa los datos e inténtalo de nuevo.";
        throw new Error(message);
      }
      form.reset(); setSuccess(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cambiar la contraseña."); }
    finally { setBusy(false); }
  }

  return <main lang="es" className="min-h-screen bg-[#f4f5f2] px-4 py-10 sm:px-8"><div className="mx-auto max-w-2xl"><p className="mb-2 text-xs uppercase tracking-[.18em]">Panel de administración</p><h1 className="text-4xl">Cambiar contraseña</h1><p className="mt-3">Al cambiarla se cerrarán todas tus sesiones. Tendrás que iniciar sesión nuevamente.</p>
    {success ? <p role="status" className="rounded-xl bg-white p-6">Contraseña actualizada. <Link href="/admin/login">Inicia sesión de nuevo</Link>.</p> : <form method="post" action="/api/admin/account/password" onSubmit={submit} className="grid gap-4 rounded-xl bg-white p-6 shadow-sm">
      {error && <p id="password-error" role="alert" className="m-0 text-red-800">{error}</p>}
      <label htmlFor="current-password" className="text-sm font-medium">Contraseña actual<input className={input} id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <label htmlFor="new-password" className="text-sm font-medium">Nueva contraseña<input className={input} id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={32} aria-describedby={error ? "password-error" : undefined} required /></label>
      <label htmlFor="confirm-password" className="text-sm font-medium">Confirmar contraseña nueva<input className={input} id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={32} aria-describedby={error ? "password-error" : undefined} required /></label>
      <p className="m-0 text-sm">Entre 8 y 32 caracteres; máximo 72 bytes UTF-8.</p><button disabled={busy} className="justify-self-start rounded-full bg-[#394342] px-5 py-2 text-base text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#394342]">Cambiar contraseña</button>
    </form>}</div></main>;
}
