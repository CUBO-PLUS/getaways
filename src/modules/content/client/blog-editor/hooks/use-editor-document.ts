import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEditor, useEditorState } from "@tiptap/react";
import { BLOG_CONTENT_EXTENSIONS } from "@/modules/content/blog-schema";
import type { ImageAttrs, ImageTarget, Panel } from "../shared";

type Options = {
  id: string;
  ready: RefObject<boolean>;
  imagePositionRef: RefObject<number | null>;
  insertionPositionRef: RefObject<number | null>;
  linkSelectionRef: RefObject<{ from: number; to: number } | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  setImageTarget: Dispatch<SetStateAction<ImageTarget | null>>;
  setPanel: Dispatch<SetStateAction<Panel>>;
  markDirty: () => void;
  openImage: (pos: number) => void;
};

export function useEditorDocument({
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
}: Options) {
  const editor = useEditor({
    extensions: BLOG_CONTENT_EXTENSIONS,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    onUpdate: () => {
      if (ready.current) markDirty();
    },
    onSelectionUpdate: ({ editor: current }) => {
      if (ready.current && current.isActive("image")) {
        const pos = current.state.selection.from;
        imagePositionRef.current = pos;
        setImageTarget({ pos, attrs: current.getAttributes("image") as ImageAttrs });
        returnFocusRef.current = current.view.dom;
        setPanel("image");
      }
    },
    onTransaction: ({ editor: current, transaction }) => {
      if (!transaction.docChanged) return;
      if (insertionPositionRef.current !== null) {
        insertionPositionRef.current = transaction.mapping.map(insertionPositionRef.current);
      }
      if (linkSelectionRef.current) {
        linkSelectionRef.current = {
          from: transaction.mapping.map(linkSelectionRef.current.from),
          to: transaction.mapping.map(linkSelectionRef.current.to),
        };
      }
      if (imagePositionRef.current === null) return;
      const mapped = transaction.getMeta("blog-image-attributes")
        ? { pos: imagePositionRef.current, deleted: false }
        : transaction.mapping.mapResult(imagePositionRef.current);
      const node = current.state.doc.nodeAt(mapped.pos);
      if (mapped.deleted || node?.type.name !== "image") {
        imagePositionRef.current = null;
        setImageTarget(null);
        setPanel(previous => previous === "image" ? null : previous);
      } else {
        imagePositionRef.current = mapped.pos;
        setImageTarget({ pos: mapped.pos, attrs: node.attrs as ImageAttrs });
      }
    },
    editorProps: {
      attributes: {
        "aria-label": "Contenido del artículo",
        role: "textbox",
        "aria-multiline": "true",
        "aria-describedby": "editor-image-help",
        class: "min-h-[50vh] outline-none focus-visible:ring-2 focus-visible:ring-[#0277bd] rounded-lg px-2 py-4 text-lg leading-8 [&_p]:text-slate-700 [&_p]:text-lg [&_p]:leading-8 [&_figure]:my-6 [&_figure]:cursor-pointer [&_figure]:rounded-lg [&_figure]:p-2 [&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-[#0277bd] [&_img]:mx-auto [&_img]:block [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-slate-500 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_hr]:my-8 [&_hr]:border-slate-300",
      },
      handleClickOn: (_view, _pos, node, nodePos, _event, direct) => {
        if (!direct || node.type.name !== "image") return false;
        openImage(nodePos);
        return true;
      },
      handleKeyDown: (view, event) => {
        if (event.key !== "Enter" || view.state.doc.nodeAt(view.state.selection.from)?.type.name !== "image") return false;
        openImage(view.state.selection.from);
        return true;
      },
    },
  }, [id]);

  const editorState = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const images: ImageTarget[] = [];
      current?.state.doc.descendants((node, pos) => {
        if (node.type.name === "image") images.push({ pos, attrs: node.attrs as ImageAttrs });
      });
      return {
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
        images,
      };
    },
  });

  return { editor, editorState };
}

export type EditorState = NonNullable<ReturnType<typeof useEditorDocument>["editorState"]>;
