"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { suggestSlug } from "@/modules/listings/listing-admin-fields";

export default function ListingCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { setError("Tu sesión terminó. Inicia sesión de nuevo; los datos siguen en el formulario."); return; }
      if (!response.ok || typeof result?.id !== "number") { setError(result?.error ?? "No se pudo crear el hospedaje."); return; }
      router.push(`/admin/listings/${result.id}`);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-[rgba(7,36,86,.075)] bg-white p-5 shadow-[0_5px_30px_rgba(7,36,86,.045)] sm:p-7 [&_label]:font-body [&_label]:text-[14px] [&_label]:font-medium [&_label]:text-[#394342] [&_input]:mt-2 [&_input]:block [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[rgba(7,36,86,.16)] [&_input]:bg-white [&_input]:px-3 [&_input]:font-body [&_input]:text-[14px] [&_input]:text-[#394342] [&_input]:focus-visible:outline-2 [&_input]:focus-visible:outline-offset-1 [&_input]:focus-visible:outline-[#0277bd]">
      <label>
        Título
        <input required maxLength={200} value={title} className="block w-full border p-2"
          onChange={(event) => { setTitle(event.target.value); if (!slugEdited) setSlug(suggestSlug(event.target.value)); }} />
      </label>
      <label>
        Slug (dirección pública)
        <input required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} className="block w-full border p-2 font-mono"
          onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} />
        <span className="mt-2 block font-body text-[13px] leading-5 text-[#687371]">Se publicará como <span className="font-mono text-[12px] text-[#394342]">/listing/{slug || "…"}</span>. No se puede cambiar después.</span>
      </label>
      <p className="m-0 rounded-xl bg-[#f4f5f2] p-4 font-body text-[14px] leading-6 text-[#596260]">El hospedaje se crea inactivo. Podrás ponerlo a la venta cuando tenga descripción, portada, precio por noche y capacidad.</p>
      {error && <p role="alert" className="m-0 rounded-lg bg-[#fff1f0] p-3 font-body text-[14px] text-red-700">{error}</p>}
      <button disabled={busy} className="min-h-11 justify-self-start rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white hover:bg-[#2f3938] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd] disabled:opacity-60">{busy ? "Creando…" : "Crear hospedaje"}</button>
    </form>
  );
}
