export default function CategoryLoading() {
  return <main lang="es" aria-busy="true" className="mx-auto max-w-6xl px-4 py-8 font-body text-[14px] text-[#394342] sm:px-6 lg:px-10 lg:py-10">
    <p role="status" className="mb-3 text-[13px] text-[#687371]">Cargando categorías…</p>
    <div className="h-10 w-64 animate-pulse rounded-lg bg-[#f0f2ef]" />
    <div className="mt-8 h-64 animate-pulse rounded-2xl border border-[rgba(7,36,86,.075)] bg-white" />
  </main>;
}
