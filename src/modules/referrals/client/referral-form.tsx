"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Referral = { code: string; active: boolean };

const input = "mt-1 w-full rounded-lg border border-[rgba(7,36,86,.18)] bg-white px-3 py-2.5 font-body text-[14px] text-[#394342] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";
const button = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";
const secondaryLink = "inline-flex min-h-11 items-center rounded-full px-4 font-body text-[14px] text-[#0277bd] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#0277bd]";

function apiMessage(status: number, editing: boolean) {
  if (status === 400) return editing ? "No se pudo guardar el estado. Recarga la página e inténtalo de nuevo." : "El código debe tener entre 4 y 24 letras, números o guiones.";
  if (status === 401) return "Tu sesión no es válida. Inicia sesión e inténtalo de nuevo.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status === 404) return "No encontramos este código de referido.";
  if (status === 409) return "Ese código ya existe. Elige otro.";
  if (status === 503) return "El servicio no está disponible. Inténtalo más tarde.";
  return `No se pudo ${editing ? "guardar" : "crear"} el código. Inténtalo de nuevo.`;
}

export function ReferralForm({ referral }: { referral?: Referral }) {
  const router = useRouter();
  const editing = Boolean(referral);
  const [active, setActive] = useState(referral?.active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") ?? "").trim().toUpperCase();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(editing ? `/api/admin/referrals/${encodeURIComponent(referral!.code)}` : "/api/admin/referrals", {
        method: editing ? "PATCH" : "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { active } : { code }),
      });
      if (!response.ok) throw new Error(apiMessage(response.status, editing));
      const saved = await response.json() as Referral;
      router.push(`/admin/referrals/${encodeURIComponent(saved.code)}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el código.");
      setBusy(false);
    }
  }

  return (
    <main lang="es" className="min-h-screen bg-[#f4f5f2] px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/referrals" className="mb-5 inline-flex min-h-11 items-center font-medium text-[#394342] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">← Volver a códigos</Link>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[.16em] text-[#0277bd]">Panel de administración · Referidos</p>
        <h1 className="m-0 font-heading text-[32px] font-medium leading-9">{editing ? "Editar código" : "Crear código de referido"}</h1>
        <p className="mb-6 mt-2">{editing ? "Administra si este código puede recibir nuevas atribuciones." : "Crea un código para identificar nuevas atribuciones."}</p>
        <form method="post" onSubmit={submit} className="grid max-w-2xl gap-5 rounded-xl border border-[rgba(7,36,86,.075)] bg-white p-5 sm:p-7">
          <label className="block font-medium" htmlFor="referral-code">Código
            <input id="referral-code" className={`${input} ${editing ? "bg-slate-50" : ""}`} name="code" defaultValue={referral?.code} readOnly={editing} minLength={4} maxLength={24} pattern={"[A-Za-z0-9\\-]{4,24}"} autoComplete="off" required aria-describedby="referral-code-help" />
          </label>
          <p id="referral-code-help" className="-mt-4 mb-0 text-[14px] text-[#65706d]">{editing ? "El código identificador es inmutable para preservar el historial de atribuciones." : "De 4 a 24 caracteres: letras ASCII, números o guiones. Se guardará en mayúsculas y quedará activo."}</p>
          {editing && <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-4 accent-[#0277bd] focus-visible:outline-2 focus-visible:outline-[#0277bd]" checked={active} onChange={event => setActive(event.target.checked)} /> Código activo</label>}
          {error && <p role="alert" className="m-0 text-[14px] text-red-800">{error}</p>}
          <div className="flex flex-wrap gap-3"><button className={button} disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear código"}</button><Link href="/admin/referrals" className={secondaryLink}>Cancelar</Link></div>
        </form>
      </div>
    </main>
  );
}
