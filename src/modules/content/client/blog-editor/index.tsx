"use client";

import { EditorContent } from "@tiptap/react";
import Link from "next/link";
import { Eye, ArrowUp, ArrowLeft } from "lucide-react";
import { cn } from "@/shared/ui/utils";
import { control } from "./shared";
import { ArticleOptions } from "./components/article-options";
import { EditorToolbar } from "./components/editor-toolbar";
import { EditorPanels } from "./components/editor-panels";
import { useBlogEditor } from "./hooks/use-blog-editor";

export default function BlogEditor({ id, canPublish = false }: { id: string; canPublish?: boolean }) {
  const { persistence, tools, showPreview } = useBlogEditor(id);
  const {
    draft,
    categories,
    status,
    error,
    dirty,
    saving,
    conflict,
    actionBusy,
    publicationUnknown,
    accessLost,
    field,
    save,
    reconcile,
    action,
    leaveEditor,
  } = persistence;
  const { uploading, panel, preview, previewHeadingRef, previewTriggerRef, editor } = tools;

  if (!draft) {
    return (
      <main className="p-8">
        <p role="status">{status}</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  }

  const disabledAction = dirty || saving || actionBusy || conflict || publicationUnknown || uploading || accessLost;
  const publicationLabel = publicationUnknown
    ? "Publicación por confirmar"
    : !draft.publication
      ? "Borrador · no publicado"
      : dirty
        ? "Publicado · cambios locales sin publicar"
        : draft.hasUnpublishedChanges === false
          ? "Publicado · versión guardada al día"
          : "Publicado · cambios guardados sin publicar";

  return (
    <main
      data-blog-editor
      id="blog-editor-top"
      tabIndex={-1}
      className="min-h-screen bg-[#f4f5f2] px-3 py-6 text-slate-800 outline-none md:px-8 md:py-10 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-[#0277bd]"
    >
      <div hidden={preview}>
        <header className="mx-auto max-w-5xl">
          <Link href="/admin/blog" className="text-sm" onClick={leaveEditor}>
            ← Volver a artículos
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl">Editor del artículo</h1>
              <p className="mb-0 mt-2 text-sm text-slate-600">
                Escribe aquí. Guarda el borrador y publica cuando esté listo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={control}
                disabled={!dirty || saving || conflict || actionBusy || accessLost}
                onClick={() => void save()}
              >
                Guardar ahora
              </button>
              <button
                type="button"
                ref={previewTriggerRef}
                className={control}
                disabled={dirty || saving || conflict || uploading}
                onClick={showPreview}
              >
                <Eye size={16} aria-hidden="true" /> Vista previa
              </button>
              {canPublish && <button
                type="button"
                className={cn(control, "border-[#394342] bg-[#394342] text-white hover:bg-[#293332]")}
                disabled={disabledAction}
                onClick={() => void action("publish")}
              >
                {actionBusy ? "Procesando…" : draft.publication ? "Actualizar publicación" : "Publicar artículo"}
              </button>}
            </div>
          </div>
          <div
            className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              draft.publication ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-600",
            )}>
              {publicationLabel}
            </span>
            <span role="status">{status}</span>
            <span className="text-xs text-slate-500">
              Autoguardado del borrador · no publica automáticamente
            </span>
          </div>
          {canPublish && draft.publication && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="p-2 text-sm text-red-800 underline disabled:opacity-40"
                disabled={disabledAction}
                onClick={() => void action("unpublish")}
              >
                Retirar del sitio público…
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </div>
          )}
          {publicationUnknown && (
            <button type="button" className={`${control} mt-2`} disabled={actionBusy} onClick={() => void reconcile()}>
              Comprobar publicación
            </button>
          )}
          {conflict && (
            <button
              type="button"
              className="mt-3 text-sm underline"
              onClick={() => {
                if (window.confirm("¿Descartar los cambios locales y cargar la versión del servidor? Copia primero lo que quieras conservar.")) {
                  location.reload();
                }
              }}
            >
              Descartar cambios locales y recargar…
            </button>
          )}
        </header>

        <ArticleOptions
          draft={draft}
          categories={categories}
          uploading={uploading}
          field={field}
          upload={tools.upload}
        />

        <section aria-label="Escritura del artículo" className="mx-auto max-w-5xl overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 pt-7 md:px-14 md:pt-10">
            <label htmlFor="title" className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Título del artículo
            </label>
            <input
              id="title"
              placeholder="Escribe el título de tu artículo"
              maxLength={300}
              className="mt-2 w-full rounded-lg border-0 bg-transparent py-3 font-heading text-3xl leading-tight text-slate-800 outline-none placeholder:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#0277bd] md:text-4xl"
              value={draft.title}
              onChange={event => field("title", event.target.value)}
            />
          </div>
          <EditorToolbar
            editor={editor}
            editorState={tools.editorState}
            panel={panel}
            uploading={uploading}
            startInsert={tools.startInsert}
            openPanel={tools.openPanel}
            openLink={tools.openLink}
          />
          <div className="px-4 pb-8 md:px-12">
            <p id="editor-image-help" className="mb-1 mt-3 text-xs leading-5 text-slate-500">
              Haz clic en una imagen para editarla. También puedes usar «Revisar imágenes». Mueve la ventana para ver el contenido de detrás.
            </p>
            <EditorContent editor={editor} />
          </div>
        </section>
        <footer className="fixed bottom-4 right-4 z-20">
          <a href="#blog-editor-top" className={`${control} inline-flex items-center gap-2 shadow-md`}>
            <ArrowUp size={16} aria-hidden="true" /> Volver arriba
          </a>
        </footer>
      </div>

      {preview && (
        <section aria-labelledby="preview-title" className="mx-auto max-w-6xl">
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f4f5f2] py-4">
            <div>
              <h1 ref={previewHeadingRef} tabIndex={-1} id="preview-title" className="text-2xl outline-none">
                Vista previa del artículo
              </h1>
              <p className="mb-0 mt-1 text-sm text-slate-600">
                Borrador guardado · vista protegida, no es la publicación pública.
              </p>
            </div>
            <button type="button" className={control} onClick={tools.returnToEditor}>
              <ArrowLeft size={16} aria-hidden="true" /> Volver a editar
            </button>
          </header>
          <iframe
            title={`Vista previa del artículo: ${draft.title || "Sin título"}`}
            src={`/admin/blog/${id}/preview`}
            className="mt-4 h-[calc(100dvh-12rem)] min-h-96 w-full rounded-xl border border-slate-200 bg-white"
            referrerPolicy="same-origin"
          />
        </section>
      )}

      {!preview && panel && <EditorPanels key={panel} panel={panel} tools={tools} error={error} />}
    </main>
  );
}
