"use client";

import { useMemo, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BLOG_CONTENT_EXTENSIONS } from "@/modules/content/blog-schema";
import { splitEditorContent } from "@/modules/content/editor-content";
import { EditorToolbar } from "@/modules/content/client/blog-editor/components/editor-toolbar";
import { EditorFloatingPanel } from "@/modules/content/client/editor-floating-panel";
import { control, input, type Panel } from "@/modules/content/client/blog-editor/shared";
import { isHtmlContent, parseListingContent } from "@/modules/listings/listing-content";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function editorContent(raw: string) {
  const { html } = splitEditorContent(raw);
  // isHtmlContent handles the common block markup; the broader check also
  // catches inline-only and media markup that the listing renderer predicate misses.
  if (isHtmlContent(html) || /<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/i.test(html)) return html;
  return parseListingContent(html).map(block => {
    if (block.type === "heading") return `<h3>${escapeHtml(block.text)}</h3>`;
    if (block.type === "list") return `<ul>${block.items.map(item => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ul>`;
    return `<p>${escapeHtml(block.text)}</p>`;
  }).join("") || "<p></p>";
}

function safeHref(value: string) {
  const href = value.trim();
  if (!href || /[\u0000-\u0020\\]/.test(href)) return null;
  if (href.startsWith("/")) return href.startsWith("//") ? null : href;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

const DESCRIPTION_EXTENSIONS = [
  ...BLOG_CONTENT_EXTENSIONS.filter(extension => extension.name !== "image"),
  Image.configure({ inline: false, allowBase64: false }),
];

type Props = {
  initialContent: string;
  onChange: (html: string) => void;
};

export default function ListingDescriptionEditor({ initialContent, onChange }: Props) {
  const initialHtml = useMemo(() => editorContent(initialContent), [initialContent]);
  const [panel, setPanel] = useState<Panel>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkSelection = useRef<{ from: number; to: number } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const editor = useEditor({
    extensions: DESCRIPTION_EXTENSIONS,
    content: initialHtml,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Descripción del hospedaje",
        "aria-multiline": "true",
        class: "min-h-[300px] rounded-b-lg px-4 py-4 text-base leading-7 text-[#394342] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#394342] [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#cbd4ca] [&_blockquote]:pl-4 [&_a]:text-[#315f51] [&_a]:underline [&_hr]:my-6 [&_hr]:border-[#d8ded8]",
      },
    },
  });
  const editorState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      h2: current?.isActive("heading", { level: 2 }),
      h3: current?.isActive("heading", { level: 3 }),
      bullet: current?.isActive("bulletList"),
      ordered: current?.isActive("orderedList"),
      quote: current?.isActive("blockquote"),
      link: current?.isActive("link"),
      images: [],
    }),
  });

  function openLink(trigger: HTMLElement) {
    linkSelection.current = editor ? { from: editor.state.selection.from, to: editor.state.selection.to } : null;
    setLinkUrl(editor?.getAttributes("link").href ?? "");
    setLinkError("");
    returnFocus.current = trigger;
    setPanel("link");
  }

  function applyLink() {
    const href = safeHref(linkUrl);
    if (!href) {
      setLinkError("Usa una dirección https://, http://, mailto:, tel: o una ruta que empiece por /.");
      return;
    }
    if (editor && linkSelection.current) {
      editor.chain().focus().setTextSelection(linkSelection.current).extendMarkRange("link").setLink({ href }).run();
    }
    setPanel(null);
  }

  function removeLink() {
    if (editor && linkSelection.current) {
      editor.chain().focus().setTextSelection(linkSelection.current).extendMarkRange("link").unsetLink().run();
    }
    setPanel(null);
  }

  return (
    <section className="min-w-0 space-y-2">
      <p className="text-sm leading-6 text-[#596461]">Describe el espacio, sus detalles y lo que conviene saber antes de reservar.</p>
      <div className="min-w-0 overflow-hidden rounded-lg border border-[#d8ded8] bg-white focus-within:border-[#8c9d93]">
        <EditorToolbar
          editor={editor}
          editorState={editorState}
          panel={panel}
          uploading={false}
          openLink={openLink}
          hideImageTools
        />
        <div className="min-w-0 overflow-x-auto [&_.tiptap]:min-w-0">
          <EditorContent editor={editor} />
        </div>
      </div>
      {panel === "link" && (
        <EditorFloatingPanel title="Editar enlace" onClose={() => setPanel(null)} returnFocusRef={returnFocus}>
          <div className="space-y-4 text-sm text-[#394342]">
            <p>Selecciona el texto que quieres enlazar antes de abrir esta ventana.</p>
            <label className="block">
              Dirección del enlace
              <input className={input} placeholder="https://ejemplo.com" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} />
            </label>
            {linkError && <p role="alert" className="text-red-800">{linkError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={control} onClick={applyLink}>Aplicar enlace</button>
              <button type="button" className={control} onClick={removeLink}>Quitar enlace</button>
            </div>
          </div>
        </EditorFloatingPanel>
      )}
    </section>
  );
}
