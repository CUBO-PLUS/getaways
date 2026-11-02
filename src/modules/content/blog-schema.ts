import type { Attributes, JSONContent } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";

export const BLOG_DOCUMENT_SCHEMA_VERSION = 1;

const BlogImage = Image.extend({
  addAttributes() {
    return {
      mediaId: { default: null },
      alt: { default: null },
      decorative: { default: false },
      caption: { default: null },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const { mediaId, alt, decorative, caption } = HTMLAttributes;
    return ["figure", { "data-media-id": mediaId, "data-decorative": decorative },
      ["img", { "data-media-id": mediaId, alt: alt ?? "" }],
      ...(caption ? [["figcaption", {}, caption]] : [])];
  },
  addNodeView() {
    return ({ node }) => {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      const caption = document.createElement("figcaption");
      figure.append(image, caption);
      const update = (current: typeof node) => {
        const attrs = current.attrs as { mediaId: string; alt: string; decorative: boolean; caption: string | null };
        image.src = `/api/blog/media/${encodeURIComponent(attrs.mediaId)}`;
        image.alt = attrs.decorative ? "" : attrs.alt ?? "";
        caption.textContent = attrs.caption ?? "";
        caption.hidden = !attrs.caption;
      };
      update(node);
      return {
        dom: figure,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          update(node);
          return true;
        },
      };
    };
  },
}).configure({ inline: false, allowBase64: false });

const BlogLink = Link.extend({
  addAttributes() {
    // Keep the editor's JSON within the editorial schema, including when loading imported links.
    const attributes: Attributes = this.parent?.() ?? {};
    return { href: attributes.href, target: attributes.target, rel: attributes.rel };
  },
}).configure({
  openOnClick: false, autolink: false, linkOnPaste: false,
  HTMLAttributes: { rel: "noopener noreferrer" },
});

export const BLOG_CONTENT_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] }, link: false, code: false, codeBlock: false,
    strike: false, underline: false, dropcursor: false, gapcursor: false,
    listKeymap: false, trailingNode: false,
  }),
  BlogLink,
  BlogImage,
];

export type BlogDocument = JSONContent & { type: "doc" };
export type BlogValidationOptions = {
  schemaVersion: number;
  hasMedia: (mediaId: string) => boolean | Promise<boolean>;
};

const MAX_JSON_BYTES = 1_000_000;
const MAX_DEPTH = 20;
const MAX_NODES = 10_000;
const ATTRS: Record<string, string[]> = {
  doc: [], paragraph: [], heading: ["level"], text: [], hardBreak: [],
  bulletList: ["tight"], orderedList: ["start", "tight"], listItem: [],
  blockquote: [], horizontalRule: [], image: ["mediaId", "alt", "decorative", "caption"],
};
const MARK_ATTRS: Record<string, string[]> = { bold: [], italic: [], link: ["href", "target", "rel"] };
const CHILDREN: Record<string, string[]> = {
  doc: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule", "image"],
  paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"],
  bulletList: ["listItem"], orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList"],
  blockquote: ["paragraph", "heading", "bulletList", "orderedList"],
};

function fail(message: string): never {
  throw new Error(`Invalid blog document: ${message}`);
}

function safeLink(href: unknown): boolean {
  if (typeof href !== "string" || !href.trim() || /[\u0000-\u0020\\]/.test(href)) return false;
  if (href.startsWith("/")) return !href.startsWith("//");
  try {
    return ["https:", "http:", "mailto:", "tel:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

/** Strictly validates stored JSON; unknown fields/nodes are errors, never discarded. */
export async function validateBlogDocument(
  value: unknown,
  { schemaVersion, hasMedia }: BlogValidationOptions,
): Promise<BlogDocument> {
  if (schemaVersion !== BLOG_DOCUMENT_SCHEMA_VERSION) fail("unsupported schema version");
  let count = 0;
  let stringCharacters = 0;
  const ancestors = new WeakSet<object>();
  const accountString = (part: string) => {
    if (part.length > MAX_JSON_BYTES) fail("document is too large");
    stringCharacters += part.length;
    if (stringCharacters > MAX_JSON_BYTES) fail("document is too large");
  };
  async function inspect(node: unknown, depth: number): Promise<void> {
    if (!node || typeof node !== "object" || Array.isArray(node)) fail("node must be an object");
    if (depth > MAX_DEPTH || ++count > MAX_NODES) fail("document exceeds structural limits");
    if (ancestors.has(node)) fail("document contains a cycle");
    ancestors.add(node);
    const n = node as Record<string, unknown>;
    if (typeof n.type !== "string" || !Object.hasOwn(ATTRS, n.type)) fail(`unsupported node: ${String(n.type)}`);
    accountString(n.type);
    if (depth === 1 && n.type !== "doc") fail("root must be a doc node");
    const nodeKeys = Object.keys(n);
    for (const key of nodeKeys) accountString(key);
    if (nodeKeys.some((key) => !["type", "attrs", "content", "text", "marks"].includes(key))) fail("unsupported node field");
    if (n.attrs !== undefined) {
      if (!n.attrs || typeof n.attrs !== "object" || Array.isArray(n.attrs)) fail("invalid attributes");
      const attrs = n.attrs as Record<string, unknown>;
      for (const [key, attribute] of Object.entries(attrs)) {
        accountString(key);
        if (typeof attribute === "string") accountString(attribute);
        else if (attribute !== null && typeof attribute !== "boolean" && typeof attribute !== "number") fail(`invalid ${n.type} attribute`);
      }
      if (Object.keys(attrs).some((key) => !ATTRS[n.type as string].includes(key))) fail(`unsupported ${n.type} attribute`);
      if (n.type === "heading" && attrs.level !== 2 && attrs.level !== 3) fail("only H2 and H3 are allowed");
      if (n.type === "image") {
        if (typeof attrs.mediaId !== "string" || !attrs.mediaId || !(await hasMedia(attrs.mediaId))) fail("unknown media reference");
        if (typeof attrs.alt !== "string" || typeof attrs.decorative !== "boolean") fail("image alt/decorative declaration is required");
        if (!attrs.decorative && !attrs.alt.trim()) fail("informative images need alt text");
        if (attrs.caption != null && typeof attrs.caption !== "string") fail("invalid image caption");
      }
    }
    if (n.type === "heading" && (!n.attrs || typeof n.attrs !== "object")) fail("heading level is required");
    if (n.type === "image" && (!n.attrs || typeof n.attrs !== "object")) fail("image attributes are required");
    if (n.type === "text" && typeof n.text !== "string") fail("text node needs text");
    if (typeof n.text === "string") accountString(n.text);
    if (n.type !== "text" && n.text !== undefined) fail("only text nodes may contain text");
    if (n.content !== undefined && !(CHILDREN[n.type] ?? []).length) fail(`${n.type} cannot contain children`);
    if (n.marks !== undefined) {
      if (n.type !== "text") fail("marks are only allowed on text nodes");
      if (!Array.isArray(n.marks)) fail("marks must be an array");
      for (const mark of n.marks) {
        if (!mark || typeof mark !== "object" || Array.isArray(mark)) fail("invalid mark");
        const m = mark as Record<string, unknown>;
        if (typeof m.type !== "string" || !Object.hasOwn(MARK_ATTRS, m.type)) fail(`unsupported mark: ${String(m.type)}`);
        accountString(m.type);
        const markKeys = Object.keys(m);
        for (const key of markKeys) accountString(key);
        if (markKeys.some((key) => key !== "type" && key !== "attrs")) fail("unsupported mark field");
        if (m.attrs !== undefined && (!m.attrs || typeof m.attrs !== "object" || Array.isArray(m.attrs))) fail("invalid mark attributes");
        const a = (m.attrs ?? {}) as Record<string, unknown>;
        for (const [key, attribute] of Object.entries(a)) {
          accountString(key);
          if (typeof attribute === "string") accountString(attribute);
          else if (attribute !== null) fail("invalid mark attribute");
        }
        if (Object.keys(a).some((key) => !MARK_ATTRS[m.type as string].includes(key))) fail("unsupported mark attribute");
        if (m.type === "link" && (!safeLink(a.href) || (a.target != null && a.target !== "_blank") || (a.rel != null && a.rel !== "noopener noreferrer"))) fail("unsafe link");
      }
    }
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) fail("content must be an array");
      for (const child of n.content) {
        await inspect(child, depth + 1);
        if (!CHILDREN[n.type]?.includes((child as Record<string, string>).type)) fail(`invalid child of ${n.type}`);
      }
    }
    ancestors.delete(node);
  }
  await inspect(value, 1);
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { return fail("document is not JSON serializable"); }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > MAX_JSON_BYTES) fail("document is too large");
  return value as BlogDocument;
}
