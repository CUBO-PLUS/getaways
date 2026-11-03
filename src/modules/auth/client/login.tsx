"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "No se pudo iniciar sesión."); }
      router.replace("/admin"); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo iniciar sesión."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f4f5f2] p-6 flex items-center justify-center"><form method="post" action="/api/admin/login" onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm"><p className="text-xs uppercase tracking-[.22em] text-[#6c776c]">Administración</p><h1 className="mt-4 text-3xl">Iniciar sesión</h1><label className="mt-8 block text-sm" htmlFor="email">Correo electrónico</label><input className="mt-2 w-full rounded border p-3" id="email" name="email" type="email" autoComplete="username" maxLength={254} required/><label className="mt-4 block text-sm" htmlFor="password">Contraseña</label><input className="mt-2 w-full rounded border p-3" id="password" name="password" type="password" autoComplete="current-password" required/><button className="mt-5 w-full rounded bg-[#394342] p-3 text-white disabled:opacity-50" disabled={busy}>{busy ? "Verificando…" : "Iniciar sesión"}</button>{error && <p role="alert" className="mt-3 text-red-800">{error}</p>}</form></main>;
}
