/* eslint-disable @next/next/no-img-element -- Private media requires the editor session. */
import { EditorFloatingPanel } from "../../editor-floating-panel";
import type { useEditorTools } from "../hooks/use-editor-tools";
import { control, input, type Panel } from "../shared";

type Props = {
  panel: Exclude<Panel, null>;
  tools: ReturnType<typeof useEditorTools>;
  error: string;
};

const panelTitles: Record<Exclude<Panel, null>, string> = {
  images: "Revisar imágenes del artículo",
  image: "Editar imagen del artículo",
  insert: "Insertar imagen",
  link: "Editar enlace",
};

export function EditorPanels({ panel, tools, error }: Props) {
  const {
    setPanel,
    returnFocusRef,
    editor,
    editorState,
    imageTarget,
    openImage,
    updateImage,
    removeImage,
    insertImage,
    imageChoice,
    setImageChoice,
    imageFile,
    setImageFile,
    imageAlt,
    setImageAlt,
    imageCaption,
    setImageCaption,
    uploading,
    applyLink,
    linkUrl,
    setLinkUrl,
    removeLink,
  } = tools;
  const imageNumber = editorState?.images.findIndex(image => image.pos === imageTarget?.pos) ?? -1;

  return (
    <EditorFloatingPanel key={panel} title={panelTitles[panel]} onClose={() => setPanel(null)} returnFocusRef={returnFocusRef}>
      <div className="space-y-4 text-sm text-slate-700 [&_p]:mb-2 [&_p]:text-sm [&_p]:leading-6 [&_input]:focus-visible:outline-[#0277bd]">
        {error && <p className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>}

        {panel === "images" && (
          <>
            <p>Revisa cada imagen según su contexto. «Decorativa» es una decisión editorial, no un error. Las imágenes importadas sin descripción pueden estar marcadas así.</p>
            {editorState?.images.length ? editorState.images.map((image, index) => (
              <button
                key={image.pos}
                type="button"
                className={`${control} flex w-full items-center gap-3 text-left`}
                onClick={() => {
                  openImage(image.pos);
                  requestAnimationFrame(() => {
                    const element = editor?.view.nodeDOM(image.pos);
                    if (element instanceof HTMLElement) element.scrollIntoView({ block: "center", behavior: "instant" });
                  });
                }}
              >
                <img src={`/api/blog/media/${image.attrs.mediaId}`} alt="" className="h-14 w-20 rounded object-cover" />
                <span>
                  <strong className="block">Imagen {index + 1} · {image.attrs.decorative ? "Decorativa" : "Informativa"}</strong>
                  <span className="text-xs">{image.attrs.alt || image.attrs.caption || "Sin texto alternativo; revisa si aporta información."}</span>
                </span>
              </button>
            )) : <p>Este artículo todavía no tiene imágenes en el contenido.</p>}
          </>
        )}

        {panel === "image" && imageTarget && (
          <>
            <p className="font-medium">Imagen {imageNumber + 1} del artículo · archivo #{imageTarget.attrs.mediaId}</p>
            <img src={`/api/blog/media/${imageTarget.attrs.mediaId}`} alt="Vista previa de la imagen que estás editando" className="max-h-36 w-full rounded-lg object-contain" />
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">¿Qué aporta esta imagen?</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="existing-image-purpose"
                  checked={!imageTarget.attrs.decorative}
                  onChange={() => updateImage({ decorative: false })}
                />
                Información: necesita una descripción
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="existing-image-purpose"
                  checked={imageTarget.attrs.decorative}
                  onChange={() => updateImage({ decorative: true, alt: "" })}
                />
                Solo ambientación: imagen decorativa
              </label>
            </fieldset>
            <p className="text-slate-500">Informativa: un gráfico con resultados. Decorativa: una textura que no añade información. Decide según este artículo.</p>
            {!imageTarget.attrs.decorative && (
              <label className="block">
                Texto alternativo (obligatorio)
                <textarea
                  rows={3}
                  className={input}
                  required
                  aria-invalid={!imageTarget.attrs.alt?.trim()}
                  value={imageTarget.attrs.alt ?? ""}
                  onChange={event => updateImage({ alt: event.target.value })}
                />
                <span className="text-xs text-slate-500">Describe la información que no se entendería sin ver la imagen.</span>
              </label>
            )}
            {!imageTarget.attrs.decorative && !imageTarget.attrs.alt?.trim() && (
              <p className="text-amber-800">Añade una descripción para poder guardar y publicar.</p>
            )}
            <label className="block">
              Pie de foto (opcional)
              <input
                className={input}
                value={imageTarget.attrs.caption ?? ""}
                onChange={event => updateImage({ caption: event.target.value || null })}
              />
              <span className="text-xs text-slate-500">Aparece bajo la imagen. No sustituye al texto alternativo.</span>
            </label>
            <p className="text-slate-500">Se guarda en el borrador. La web no cambia hasta actualizar la publicación.</p>
            <button type="button" className={`${control} text-red-800`} onClick={removeImage}>
              Quitar esta imagen del artículo
            </button>
          </>
        )}

        {panel === "insert" && (
          <form onSubmit={insertImage} className="space-y-4">
            <fieldset className="space-y-3">
              <legend className="mb-2 font-medium">¿Qué función cumple la imagen? (obligatorio)</legend>
              <label className="flex gap-2">
                <input
                  type="radio"
                  name="image-choice"
                  required
                  checked={imageChoice === "informative"}
                  onChange={() => setImageChoice("informative")}
                />
                Informativa: describe lo que aporta
              </label>
              <label className="flex gap-2">
                <input
                  type="radio"
                  name="image-choice"
                  required
                  checked={imageChoice === "decorative"}
                  onChange={() => setImageChoice("decorative")}
                />
                Decorativa: solo aporta ambientación
              </label>
            </fieldset>
            <p className="text-slate-500">Un gráfico con resultados es informativo; una textura de fondo puede ser decorativa.</p>
            {imageChoice === "informative" && (
              <label className="block">
                Texto alternativo (obligatorio)
                <textarea required className={input} value={imageAlt} onChange={event => setImageAlt(event.target.value)} />
              </label>
            )}
            <label className="block">
              Pie de foto (opcional)
              <input className={input} value={imageCaption} onChange={event => setImageCaption(event.target.value)} />
              <span className="text-xs text-slate-500">No sustituye a la descripción de la imagen.</span>
            </label>
            <label className="block">
              Archivo JPEG, PNG o WebP (hasta 10 MB)
              <input
                required
                className="mt-2 block w-full"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={event => setImageFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="submit"
              disabled={uploading || !imageChoice || !imageFile || imageChoice === "informative" && !imageAlt.trim()}
              className={control}
            >
              {uploading ? "Subiendo imagen…" : "Subir e insertar imagen"}
            </button>
          </form>
        )}

        {panel === "link" && (
          <form onSubmit={applyLink} className="space-y-4">
            <p>Selecciona el texto que quieres enlazar antes de abrir esta ventana.</p>
            <label className="block">
              Dirección del enlace
              <input required className={input} placeholder="https://ejemplo.com" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} />
            </label>
            <div className="flex gap-2">
              <button type="submit" className={control}>Aplicar enlace</button>
              <button type="button" className={control} onClick={removeLink}>Quitar enlace</button>
            </div>
          </form>
        )}
      </div>
    </EditorFloatingPanel>
  );
}
