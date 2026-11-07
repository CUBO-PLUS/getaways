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
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <label>
        Título
        <input required maxLength={200} value={title} className="block w-full border p-2"
          onChange={(event) => { setTitle(event.target.value); if (!slugEdited) setSlug(suggestSlug(event.target.value)); }} />
      </label>
      <label>
        Slug (dirección pública)
        <input required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} className="block w-full border p-2 font-mono"
          onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} />
        <span className="block text-sm">Se publicará como /listing/{slug || "…"}. No se puede cambiar después.</span>
      </label>
      <p className="text-sm">El hospedaje se crea inactivo. Podrás ponerlo a la venta cuando tenga descripción, portada, precio por noche y capacidad.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="justify-self-start border px-4 py-2">{busy ? "Creando…" : "Crear hospedaje"}</button>
    </form>
  );
}
