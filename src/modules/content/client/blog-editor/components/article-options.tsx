/* eslint-disable @next/next/no-img-element -- Private media requires the editor session. */
import { useState } from "react";
import { cn } from "@/shared/ui/utils";
import { control, input, type Category, type Draft } from "../shared";

const articleTabs = [
  ["details", "Resumen y dirección"],
  ["categories", "Categorías"],
  ["cover", "Portada"],
  ["seo", "Buscadores (SEO)"],
] as const;

type ArticleTab = typeof articleTabs[number][0];

type Props = {
  draft: Draft;
  categories: Category[];
  uploading: boolean;
  field: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  upload: (file: File, cover?: boolean) => Promise<void>;
};

export function ArticleOptions({ draft, categories, uploading, field, upload }: Props) {
  const [articleTab, setArticleTab] = useState<ArticleTab>("details");
  return (
    <section aria-labelledby="article-options-title" className="mx-auto my-6 max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h2 id="article-options-title" className="m-0 text-lg">Opciones del artículo</h2>
      <div role="tablist" aria-label="Opciones del artículo" className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 pb-3">
        {articleTabs.map(([name, label], index) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`article-tab-${name}`}
            aria-controls={`article-panel-${name}`}
            aria-selected={articleTab === name}
            tabIndex={articleTab === name ? 0 : -1}
            className={cn(control, "border-transparent", articleTab === name && "border-slate-300 bg-slate-100 text-slate-950")}
            onClick={() => setArticleTab(name)}
            onKeyDown={event => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? articleTabs.length - 1
                  : (index + offset + articleTabs.length) % articleTabs.length;
              setArticleTab(articleTabs[next][0]);
              document.getElementById(`article-tab-${articleTabs[next][0]}`)?.focus();
            }}
          >
            {label}{name === "categories" ? ` (${draft.categories.length})` : ""}
          </button>
        ))}
      </div>
      <div className="mt-5 text-sm text-slate-700 [&_p]:mb-2 [&_p]:text-xs [&_p]:leading-5">
        <div role="tabpanel" id="article-panel-details" aria-labelledby="article-tab-details" hidden={articleTab !== "details"} tabIndex={0}>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="block" htmlFor="excerpt">
              Resumen del artículo
              <textarea
                id="excerpt"
                rows={4}
                maxLength={1000}
                className={input}
                value={draft.excerpt}
                onChange={event => field("excerpt", event.target.value)}
              />
              <span className="text-xs text-slate-500">Una introducción breve que aparece en los listados.</span>
            </label>
            <div>
              <label className="block" htmlFor="slug">
                Dirección del artículo (slug)
                <input
                  id="slug"
                  className={input}
                  value={draft.slug}
                  disabled={Boolean(draft.firstPublishedAt)}
                  aria-describedby="slug-help"
                  onChange={event => field("slug", event.target.value)}
                />
              </label>
              <p id="slug-help" className="mt-2 text-slate-500">
                {draft.firstPublishedAt
                  ? "La dirección quedó bloqueada tras la primera publicación, incluso si retiras el artículo."
                  : "Usa minúsculas, números y guiones. La dirección queda bloqueada al publicar por primera vez."}
              </p>
            </div>
          </div>
        </div>

        <div role="tabpanel" id="article-panel-categories" aria-labelledby="article-tab-categories" hidden={articleTab !== "categories"} tabIndex={0}>
          <fieldset>
            <legend className="mb-3 font-medium">Categorías del artículo</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.length ? categories.map(category => (
                <label key={category.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    checked={draft.categories.some(item => item.categoryId === category.id)}
                    onChange={event => field("categories", event.target.checked
                      ? [...draft.categories, { categoryId: category.id }]
                      : draft.categories.filter(item => item.categoryId !== category.id))}
                  />
                  {category.name}
                </label>
              )) : <p>No hay categorías disponibles.</p>}
            </div>
          </fieldset>
        </div>

        <div role="tabpanel" id="article-panel-cover" aria-labelledby="article-tab-cover" hidden={articleTab !== "cover"} tabIndex={0}>
          <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              {draft.coverMediaId !== null ? (
                <img
                  className="max-h-48 w-full rounded-lg object-contain"
                  src={`/api/blog/media/${draft.coverMediaId}`}
                  alt="Vista previa de la imagen de portada"
                />
              ) : <p>Añade una imagen para representar el artículo en los listados.</p>}
            </div>
            <div className="space-y-4">
              {draft.coverMediaId !== null && (
                <>
                  <label className="block" htmlFor="cover-alt">
                    Texto alternativo de la portada (obligatorio)
                    <textarea
                      id="cover-alt"
                      rows={3}
                      className={input}
                      required
                      aria-invalid={!draft.coverAlt?.trim()}
                      value={draft.coverAlt ?? ""}
                      onChange={event => field("coverAlt", event.target.value || null)}
                    />
                  </label>
                  {!draft.coverAlt?.trim() && <p className="text-amber-800">Describe la portada antes de publicar.</p>}
                  <button
                    type="button"
                    className={control}
                    onClick={() => {
                      field("coverMediaId", null);
                      field("coverAlt", null);
                    }}
                  >
                    Quitar portada del artículo
                  </button>
                </>
              )}
              <label className="block">
                {draft.coverMediaId ? "Cambiar archivo de portada" : "Subir imagen de portada"}
                <input
                  className="mt-2 block w-full text-xs"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, true);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="text-slate-500">JPEG, PNG o WebP. Máximo 10 MB y 40 millones de píxeles. Describe lo que aporta la imagen.</p>
              {uploading && <p role="status">Subiendo imagen…</p>}
            </div>
          </div>
        </div>

        <div role="tabpanel" id="article-panel-seo" aria-labelledby="article-tab-seo" hidden={articleTab !== "seo"} tabIndex={0}>
          <p className="text-slate-500">Opcional. Si dejas estos campos vacíos se usan el título y el resumen del artículo.</p>
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <label className="block">
              Título en buscadores
              <input className={input} value={draft.seoTitle ?? ""} onChange={event => field("seoTitle", event.target.value || null)} />
            </label>
            <label className="block">
              Descripción en buscadores
              <textarea rows={4} className={input} value={draft.seoDescription ?? ""} onChange={event => field("seoDescription", event.target.value || null)} />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
