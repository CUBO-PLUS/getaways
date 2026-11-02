import { useCallback, useRef, useState, type FormEvent } from "react";
import { imageAttributesFromChoice } from "@/modules/content/blog-editor-state";
import { useEditorDocument } from "./use-editor-document";
import { responseError, type Draft, type ImageAttrs, type ImageTarget, type Panel } from "../shared";

type Options = {
  id: string;
  markDirty: () => void;
  field: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  setError: (message: string) => void;
};

export function useEditorTools({ id, markDirty, field, setError }: Options) {
  const ready = useRef(false);
  const setReady = useCallback((value: boolean) => { ready.current = value; }, []);
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [preview, setPreview] = useState(false);
  const [imageTarget, setImageTarget] = useState<ImageTarget | null>(null);
  const [imageChoice, setImageChoice] = useState<"informative" | "decorative" | "">("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const imagePositionRef = useRef<number | null>(null);
  const insertionPositionRef = useRef<number | null>(null);
  const linkSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const editorScroll = useRef(0);

  const { editor, editorState } = useEditorDocument({
    id,
    ready,
    imagePositionRef,
    insertionPositionRef,
    linkSelectionRef,
    returnFocusRef,
    setImageTarget,
    setPanel,
    markDirty,
    openImage,
  });

  function openPanel(next: Panel, trigger: HTMLElement) {
    returnFocusRef.current = trigger;
    setPanel(next);
  }

  function showPreview() {
    editorScroll.current = window.scrollY;
    setPanel(null);
    setPreview(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      previewHeadingRef.current?.focus({ preventScroll: true });
    });
  }

  function returnToEditor() {
    setPreview(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: editorScroll.current, behavior: "instant" });
      previewTriggerRef.current?.focus({ preventScroll: true });
    });
  }

  function openImage(pos: number) {
    const node = editor?.state.doc.nodeAt(pos);
    if (node?.type.name !== "image" || !editor) return;
    imagePositionRef.current = pos;
    setImageTarget({ pos, attrs: node.attrs as ImageAttrs });
    returnFocusRef.current = editor.view.dom;
    editor.commands.setNodeSelection(pos);
    setPanel("image");
  }

  function updateImage(attrs: Partial<ImageAttrs>) {
    const pos = imagePositionRef.current;
    if (!editor || pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name !== "image") return;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
        .setMeta("blog-image-attributes", true),
    );
  }

  function removeImage() {
    const pos = imagePositionRef.current;
    if (!editor || pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name !== "image") return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    setPanel(null);
  }

  function startInsert(trigger: HTMLElement) {
    insertionPositionRef.current = editor?.state.selection.from ?? 0;
    setImageChoice("");
    setImageFile(null);
    setImageAlt("");
    setImageCaption("");
    openPanel("insert", trigger);
  }

  async function upload(file: File, cover = false, attrs?: { alt: string; decorative: boolean; caption: string | null }) {
    if (uploading) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Elige una imagen JPEG, PNG o WebP de hasta 10 MB.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    setUploading(true);
    setError("");
    try {
      const response = await fetch("/api/blog/media", { method: "POST", body: form });
      if (!response.ok) {
        throw Error(await responseError(response, response.status === 413 || response.status === 415
          ? "La imagen debe ser JPEG, PNG o WebP, de hasta 10 MB y 40 millones de píxeles."
          : "No se pudo subir la imagen. Comprueba la conexión antes de reintentar."));
      }
      const media = await response.json();
      if (cover) {
        field("coverMediaId", media.id);
        field("coverAlt", "");
      } else if (attrs && editor) {
        const pos = insertionPositionRef.current ?? editor.state.selection.from;
        editor.commands.insertContentAt(pos, { type: "image", attrs: { mediaId: String(media.id), ...attrs } });
        setPanel(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo confirmar la subida. Puede que el archivo se haya recibido; comprueba la conexión antes de reintentar.");
    } finally {
      setUploading(false);
    }
  }

  function insertImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attrs = imageAttributesFromChoice(imageChoice, imageAlt, imageCaption);
    if (imageFile && attrs) void upload(imageFile, false, attrs);
  }

  function openLink(trigger: HTMLElement) {
    linkSelectionRef.current = editor
      ? { from: editor.state.selection.from, to: editor.state.selection.to }
      : null;
    setLinkUrl(editor?.getAttributes("link").href ?? "");
    openPanel("link", trigger);
  }

  function applyLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = linkUrl.trim();
    if (!href || /[\u0000-\u0020\\]/.test(href) || !(href.startsWith("/") && !href.startsWith("//") || /^(https?:|mailto:|tel:)/i.test(href))) {
      setError("Usa una dirección https://, http://, mailto:, tel: o una ruta que empiece por /.");
      return;
    }
    if (editor && linkSelectionRef.current) {
      editor.chain().setTextSelection(linkSelectionRef.current).extendMarkRange("link").setLink({ href }).run();
    }
    setPanel(null);
  }

  function removeLink() {
    if (editor && linkSelectionRef.current) {
      editor.chain().setTextSelection(linkSelectionRef.current).extendMarkRange("link").unsetLink().run();
    }
    setPanel(null);
  }

  return {
    editor,
    editorState,
    setReady,
    uploading,
    upload,
    panel,
    setPanel,
    openPanel,
    returnFocusRef,
    preview,
    previewHeadingRef,
    previewTriggerRef,
    showPreview,
    returnToEditor,
    imageTarget,
    openImage,
    updateImage,
    removeImage,
    startInsert,
    insertImage,
    imageChoice,
    setImageChoice,
    imageFile,
    setImageFile,
    imageAlt,
    setImageAlt,
    imageCaption,
    setImageCaption,
    linkUrl,
    setLinkUrl,
    openLink,
    applyLink,
    removeLink,
  };
}
