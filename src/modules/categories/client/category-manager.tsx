"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import type { CategoryKind, CategorySummary } from "@/modules/categories/category-fields";
import { slugify } from "@/shared/utils/strings";

type Props = { kind: CategoryKind; categories: CategorySummary[] };
type FormState = { id: number | null; name: string; slug: string };

const control = "min-h-11 w-full rounded-lg border border-[rgba(7,36,86,.16)] bg-white px-3 font-body text-[14px] text-[#394342] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0277bd]";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[rgba(7,36,86,.16)] px-4 font-body text-[14px] font-medium text-[#394342] hover:bg-[#f4f5f2] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]";

function responseError(response: Response, operation: "save" | "delete") {
  if (response.status === 400) return "Revisa el nombre y el formato del slug.";
  if (response.status === 401) return "Tu sesión ha caducado. Inicia sesión de nuevo.";
  if (response.status === 403) return "No tienes permiso para gestionar categorías.";
  if (response.status === 404) return "La categoría ya no existe. Actualiza la página.";
  if (response.status === 409) return operation === "delete"
    ? "No se puede eliminar: la categoría ahora tiene contenido asociado. Actualiza la lista."
    : "Ese slug ya está en uso o reservado.";
  return operation === "delete" ? "No se pudo eliminar la categoría. Inténtalo de nuevo." : "No se pudo guardar la categoría. Inténtalo de nuevo.";
}

export default function CategoryManager({ kind, categories: initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState<FormState | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const title = kind === "blog" ? "Categorías del blog" : "Categorías de hospedajes";
  const backHref = kind === "blog" ? "/admin/blog" : "/admin/listings";

  async function refresh() {
    const response = await fetch(`/api/admin/categories/${kind}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudieron actualizar las categorías.");
    const data: { categories: CategorySummary[] } = await response.json();
    setCategories(data.categories);
    setLoadError("");
  }

  function startCreate() {
    setError(""); setStatus(""); setSlugEdited(false);
    setForm({ id: null, name: "", slug: "" });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || pending) return;
    const submitted = form;
    const payload = { name: submitted.name.trim(), slug: submitted.slug };
    setError(""); setStatus(""); setPending(true);
    try {
      const response = await fetch(`/api/admin/categories/${kind}${submitted.id === null ? "" : `/${submitted.id}`}`, {
        method: submitted.id === null ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response, "save"));
      const data: { category: Pick<CategorySummary, "id" | "name" | "slug"> } = await response.json();
      setCategories(current => {
        const category: CategorySummary = {
          ...data.category,
          usageCount: current.find(item => item.id === data.category.id)?.usageCount ?? 0,
        };
        return (submitted.id === null ? [...current, category] : current.map(item => item.id === category.id ? category : item))
          .sort((a, b) => a.name.localeCompare(b.name, "es"));
      });
      setForm(null);
      setStatus(submitted.id === null ? "Categoría creada." : "Cambios guardados.");
      try { await refresh(); } catch { setLoadError("Se guardó el cambio, pero no se pudo actualizar la lista. Recarga la página."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la categoría. Inténtalo de nuevo.");
    } finally { setPending(false); }
  }

  async function remove(category: CategorySummary) {
    if (pending || category.usageCount > 0 || !window.confirm(`¿Eliminar la categoría «${category.name}»? Esta acción no se puede deshacer.`)) return;
    setPending(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/admin/categories/${kind}/${category.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "delete"));
      setCategories(current => current.filter(item => item.id !== category.id));
      if (form?.id === category.id) setForm(null);
      setStatus("Categoría eliminada.");
      try { await refresh(); } catch { setLoadError("Se eliminó la categoría, pero no se pudo actualizar la lista. Recarga la página."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo eliminar la categoría."); }
    finally { setPending(false); }
  }

  return <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><p className="mb-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#687371]">Administración · {kind === "blog" ? "Contenido" : "Catálogo"}</p><h1 className="m-0 font-heading text-[32px] font-medium leading-tight text-[#394342] sm:text-[36px]">{title}</h1><p className="mb-0 mt-2 max-w-xl text-[14px] leading-6 text-[#596260]">Organiza el contenido con nombres y URL claras. Los enlaces anteriores redirigen automáticamente si cambias un slug.</p></div>
      <Link href={backHref} className={button}><ArrowLeft size={16} aria-hidden="true" />Volver a {kind === "blog" ? "artículos" : "hospedajes"}</Link>
    </header>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="m-0 text-[13px] text-[#687371]">{categories.length} {categories.length === 1 ? "categoría" : "categorías"}</p><button type="button" onClick={startCreate} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white transition hover:bg-[#2f3938] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]"><Plus size={17} aria-hidden="true" />Nueva categoría</button></div>
    {status && <p role="status" aria-live="polite" className="mb-4 rounded-xl bg-[#eaf3eb] p-3 text-[#356b40]">{status}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {loadError && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[#795a1d]">{loadError}</p>}
    {form && <form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl border border-[rgba(7,36,86,.075)] bg-white p-4 shadow-[0_5px_30px_rgba(7,36,86,.045)] sm:p-5">
      <h2 className="m-0 font-heading text-[18px] font-medium">{form.id === null ? "Crear categoría" : "Editar categoría"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-2 font-medium">Nombre<input required disabled={pending} value={form.name} maxLength={80} onChange={event => { const name = event.target.value; setForm(current => current ? { ...current, name, slug: current.id === null && !slugEdited ? slugify(name) : current.slug } : current); }} className={`${control} disabled:cursor-not-allowed disabled:bg-[#f4f5f2] disabled:opacity-70`} /></label>
        <label className="grid min-w-0 gap-2 font-medium">Slug público<input required disabled={pending} value={form.slug} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={event => { setSlugEdited(true); setForm(current => current ? { ...current, slug: event.target.value } : current); }} className={`${control} font-mono disabled:cursor-not-allowed disabled:bg-[#f4f5f2] disabled:opacity-70`} /><span className="break-all text-[12px] font-normal text-[#687371]">/{kind === "blog" ? "category" : "listing-category"}/{form.slug || "slug"}</span></label>
      </div>
      <p className="m-0 text-[13px] leading-5 text-[#687371]">Usa entre 1 y 80 caracteres para el nombre y hasta 100 caracteres en minúsculas, números y guiones para el slug.</p>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#394342] px-5 font-medium text-white hover:bg-[#2f3938] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">{pending ? "Guardando…" : "Guardar categoría"}</button><button type="button" disabled={pending} onClick={() => { setForm(null); setError(""); }} className={button}>Cancelar</button></div>
    </form>}
    <div className="overflow-hidden rounded-2xl border border-[rgba(7,36,86,.075)] bg-white shadow-[0_5px_30px_rgba(7,36,86,.045)]">
      {categories.length ? <><ul className="m-0 list-none divide-y divide-slate-100 p-0 sm:hidden">{categories.map(category => <li key={category.id} className="p-5"><h2 className="m-0 font-heading text-base font-medium leading-6">{category.name}</h2><p className="mb-0 mt-2 break-all font-mono text-xs leading-5 text-[#737d7a]">/{kind === "blog" ? "category" : "listing-category"}/{category.slug}</p><p className="mb-0 mt-2 text-xs text-[#596260]">{category.usageCount} {category.usageCount === 1 ? "elemento asociado" : "elementos asociados"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => { setError(""); setStatus(""); setSlugEdited(true); setForm({ id: category.id, name: category.name, slug: category.slug }); }} className={button}><Pencil size={15} aria-hidden="true" />Editar<span className="sr-only"> {category.name}</span></button><button type="button" disabled={pending || category.usageCount > 0} title={category.usageCount > 0 ? "No se puede eliminar mientras tenga elementos asociados." : undefined} onClick={() => remove(category)} className={button}><Trash2 size={15} aria-hidden="true" />Eliminar<span className="sr-only"> {category.name}</span></button></div>{category.usageCount > 0 && <p className="mb-0 mt-2 text-xs text-[#687371]">No se puede eliminar porque tiene elementos asociados.</p>}</li>)}</ul>
      <div className="relative hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left font-body text-[14px]"><thead className="bg-[#f8f9f7] text-[11px] uppercase tracking-[.1em] text-[#687371]"><tr className="border-b border-[rgba(7,36,86,.075)]"><th scope="col" className="px-5 py-3 font-medium">Categoría</th><th scope="col" className="px-4 py-3 font-medium">Elementos asociados</th><th scope="col" className="px-5 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{categories.map(category => <tr key={category.id} className="border-b border-[rgba(7,36,86,.075)] last:border-0 hover:bg-[#fbfcfa]"><td className="px-5 py-4"><p className="m-0 font-medium">{category.name}</p><p className="mb-0 mt-1 break-all font-mono text-[12px] text-[#737d7a]">/{kind === "blog" ? "category" : "listing-category"}/{category.slug}</p></td><td className="px-4 py-4 tabular-nums text-[#596260]">{category.usageCount}</td><td className="px-5 py-4 text-right"><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={pending} onClick={() => { setError(""); setStatus(""); setSlugEdited(true); setForm({ id: category.id, name: category.name, slug: category.slug }); }} className={button}><Pencil size={15} aria-hidden="true" />Editar<span className="sr-only"> {category.name}</span></button><button type="button" disabled={pending || category.usageCount > 0} title={category.usageCount > 0 ? "No se puede eliminar mientras tenga elementos asociados." : undefined} onClick={() => remove(category)} className={button}><Trash2 size={15} aria-hidden="true" />Eliminar<span className="sr-only"> {category.name}</span></button></div></td></tr>)}</tbody></table></div></> : <div className="px-6 py-12 text-center"><p className="mb-1 font-heading text-[18px] font-medium">No hay categorías</p><p className="mb-5 text-[14px] text-[#687371]">Crea una categoría para organizar {kind === "blog" ? "los artículos" : "los hospedajes"}.</p><button type="button" disabled={pending} onClick={startCreate} className={button}>Crear categoría</button></div>}
    </div>
  </main>;
}
