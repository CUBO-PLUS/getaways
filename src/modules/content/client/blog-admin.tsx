"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search, SlidersHorizontal } from "lucide-react";

type Post = { id: number; title: string; slug: string; publication: boolean; visits: number | null };

export default function BlogAdmin({ posts }: { posts: Post[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState({ query: "", status: "" });
  const [creating, setCreating] = useState(false);
  const filtered = posts.filter((post) => `${post.title} ${post.slug}`.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase()) && (!filters.status || (filters.status === "published") === post.publication));

  async function create() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/blog/admin/posts", { method: "POST" });
      if (!response.ok) throw new Error();
      const post = await response.json();
      router.push(`/admin/blog/${post.id}`);
    } catch {
      setError("No se pudo crear el borrador.");
      setCreating(false);
    }
  }

  const badge = (post: Post) => <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${post.publication ? "bg-[#eaf3eb] text-[#356b40]" : "bg-[#fff4df] text-[#795a1d]"}`}>{post.publication ? "Publicado" : "Borrador"}</span>;
  const visits = (post: Post) => post.visits === null ? "No disponible" : post.visits.toLocaleString("es-SV");

  return <main lang="es" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><p className="mb-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#687371]">Administración · Contenido</p><h1 className="m-0 font-heading text-[32px] font-medium leading-tight text-[#394342] sm:text-[36px]">Artículos</h1><p className="mb-0 mt-2 max-w-xl text-[14px] leading-6 text-[#596260]">Consulta los artículos, su estado y las visitas de los últimos 30 días.</p></div>
      <button type="button" onClick={create} disabled={creating} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white transition hover:bg-[#2f3938] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]"><Plus size={17} aria-hidden="true" />{creating ? "Creando…" : "Nuevo artículo"}</button>
    </header>
    <form onSubmit={(event) => { event.preventDefault(); setFilters({ query, status }); }} className="mb-6 grid gap-4 rounded-2xl border border-[rgba(7,36,86,.075)] bg-white p-4 shadow-[0_5px_30px_rgba(7,36,86,.045)] sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end sm:p-5">
      <label className="grid gap-2 font-body text-[14px] font-medium text-[#394342]"><span className="flex items-center gap-2"><Search size={15} aria-hidden="true" />Buscar artículo</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Título o slug" className="min-h-11 w-full rounded-lg border border-[rgba(7,36,86,.16)] bg-white px-3 font-body text-[14px] text-[#394342] placeholder:text-[#818987] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0277bd]" /></label>
      <label className="grid gap-2 font-body text-[14px] font-medium text-[#394342]"><span className="flex items-center gap-2"><SlidersHorizontal size={15} aria-hidden="true" />Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 w-full rounded-lg border border-[rgba(7,36,86,.16)] bg-white px-3 font-body text-[14px] text-[#394342] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0277bd]"><option value="">Todos</option><option value="published">Publicados</option><option value="draft">Borradores</option></select></label>
      <button className="min-h-11 rounded-full border border-[rgba(7,36,86,.16)] px-5 font-body text-[14px] font-medium text-[#394342] hover:bg-[#f4f5f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Aplicar filtros</button>
    </form>
    {error && <p role="alert" className="mb-4 text-red-800">{error}</p>}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="m-0 text-[13px] text-[#687371]">{filtered.length} {filtered.length === 1 ? "artículo encontrado" : "artículos encontrados"}</p>{(filters.query || filters.status) && <button type="button" onClick={() => { setQuery(""); setStatus(""); setFilters({ query: "", status: "" }); }} className="min-h-11 text-sm font-medium underline underline-offset-4">Limpiar filtros</button>}</div>
    <div className="overflow-hidden rounded-2xl border border-[rgba(7,36,86,.075)] bg-white shadow-[0_5px_30px_rgba(7,36,86,.045)]">
      {filtered.length ? <><ul className="m-0 list-none divide-y divide-slate-100 p-0 sm:hidden">{filtered.map((post) => <li key={post.id} className="relative p-5"><h2 className="m-0 font-heading text-base font-medium leading-6">{post.title || "Sin título"}</h2><p className="mb-0 mt-2 break-all font-mono text-xs leading-5 text-[#737d7a]">/{post.slug}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="space-y-1">{badge(post)}<span className="block text-xs text-[#596260]">Visitas (30 días): {visits(post)}</span></div><Link href={`/admin/blog/${post.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#0277bd]">Editar<ArrowRight size={15} aria-hidden="true" /><span className="sr-only"> {post.title || "Sin título"}</span></Link></div></li>)}</ul>
      <div className="relative hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left text-[14px]"><thead className="bg-[#f8f9f7] text-[11px] uppercase tracking-[.1em] text-[#687371]"><tr className="border-b border-[rgba(7,36,86,.075)]"><th className="px-5 py-3 font-medium">Artículo</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Visitas (30 días)</th><th className="px-5 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{filtered.map((post) => <tr key={post.id} className="border-b border-[rgba(7,36,86,.075)] last:border-0 hover:bg-[#fbfcfa]"><td className="px-5 py-4"><p className="m-0 font-medium">{post.title || "Sin título"}</p><p className="mb-0 mt-1 font-mono text-[12px] text-[#737d7a]">/{post.slug}</p></td><td className="px-4 py-4">{badge(post)}</td><td className="px-4 py-4 tabular-nums text-[#596260]">{visits(post)}</td><td className="px-5 py-4 text-right"><Link href={`/admin/blog/${post.id}`} className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[14px] font-medium hover:bg-[#f0f2ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0277bd]">Editar<ArrowRight size={15} aria-hidden="true" /><span className="sr-only"> {post.title || "Sin título"}</span></Link></td></tr>)}</tbody></table></div></> : <div className="px-6 py-12 text-center"><p className="mb-1 font-heading text-[18px] font-medium">No hay artículos con estos filtros</p><p className="mb-0 text-[14px] text-[#687371]">Prueba otra búsqueda o crea un artículo nuevo.</p></div>}
    </div>
  </main>;
}
