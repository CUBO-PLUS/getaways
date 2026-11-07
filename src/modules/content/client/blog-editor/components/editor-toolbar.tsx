import type { Editor } from "@tiptap/react";
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, ImagePlus, ImageIcon, Minus, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/shared/ui/utils";
import type { EditorState } from "../hooks/use-editor-document";
import { control, type Panel } from "../shared";

type Props = {
  editor: Editor | null;
  editorState: EditorState | null;
  panel: Panel;
  uploading: boolean;
  openLink: (trigger: HTMLElement) => void;
  startInsert?: (trigger: HTMLElement) => void;
  openPanel?: (panel: Panel, trigger: HTMLElement) => void;
  hideImageTools?: boolean;
};

export function EditorToolbar({ editor, editorState, panel, uploading, openLink, startInsert, openPanel, hideImageTools = false }: Props) {
  const groups = [
    ["Texto", [
      ["Negrita", Bold, () => editor?.chain().focus().toggleBold().run(), editorState?.bold],
      ["Cursiva", Italic, () => editor?.chain().focus().toggleItalic().run(), editorState?.italic],
    ]],
    ["Estructura", [
      ["Subtítulo", Heading2, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editorState?.h2],
      ["Subtítulo menor", Heading3, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editorState?.h3],
      ["Viñetas", List, () => editor?.chain().focus().toggleBulletList().run(), editorState?.bullet],
      ["Lista numerada", ListOrdered, () => editor?.chain().focus().toggleOrderedList().run(), editorState?.ordered],
      ["Cita", Quote, () => editor?.chain().focus().toggleBlockquote().run(), editorState?.quote],
    ]],
  ] as const;

  return (
    <div role="toolbar" aria-label="Herramientas de escritura" className="top-0 z-10 mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur-sm md:sticky md:px-12">
      <div role="group" aria-label="Historial" className="border-r border-slate-200 pr-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(control, "inline-flex min-h-9 items-center px-2")}
            title="Deshacer (Ctrl+Z / ⌘Z)"
            aria-label="Deshacer"
            aria-keyshortcuts="Control+z Meta+z"
            disabled={!editorState?.canUndo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(control, "inline-flex min-h-9 items-center px-2")}
            title="Rehacer (Ctrl+Shift+Z / ⌘⇧Z)"
            aria-label="Rehacer"
            aria-keyshortcuts="Control+Shift+z Meta+Shift+z Control+y"
            disabled={!editorState?.canRedo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {groups.map(([group, actions]) => (
        <div key={group} role="group" aria-label={group} className="border-r border-slate-200 pr-2">
          <div className="flex flex-wrap gap-1">
            {actions.map(([label, Icon, run, active]) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={Boolean(active)}
                className={cn(control, "inline-flex min-h-9 items-center px-2", active && "border-sky-300 bg-sky-100 text-sky-950 hover:bg-sky-100")}
                onClick={run}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
            {group === "Estructura" && (
              <button
                type="button"
                className={cn(control, "inline-flex min-h-9 items-center px-2")}
                title="Separador de secciones (---)"
                aria-label="Insertar separador de secciones"
                onClick={() => editor?.chain().focus().setHorizontalRule().run()}
              >
                <Minus size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}

      <div role="group" aria-label={hideImageTools ? "Enlaces" : "Insertar y revisar contenido"}>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(control, "inline-flex min-h-9 items-center gap-1.5 px-2 text-xs", editorState?.link && "border-sky-300 bg-sky-100 text-sky-950")}
            aria-haspopup="dialog"
            aria-pressed={Boolean(editorState?.link)}
            onClick={event => openLink(event.currentTarget)}
          >
            <Link2 size={16} aria-hidden="true" /> Enlace
          </button>
          {!hideImageTools && <button
            type="button"
            className={cn(control, "inline-flex min-h-9 items-center gap-1.5 px-2 text-xs")}
            aria-haspopup="dialog"
            disabled={uploading}
            onClick={event => startInsert?.(event.currentTarget)}
          >
            <ImagePlus size={16} aria-hidden="true" /> Insertar imagen
          </button>}
          {!hideImageTools && <button
            type="button"
            className={cn(control, "inline-flex min-h-9 items-center gap-1.5 px-2 text-xs")}
            aria-haspopup="dialog"
            aria-expanded={panel === "images"}
            onClick={event => openPanel?.("images", event.currentTarget)}
          >
            <ImageIcon size={16} aria-hidden="true" /> Revisar imágenes ({editorState?.images.length ?? 0})
          </button>}
        </div>
      </div>
    </div>
  );
}
