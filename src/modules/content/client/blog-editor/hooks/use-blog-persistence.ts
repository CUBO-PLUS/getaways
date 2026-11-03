import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Editor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import type { BlogDocument } from "@/modules/content/blog-schema";
import { mergeReconciledPublication } from "@/modules/content/blog-editor-state";
import { validatePublishableBlogPost } from "@/modules/content/blog-publication-validation";
import { responseError, type Draft, type Category } from "../shared";

type Options = { id: string; editor: Editor | null; setReady: (value: boolean) => void };

export function useBlogPersistence({ id, editor, setReady }: Options) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState("Cargando artículo…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [publicationUnknown, setPublicationUnknown] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const accessLostRef = useRef(false);
  const latest = useRef<Draft | null>(null);
  const version = useRef(0);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const actionInFlight = useRef(false);
  const conflictRef = useRef(false);
  const queued = useRef(false);
  const revision = useRef(0);

  function replaceDraft(next: Draft) {
    latest.current = next;
    setDraft(next);
  }

  function markDirty() {
    revision.current++;
    dirtyRef.current = true;
    setDirty(true);
    if (!accessLostRef.current) setStatus("Cambios por guardar");
    if (timer.current) clearTimeout(timer.current);
    if (!accessLostRef.current) timer.current = setTimeout(() => void saveRef.current(), 800);
  }

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (!latest.current) return;
    replaceDraft({ ...latest.current, [key]: value });
    markDirty();
  }

  function flagConflict(message: string) {
    conflictRef.current = true;
    setConflict(true);
    setStatus("Conflicto de edición");
    setError(message);
  }

  function loseAccess() {
    accessLostRef.current = true;
    setAccessLost(true);
    queued.current = false;
    if (timer.current) clearTimeout(timer.current);
    setStatus("Acceso revocado; autoguardado detenido");
    setError("La sesión terminó o ya no tienes permiso. Tus cambios locales siguen aquí; copia el contenido antes de salir.");
  }

  function imageValidation() {
    let message = "";
    let index = 0;
    editor?.state.doc.descendants(node => {
      if (node.type.name !== "image") return;
      index++;
      if (!message && !node.attrs.decorative && !String(node.attrs.alt ?? "").trim()) {
        message = `La imagen ${index} necesita texto alternativo. Abre «Revisar imágenes» y descríbela o márcala como decorativa.`;
      }
    });
    return message;
  }

  const save = useCallback(async () => {
    if (!latest.current || !editor || !dirtyRef.current || conflictRef.current || accessLostRef.current) return;
    if (inFlight.current || actionInFlight.current) {
      queued.current = true;
      return;
    }
    const invalidImage = imageValidation();
    if (invalidImage) {
      setError(invalidImage);
      setStatus("Revisa las imágenes antes de guardar");
      return;
    }
    inFlight.current = true;
    queued.current = false;
    const started = revision.current;
    setSaving(true);
    setStatus("Guardando borrador…");
    setError("");
    const d = latest.current;
    try {
      const response = await fetch(`/api/blog/admin/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: version.current,
          slug: d.slug,
          title: d.title,
          excerpt: d.excerpt,
          document: editor.getJSON(),
          coverMediaId: d.coverMediaId,
          coverAlt: d.coverAlt,
          seoTitle: d.seoTitle,
          seoDescription: d.seoDescription,
          categoryIds: d.categories.map(category => category.categoryId),
        }),
      });
      if (response.status === 409) {
        flagConflict("Este borrador cambió en otra sesión. Tus cambios locales siguen aquí; copia el contenido antes de recargar.");
        return;
      }
      if (response.status === 401 || response.status === 403) {
        loseAccess();
        return;
      }
      if (!response.ok) {
        throw Error(await responseError(response, "No se pudo guardar. Tus cambios siguen aquí; revisa los campos y pulsa «Guardar ahora» para reintentar."));
      }
      const saved = await response.json();
      version.current = saved.version;
      if (latest.current) {
        replaceDraft({
          ...latest.current,
          version: saved.version,
          hasUnpublishedChanges: saved.hasUnpublishedChanges ?? Boolean(latest.current.publication),
        });
      }
      if (revision.current === started) {
        dirtyRef.current = false;
        setDirty(false);
        setStatus("Borrador guardado");
      } else {
        queued.current = true;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar. Tus cambios se conservan.");
      setStatus("Error al guardar");
    } finally {
      inFlight.current = false;
      setSaving(false);
      if (queued.current) {
        queued.current = false;
        void saveRef.current();
      }
    }
    // The current document and metadata are read from refs at the start of each serialized save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editor]);

  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);

  useEffect(() => {
    if (!editor) return;
    let live = true;
    (async () => {
      try {
        const [response, categoryResponse] = await Promise.all([
          fetch(`/api/blog/admin/posts/${id}`, { cache: "no-store" }),
          fetch("/api/blog/admin/categories"),
        ]);
        if (response.status === 401 || categoryResponse.status === 401) {
          router.replace("/admin/blog/login");
          return;
        }
        if (!response.ok || !categoryResponse.ok) throw Error("No se pudo abrir el artículo. Recarga para reintentar.");
        const d = await response.json() as Draft;
        const availableCategories = await categoryResponse.json() as Category[];
        if (!live) return;
        setReady(false);
        editor.chain().setMeta("addToHistory", false).setContent(d.document, { emitUpdate: false }).run();
        version.current = d.version;
        replaceDraft(d);
        setCategories(availableCategories);
        setReady(true);
        setStatus("Sin cambios por guardar");
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : "Error de carga");
          setStatus("No se pudo cargar");
        }
      }
    })();
    return () => {
      live = false;
      setReady(false);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, editor, router, setReady]);

  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlight.current || actionInFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    addEventListener("beforeunload", before);
    return () => removeEventListener("beforeunload", before);
  }, []);

  async function reconcile() {
    setStatus("Comprobando publicación…");
    try {
      const response = await fetch(`/api/blog/admin/posts/${id}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) { loseAccess(); return; }
      if (!response.ok) throw Error();
      const remote = await response.json() as Draft;
      const local = latest.current;
      if (!local) throw Error();
      const merged = mergeReconciledPublication(local, remote, version.current);
      if (!merged) {
        flagConflict("La versión del servidor cambió mientras se comprobaba la publicación. Tus cambios locales se conservaron; cópialos antes de recargar.");
        return;
      }
      replaceDraft(merged);
      setPublicationUnknown(false);
      setStatus(dirtyRef.current ? "Cambios por guardar" : "Estado de publicación comprobado");
      setError("La respuesta no se confirmó. Se consultó el estado actual de publicación, sin marcar tus cambios locales como guardados.");
    } catch {
      setPublicationUnknown(true);
      setStatus("Estado de publicación desconocido");
      setError("No se pudo confirmar la publicación. Restablece la conexión y pulsa «Comprobar publicación» antes de repetir la acción. Tus cambios siguen aquí.");
    }
  }

  async function action(name: "publish" | "unpublish") {
    if (dirtyRef.current || inFlight.current || actionInFlight.current || conflictRef.current || publicationUnknown || accessLostRef.current) {
      setError("Guarda todos los cambios y resuelve los avisos antes de publicar o retirar.");
      return;
    }
    if (name === "publish" && latest.current && editor) {
      const validation = imageValidation() || validatePublishableBlogPost({ ...latest.current, document: editor.getJSON() as BlogDocument });
      if (validation) {
        setError(validation);
        return;
      }
    }
    if (name === "unpublish" && !window.confirm("¿Retirar este artículo? Dejará de estar disponible públicamente. El borrador y sus imágenes se conservarán; podrás volver a publicarlo.")) return;
    actionInFlight.current = true;
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/blog/admin/posts/${id}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: version.current }),
      });
      if (response.status === 409) {
        flagConflict("La versión del servidor cambió. Tus cambios se conservan; copia el contenido antes de recargar.");
        return;
      }
      if (response.status === 401 || response.status === 403) { loseAccess(); return; }
      if (!response.ok) {
        if (response.status >= 500) {
          await reconcile();
          return;
        }
        setError(await responseError(response, "El servidor rechazó la acción. La publicación anterior y tus cambios se conservan."));
        return;
      }
      const result = await response.json();
      if (latest.current) {
        replaceDraft({
          ...latest.current,
          publication: result.publication,
          hasUnpublishedChanges: result.hasUnpublishedChanges,
          firstPublishedAt: result.firstPublishedAt,
        });
      }
      setPublicationUnknown(false);
      setStatus(`${name === "publish" ? "Publicación actualizada" : "Artículo retirado"}${dirtyRef.current ? " · cambios por guardar" : ""}`);
    } catch {
      await reconcile();
    } finally {
      actionInFlight.current = false;
      setActionBusy(false);
      if (queued.current) {
        queued.current = false;
        void saveRef.current();
      }
    }
  }

  function leaveEditor(event: MouseEvent<HTMLAnchorElement>) {
    if (dirtyRef.current || inFlight.current || actionInFlight.current) {
      event.preventDefault();
      if (window.confirm("Hay cambios pendientes o una operación en curso. ¿Salir? Los cambios no guardados se perderán.")) {
        if (timer.current) clearTimeout(timer.current);
        router.push("/admin/blog");
      }
    }
  }

  return {
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
    loseAccess,
    dirtyRef,
    inFlight,
    conflictRef,
    setError,
    markDirty,
    field,
    save,
    reconcile,
    action,
    leaveEditor,
  };
}
