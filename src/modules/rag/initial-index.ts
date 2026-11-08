import "server-only";

import { createHash } from "node:crypto";
import { decodeHTML } from "entities";
import sanitizeHtml from "sanitize-html";
import { splitEditorContent } from "../content/editor-content.ts";
import { splitDynamicBody } from "../content/dynamic-blocks.ts";
import { blogPostPath } from "../content/paths.ts";
import { AMENITY_KEYS } from "../listings/listing-admin-fields.ts";

export const RAG_EXTRACTOR_VERSION = "2";
const BLOCK_TAGS = new Set(["address", "blockquote", "br", "dd", "div", "dt", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"]);

export type RagSection = { title: string; text: string };
export type RagSource = {
  sourceType: "blog" | "listing";
  sourceId: string;
  url: string;
  title: string;
  contentHash: string;
  extractorVersion: string;
  sections: RagSection[];
};

export function isIndexableRagSource(source: RagSource) {
  return Boolean(source.title.trim() && source.sections.some((section) => section.text.trim()));
}

function normalize(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function htmlSections(raw: string): RagSection[] {
  const { html } = splitEditorContent(raw);
  const visibleHtml = splitDynamicBody(html).filter((part) => part.kind === "html").map((part) => part.html).join("\n");
  const sections: RagSection[] = [];
  let current = "";
  let sectionTitle = "Descripción";
  // sanitize-html removes script/style content; decode the escaped text callback
  // explicitly. Comments and attributes never enter the extracted text.
  sanitizeHtml(visibleHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: {},
    textFilter(text, tagName) {
      if (/^h[1-6]$/.test(tagName)) {
        if (current.trim()) sections.push({ title: sectionTitle, text: normalize(current) });
        current = "";
        sectionTitle = normalize(decodeHTML(text)) || "Descripción";
        if (sectionTitle !== "Descripción") sections.push({ title: "Encabezado", text: sectionTitle });
        return "";
      }
      if (BLOCK_TAGS.has(tagName) && current.trim()) {
        sections.push({ title: sectionTitle, text: normalize(current) });
        current = "";
      }
      current += `${tagName === "li" ? "• " : ""}${decodeHTML(text)}`;
      return "";
    },
  });
  if (current.trim()) sections.push({ title: sectionTitle, text: normalize(current) });
  return sections.filter(({ text }) => text);
}

function blogSections(document: unknown): RagSection[] {
  const sections: RagSection[] = [];
  let heading = "Contenido";
  const inline = (nodes: unknown): string => Array.isArray(nodes) ? nodes.map((raw) => {
    if (!raw || typeof raw !== "object") return "";
    const node = raw as Record<string, unknown>;
    if (node.type === "text") {
      const text = typeof node.text === "string" ? node.text : "";
      const link = Array.isArray(node.marks)
        ? node.marks.find((mark) => (mark as { type?: string }).type === "link") as { attrs?: { href?: unknown } } | undefined
        : undefined;
      const href = link?.attrs?.href;
      return typeof href === "string" && href ? `${text} (${href})` : text;
    }
    if (node.type === "hardBreak") return " ";
    if (node.type === "image") {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (attrs?.decorative === true) return "";
      return (typeof attrs?.caption === "string" && attrs.caption) || (typeof attrs?.alt === "string" ? attrs.alt : "");
    }
    return inline(node.content);
  }).join("") : "";
  const push = (text: string, prefix = "") => {
    const value = normalize(prefix + text);
    if (value) sections.push({ title: heading, text: value });
  };
  const visit = (nodes: unknown, listPrefix = "") => {
    if (!Array.isArray(nodes)) return;
    for (const raw of nodes) {
      if (!raw || typeof raw !== "object") continue;
      const node = raw as Record<string, unknown>;
      if (node.type === "heading") {
        const text = normalize(inline(node.content));
        if (text) { heading = text; push(text, "Encabezado: "); }
      } else if (node.type === "paragraph") {
        push(inline(node.content), listPrefix);
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        const items = Array.isArray(node.content) ? node.content : [];
        const start = Number((node.attrs as { start?: unknown } | undefined)?.start) || 1;
        items.forEach((item, index) => visit([item], `${listPrefix}${node.type === "orderedList" ? `${start + index}. ` : "• "}`));
      } else if (node.type === "listItem") {
        visit(node.content, listPrefix);
      } else if (node.type === "blockquote") {
        visit(node.content, `${listPrefix}Cita: `);
      } else if (node.type === "image") {
        push(inline([node]), listPrefix);
      } else visit(node.content, listPrefix);
    }
  };
  visit((document as { content?: unknown } | null)?.content);
  return sections;
}

function source(input: Omit<RagSource, "contentHash" | "extractorVersion">): RagSource {
  const contentHash = createHash("sha256").update(JSON.stringify([input.title, input.sections])).digest("hex");
  return { ...input, contentHash, extractorVersion: RAG_EXTRACTOR_VERSION };
}

export function extractBlogPublication(publication: {
  postId: number; slug: string; title: string; excerpt: string; document: unknown;
  publishedAt: string; categories?: string[];
}): RagSource {
  const sections = [
    { title: "Título", text: normalize(publication.title) },
    ...(publication.excerpt.trim() ? [{ title: "Extracto", text: normalize(publication.excerpt) }] : []),
    ...blogSections(publication.document),
    ...(publication.categories ?? []).map((name) => ({ title: "Categoría", text: normalize(name) })),
  ].filter((section) => section.text);
  return source({ sourceType: "blog", sourceId: String(publication.postId), url: blogPostPath(publication.publishedAt, publication.slug), title: publication.title, sections });
}

export function extractPublicListing(listing: {
  id: number; slug: string; title: string; contentHtml: string; attributes: Record<string, unknown>;
  maxGuests?: number | null; baseGuests?: number | null; petsAllowed?: boolean | null;
  minStayNights?: number | null; checkInSeconds?: number | null; checkOutSeconds?: number | null;
  categories?: string[]; petsTerms?: string[];
}): RagSource {
  const attrs = listing.attributes;
  const sections: RagSection[] = [{ title: "Título", text: normalize(listing.title) }, ...htmlSections(listing.contentHtml)];
  const add = (title: string, value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      const text = normalize(String(value));
      if (text) sections.push({ title, text });
    }
  };
  for (const key of ["location", "building", "bedrooms", "bathrooms", "parking"]) add(key, attrs[key]);
  add("Huéspedes", listing.maxGuests);
  add("Huéspedes base", listing.baseGuests);
  if (listing.petsAllowed !== null && listing.petsAllowed !== undefined) add("Mascotas", listing.petsAllowed ? "Permitidas" : "No permitidas");
  add("Estadía mínima (noches)", listing.minStayNights);
  const addTime = (title: string, seconds: number | null | undefined) => {
    if (seconds == null) return;
    const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor(seconds % 3600 / 60).toString().padStart(2, "0");
    const remainder = (seconds % 60).toString().padStart(2, "0");
    add(title, `${hours}:${minutes}:${remainder} (${seconds} segundos desde medianoche)`);
  };
  addTime("Check-in", listing.checkInSeconds);
  addTime("Check-out", listing.checkOutSeconds);
  for (const key of AMENITY_KEYS) {
    const value = attrs[key];
    // Presence means enabled in the source convention; explicit false-like values do not.
    if (value === "1") add("Servicio", key);
  }
  for (const category of listing.categories ?? []) add("Categoría", category);
  for (const term of listing.petsTerms ?? []) add("Política de mascotas", term);
  return source({ sourceType: "listing", sourceId: String(listing.id), url: `/listing/${encodeURIComponent(listing.slug)}`, title: listing.title, sections });
}

/** Character-bounded deterministic chunks; token-aware sizing waits for verified model limits. */
export function chunkRagSource(source: RagSource, maxCharacters = 1800): Array<RagSection & { ordinal: number; contentHash: string }> {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) throw new Error("maxCharacters must be a positive integer");
  const chunks: Array<RagSection & { ordinal: number; contentHash: string }> = [];
  for (const section of source.sections) {
    let remaining = section.text;
    while (remaining.length) {
      let end = Math.min(maxCharacters, remaining.length);
      if (end < remaining.length) {
        const boundary = remaining.lastIndexOf(" ", end);
        if (boundary > 0) end = boundary;
      }
      const text = remaining.slice(0, end).trim();
      chunks.push({ title: section.title, text, ordinal: chunks.length, contentHash: createHash("sha256").update(JSON.stringify([section.title, text])).digest("hex") });
      remaining = remaining.slice(end).trimStart();
    }
  }
  return chunks;
}

export async function chunkRagSourceByTokens(
  source: RagSource,
  countTokens: (title: string, text: string) => Promise<number>,
  maxTokens = 7000,
): Promise<Array<RagSection & { ordinal: number; contentHash: string; tokenCount: number }>> {
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error("maxTokens must be a positive integer");
  const chunks: Array<RagSection & { ordinal: number; contentHash: string; tokenCount: number }> = [];
  for (const section of source.sections) {
    const words = section.text.trim().split(/\s+/).filter(Boolean);
    while (words.length) {
      let low = 1;
      let high = words.length;
      let fit = 0;
      while (low <= high) {
        const mid = Math.ceil((low + high) / 2);
        const text = words.slice(0, mid).join(" ");
        if (await countTokens(source.title, `${section.title}\n${text}`) <= maxTokens) {
          fit = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      if (!fit) throw new Error(`A single token segment exceeds the ${maxTokens}-token embedding limit`);
      const text = words.splice(0, fit).join(" ");
      const tokenCount = await countTokens(source.title, `${section.title}\n${text}`);
      chunks.push({ title: section.title, text, ordinal: chunks.length, tokenCount,
        contentHash: createHash("sha256").update(JSON.stringify([section.title, text])).digest("hex") });
    }
  }
  return chunks;
}
