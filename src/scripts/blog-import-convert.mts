import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import type { JSONContent } from "@tiptap/core";
import { BLOG_DOCUMENT_SCHEMA_VERSION, validateBlogDocument } from "../modules/content/blog-schema.ts";
import { analyzeBlogSources } from "./blog-import-dry-run.mjs";
import { assertSourceTree, resolveMediaFile } from "./blog-import-paths.mts";
import { readSourceJsonSnapshot, snapshotMediaFiles, sourceManifestSha256 } from "./blog-import-source.mts";

type SourcePost = {
  id: number;
  wp_id: number;
  slug: string;
  title: string;
  content_html: string;
  excerpt: string;
  published_at: string;
  featured_media_id: number | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
};
type SourceMedia = { id: number; wp_id: number; storage_path: string; alt_text: string | null };
type Diagnostic = { code: string; path: string; detail: unknown };

function textContent(element: Element): string {
  return element.textContent ?? "";
}

function inspectAttributes(element: Element, htmlPath: string, losses: Diagnostic[], represented: string[]) {
  for (const attribute of [...element.attributes]) {
    if (represented.includes(attribute.name)) continue;
    losses.push({
      code: "html-attribute-not-represented",
      path: htmlPath,
      detail: { element: element.tagName.toLowerCase(), name: attribute.name, value: attribute.value },
    });
  }
}

function markFor(element: Element): JSONContent["marks"] {
  switch (element.tagName.toLowerCase()) {
    case "strong": case "b": return [{ type: "bold" }];
    case "em": case "i": return [{ type: "italic" }];
    case "a": {
      const href = element.getAttribute("href");
      if (href === null) return undefined;
      const mark: NonNullable<JSONContent["marks"]>[number] = { type: "link", attrs: { href } };
      const target = element.getAttribute("target");
      const rel = element.getAttribute("rel");
      if (target !== null) mark.attrs = { ...mark.attrs, target };
      if (rel !== null) mark.attrs = { ...mark.attrs, rel };
      return [mark];
    }
    default: return undefined;
  }
}

function convertBlogHtml(html: string, postWpId: number, mediaByWpId: Map<number, SourceMedia>, mediaByPath: Map<string, SourceMedia>) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { document, Node } = dom.window;
  const losses: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const mediaRefs = new Set<string>();
  let unrepresentedButtonLinks = document.querySelectorAll("a.wp-block-button__link[href]").length;
  for (const match of html.matchAll(/<!--\s*wp:([\w/-]+)(?:\s+(\{[\s\S]*?\}))?\s*-->/g)) {
    const representedButtonBlock = (match[1] === "button" && unrepresentedButtonLinks > 0) || (match[1] === "buttons" && unrepresentedButtonLinks > 0);
    if (match[1] === "button" && representedButtonBlock) unrepresentedButtonLinks -= 1;
    if (!["paragraph", "heading", "separator", "image", "list", "list-item", "quote", "buttons", "button"].includes(match[1]) ||
        ((match[1] === "buttons" || match[1] === "button") && !representedButtonBlock)) {
      losses.push({ code: "gutenberg-block-not-represented", path: `gutenberg:${match[1]}`, detail: { block: match[1] } });
    }
    if (match[2]) {
      try {
        const attributes = JSON.parse(match[2]);
        if (Object.keys(attributes).length) losses.push({ code: "gutenberg-block-attributes-not-represented", path: `gutenberg:${match[1]}`, detail: { block: match[1], attributes } });
      } catch {
        losses.push({ code: "invalid-gutenberg-block-attributes", path: `gutenberg:${match[1]}`, detail: match[2] });
      }
    }
  }

  function inline(node: Node, currentPath: string, inheritedMarks: NonNullable<JSONContent["marks"]> = []): JSONContent[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? "";
      return value ? [{ type: "text", text: value, ...(inheritedMarks.length ? { marks: inheritedMarks } : {}) }] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") {
      inspectAttributes(element, currentPath, losses, []);
      return [{ type: "hardBreak" }];
    }
    if (tag === "img") {
      const image = makeImage(element, currentPath);
      if (!image) return [];
      losses.push({ code: "inline-image-not-represented-in-document", path: currentPath, detail: { mediaId: image.attrs?.mediaId, alt: image.attrs?.alt, caption: image.attrs?.caption, reason: "El esquema solo permite imágenes como bloques; extraer y revisar la posición visual." } });
      return [];
    }
    if (tag === "a" && element.classList.contains("wp-block-button__link")) {
      inspectAttributes(element, currentPath, losses, ["href", "target", "rel", "class"]);
      warnings.push({
        code: "button-style-not-represented",
        path: currentPath,
        detail: { sourceClasses: [...element.classList].sort(), destination: "text link; button visual styling is not represented" },
      });
      const mark = markFor(element);
      if (!mark) losses.push({ code: "button-link-href-missing", path: currentPath, detail: { text: textContent(element) } });
      return [...element.childNodes].flatMap((child, index) => inline(child, `${currentPath}/a[${index}]`, mark ? [...inheritedMarks, ...mark] : inheritedMarks));
    }
    const mark = markFor(element);
    if (tag === "a") {
      inspectAttributes(element, currentPath, losses, ["href", "target", "rel"]);
      if (element.hasAttribute("href") && !mark) losses.push({ code: "link-not-represented", path: currentPath, detail: { href: element.getAttribute("href") } });
    } else if (["strong", "b", "em", "i", "span", "small", "sup", "sub"].includes(tag)) {
      inspectAttributes(element, currentPath, losses, []);
      if (!["strong", "b", "em", "i", "span"].includes(tag)) losses.push({ code: "inline-semantics-not-represented", path: currentPath, detail: { element: tag } });
    } else {
      inspectAttributes(element, currentPath, losses, []);
      losses.push({ code: "unsupported-inline-element", path: currentPath, detail: { element: tag, sourceHtml: element.outerHTML } });
    }
    return [...element.childNodes].flatMap((child, index) => inline(child, `${currentPath}/${tag}[${index}]`, mark ? [...inheritedMarks, ...mark] : inheritedMarks));
  }

  function makeImage(element: Element, currentPath: string, caption: string | null = null): JSONContent | null {
    const src = element.getAttribute("src") ?? "";
    const wpIdText = [...element.classList].map((name) => /^wp-image-(\d+)$/.exec(name)?.[1]).find(Boolean);
    const wpId = wpIdText ? Number(wpIdText) : null;
    const pathKey = src.startsWith("/media/") ? src.slice("/media/".length) : null;
    const byId = wpId === null ? null : mediaByWpId.get(wpId);
    const byPath = pathKey === null ? null : mediaByPath.get(pathKey);
    const media = byId && byPath && byId.id === byPath.id ? byId : null;
    if (!media) {
      losses.push({ code: "image-media-mapping-unresolved", path: currentPath, detail: { src, wpId, matchedWpId: byId?.wp_id ?? null, matchedPathWpId: byPath?.wp_id ?? null } });
      return null;
    }
    inspectAttributes(element, currentPath, losses, ["src", "alt", "class"]);
    const stylingClasses = [...element.classList].filter((name) => !/^wp-image-\d+$/.test(name));
    if (stylingClasses.length) losses.push({ code: "image-classes-not-represented", path: currentPath, detail: stylingClasses.sort() });
    const alt = element.getAttribute("alt");
    if (alt === null) losses.push({ code: "image-alt-missing", path: currentPath, detail: { wpId } });
    else if (alt === "") losses.push({ code: "empty-image-alt-needs-editorial-decision", path: currentPath, detail: { wpId, suggestedDecorative: true } });
    if ((alt ?? "") !== (media.alt_text ?? "")) warnings.push({ code: "image-alt-differs-from-media-catalog", path: currentPath, detail: { wpId, htmlAlt: alt, catalogAlt: media.alt_text } });
    mediaRefs.add(`wp-media:${media.wp_id}`);
    return {
      type: "image",
      attrs: { mediaId: `wp-media:${media.wp_id}`, alt: alt ?? "", decorative: alt === "", caption },
    };
  }

  function block(element: Element, currentPath: string): JSONContent[] {
    const tag = element.tagName.toLowerCase();
    if (tag === "figure") {
      const images = [...element.querySelectorAll(":scope > img, :scope > a > img")];
      const captionElement = element.querySelector(":scope > figcaption");
      const caption = captionElement ? textContent(captionElement) : null;
      inspectAttributes(element, currentPath, losses, []);
      if (captionElement) {
        inspectAttributes(captionElement, `${currentPath}/figcaption`, losses, []);
        if (captionElement.querySelector("*")) losses.push({ code: "caption-formatting-not-represented", path: `${currentPath}/figcaption`, detail: { text: caption, sourceHtml: captionElement.innerHTML } });
      }
      for (const child of [...element.children]) {
        if (child === captionElement || child.tagName.toLowerCase() === "img" || child.querySelector("img")) continue;
        losses.push({ code: "figure-content-not-represented", path: currentPath, detail: { element: child.tagName.toLowerCase(), sourceHtml: child.outerHTML } });
      }
      for (const child of [...element.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? "").trim()) {
          losses.push({ code: "figure-text-not-represented", path: currentPath, detail: child.nodeValue });
        }
      }
      for (const child of [...element.children]) {
        if (child.tagName.toLowerCase() === "a" && child.querySelector("img")) {
          losses.push({ code: "linked-image-link-not-represented", path: currentPath, detail: { href: child.getAttribute("href") } });
          inspectAttributes(child, `${currentPath}/a`, losses, ["href"]);
        }
      }
      if (!images.length) {
        losses.push({ code: "figure-without-image", path: currentPath, detail: textContent(element) });
        return [];
      }
      if (images.length > 1) losses.push({ code: "caption-on-multiple-images", path: currentPath, detail: { imageCount: images.length, caption } });
      return images.map((image, index) => makeImage(image, `${currentPath}/img[${index}]`, index === 0 ? caption : null)).filter((image): image is JSONContent => image !== null);
    }
    if (tag === "img") {
      const image = makeImage(element, currentPath);
      return image ? [image] : [];
    }
    if (tag === "p" || tag === "div") {
      inspectAttributes(element, currentPath, losses, []);
      const hasBlockChildren = [...element.children].some((child) => /^(p|div|h[1-6]|ul|ol|blockquote|figure|hr)$/.test(child.tagName.toLowerCase()));
      if (tag === "div" && hasBlockChildren) return [...element.childNodes].flatMap((child, index) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childElement = child as Element;
          return block(childElement, `${currentPath}/${childElement.tagName.toLowerCase()}[${index}]`);
        }
        const text = inline(child, `${currentPath}/text[${index}]`);
        return text.length ? [{ type: "paragraph", content: text } as JSONContent] : [];
      });
      const content = [...element.childNodes].flatMap((child, index) => inline(child, `${currentPath}/${tag}[${index}]`));
      return content.length ? [{ type: "paragraph", content }] : [{ type: "paragraph" }];
    }
    if (/^h[1-6]$/.test(tag)) {
      inspectAttributes(element, currentPath, losses, []);
      const level = Number(tag.slice(1));
      const content = [...element.childNodes].flatMap((child, index) => inline(child, `${currentPath}/${tag}[${index}]`));
      if (level !== 2 && level !== 3) {
        losses.push({ code: "heading-level-not-supported", path: currentPath, detail: { sourceLevel: level, retainedText: textContent(element) } });
        return [{ type: "paragraph", ...(content.length ? { content } : {}) }];
      }
      return [{ type: "heading", attrs: { level }, ...(content.length ? { content } : {}) }];
    }
    if (tag === "hr") {
      inspectAttributes(element, currentPath, losses, []);
      return [{ type: "horizontalRule" }];
    }
    if (tag === "ul" || tag === "ol") {
      inspectAttributes(element, currentPath, losses, tag === "ol" ? ["start"] : []);
      const listItems = [...element.children].filter((child) => child.tagName.toLowerCase() === "li");
      if (listItems.length !== element.children.length) losses.push({ code: "list-child-not-supported", path: currentPath, detail: [...element.children].filter((child) => child.tagName.toLowerCase() !== "li").map((child) => child.outerHTML) });
      if ([...element.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? "").trim())) {
        losses.push({ code: "list-text-outside-list-item", path: currentPath, detail: [...element.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? "").trim()).map((child) => child.nodeValue) });
      }
      const content = listItems.map((item, index): JSONContent => {
        inspectAttributes(item, `${currentPath}/li[${index}]`, losses, []);
        const nestedLists = [...item.children].filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()));
        const inlineNodes = [...item.childNodes].filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes((child as Element).tagName.toLowerCase())))
          .flatMap((child, childIndex) => inline(child, `${currentPath}/li[${index}][${childIndex}]`));
        const itemContent: JSONContent[] = inlineNodes.length ? [{ type: "paragraph", content: inlineNodes }] : [{ type: "paragraph" }];
        nestedLists.forEach((nested, nestedIndex) => itemContent.push(...block(nested, `${currentPath}/li[${index}]/nested[${nestedIndex}]`)));
        return { type: "listItem", content: itemContent };
      });
      const startValue = tag === "ol" && element.hasAttribute("start") ? Number(element.getAttribute("start")) : undefined;
      const attrs = startValue !== undefined && Number.isInteger(startValue) && startValue > 0 ? { start: startValue } : undefined;
      if (startValue !== undefined && !attrs) losses.push({ code: "ordered-list-start-invalid", path: currentPath, detail: startValue });
      return [{ type: tag === "ul" ? "bulletList" : "orderedList", ...(attrs ? { attrs } : {}), content }];
    }
    if (tag === "blockquote") {
      inspectAttributes(element, currentPath, losses, []);
      const content = [...element.childNodes].flatMap((child, index) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childElement = child as Element;
          return block(childElement, `${currentPath}/${childElement.tagName.toLowerCase()}[${index}]`);
        }
        const text = inline(child, `${currentPath}/text[${index}]`);
        return text.length ? [{ type: "paragraph", content: text } as JSONContent] : [];
      });
      return [{ type: "blockquote", ...(content.length ? { content } : {}) }];
    }
    if (tag === "button") {
      losses.push({ code: "interactive-button-not-represented", path: currentPath, detail: { element: tag, text: textContent(element), href: element.getAttribute("href") } });
      const content = [...element.childNodes].flatMap((child, index) => inline(child, `${currentPath}/${tag}[${index}]`));
      return content.length ? [{ type: "paragraph", content }] : [];
    }
    if (tag === "a" && element.classList.contains("wp-block-button__link")) {
      const content = inline(element, currentPath);
      return [{ type: "paragraph", ...(content.length ? { content } : {}) }];
    }
    inspectAttributes(element, currentPath, losses, []);
    losses.push({ code: "unsupported-block-element", path: currentPath, detail: { element: tag, sourceHtml: element.outerHTML } });
    const content = [...element.childNodes].flatMap((child, index) => {
      if (child.nodeType === Node.ELEMENT_NODE) return block(child as Element, `${currentPath}/${(child as Element).tagName.toLowerCase()}[${index}]`);
      const text = inline(child, `${currentPath}/text[${index}]`);
      return text.length ? [{ type: "paragraph", content: text } as JSONContent] : [];
    });
    return content.length ? content : (textContent(element) ? [{ type: "paragraph", content: [{ type: "text", text: textContent(element) }] }] : []);
  }

  const content: JSONContent[] = [];
  let childIndex = 0;
  for (const child of [...document.body.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) {
      const comment = child.nodeValue ?? "";
      if (!/^\s*\/?wp:[\w/-]+(?:\s+\{.*\})?\s*$/.test(comment) && comment.trim()) {
        losses.push({ code: "html-comment-not-represented", path: `comment[${childIndex}]`, detail: comment.trim() });
      }
      childIndex += 1;
      continue;
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      content.push(...block(element, `${element.tagName.toLowerCase()}[${childIndex}]`));
    }
    else if (child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? "").trim()) {
      content.push({ type: "paragraph", content: [{ type: "text", text: child.nodeValue ?? "" }] });
    }
    childIndex += 1;
  }
  const documentJson: JSONContent = { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
  dom.window.close();
  return { document: documentJson, losses, warnings, mediaRefs: [...mediaRefs].sort() };
}

export async function convertBlogSources(root: string, selectedWpId?: number) {
  await assertSourceTree(root);
  const source = await readSourceJsonSnapshot(root);
  const posts = source.data.posts as SourcePost[];
  const media = source.data.media as SourceMedia[];
  const dryRun = analyzeBlogSources(root, source.data);
  const mediaByWpId = new Map(media.map((item) => [item.wp_id, item]));
  const mediaByPath = new Map(media.map((item) => [item.storage_path, item]));
  const articles = [];

  for (const post of posts.filter((item) => item.status === "published" && (selectedWpId === undefined || item.wp_id === selectedWpId)).sort((a, b) => a.wp_id - b.wp_id)) {
    const sourceReport = dryRun.articles.find((article) => article.wpId === post.wp_id);
    const converted = convertBlogHtml(post.content_html, post.wp_id, mediaByWpId, mediaByPath);
    const sourceMediaWpIds = new Set([
      ...(sourceReport?.cover ? [sourceReport.cover.wpId] : []),
      ...(sourceReport?.images.flatMap((image) => image.wpId === null ? [] : [image.wpId]) ?? []),
    ]);
    const validationErrors: string[] = [];
    try {
      await validateBlogDocument(converted.document, {
        schemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION,
        hasMedia: (mediaId) => mediaId.startsWith("wp-media:") && converted.mediaRefs.includes(mediaId),
      });
    } catch (error) {
      validationErrors.push(error instanceof Error ? error.message : String(error));
    }
    const articleBlockers = dryRun.blockers.filter((item) => item.postWpId === post.wp_id || item.type === "duplicate-source-key" || (typeof item.wpId === "number" && sourceMediaWpIds.has(item.wpId)));
    if (validationErrors.length) converted.losses.push({ code: "shared-schema-validation-failed", path: "document", detail: validationErrors });
    articles.push({
      source: {
        wpId: post.wp_id,
        localId: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        seoTitle: post.seo_title,
        seoDescription: post.seo_description,
        publishedAt: post.published_at,
        publishedAtUtc: sourceReport?.publishedAtUtc ?? null,
        url: sourceReport?.url ?? null,
        categories: sourceReport?.categories.map(({ id, wpId, name, slug }) => ({ sourceLocalId: id, wpId, name, slug })) ?? [],
        coverMedia: sourceReport?.cover ? {
          ref: `wp-media:${sourceReport.cover.wpId}`,
          localId: sourceReport.cover.localId,
          wpId: sourceReport.cover.wpId,
          storagePath: sourceReport.cover.storagePath,
          catalogAlt: mediaByWpId.get(sourceReport.cover.wpId)?.alt_text ?? null,
        } : null,
      },
      status: converted.losses.length || articleBlockers.length ? "blocked-review" : "review-required",
      documentSchemaVersion: BLOG_DOCUMENT_SCHEMA_VERSION,
      mediaIdNamespace: "wp-media:<wordpress-media-wp_id>; source reference only, not a destination database id",
      document: converted.document,
      mediaRefs: converted.mediaRefs,
      losses: converted.losses,
      warnings: converted.warnings,
      sourceBlockers: articleBlockers,
      schemaValid: validationErrors.length === 0,
      importAllowed: false,
    });
  }

  if (selectedWpId !== undefined && !articles.length) {
    return { mode: "offline-conversion-only", status: "blocked-source-post-not-found", importAllowed: false, sourceJsonSha256: source.sourceJsonSha256, sourceSha256: sourceManifestSha256(source, { bytesById: new Map(), entries: [] }), summary: { articles: 0, schemaValid: 0, blockedReview: 0, losses: 0, warnings: 0 }, articles: [] };
  }
  const usedWpIds = new Set(articles.flatMap((article) => [
    ...article.mediaRefs.map((ref) => Number(ref.slice("wp-media:".length))),
    ...(article.source.coverMedia ? [article.source.coverMedia.wpId] : []),
  ]));
  const selectedMedia = media.filter((item) => usedWpIds.has(item.wp_id));
  if (selectedMedia.length !== usedWpIds.size) throw new Error("conversion source media mapping is incomplete");
  const mediaSnapshot = await snapshotMediaFiles(selectedMedia, async (item) => readFile(await resolveMediaFile(root, item.storage_path)));
  const sourceSha256 = sourceManifestSha256(source, mediaSnapshot);
  const blockedReview = articles.filter((article) => article.status === "blocked-review").length;
  return {
    mode: "offline-conversion-only",
    sourceJsonSha256: source.sourceJsonSha256,
    sourceSha256,
    status: articles.some((article) => article.status === "blocked-review") ? "blocked-review" : "review-required",
    importAllowed: false,
    summary: {
      articles: articles.length,
      schemaValid: articles.filter((article) => article.schemaValid).length,
      blockedReview,
      losses: articles.reduce((total, article) => total + article.losses.length, 0),
      warnings: articles.reduce((total, article) => total + article.warnings.length, 0),
    },
    articles,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const root = args.find((arg) => !arg.startsWith("--")) ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const postArgument = args.find((arg) => arg.startsWith("--post="));
    const selectedWpId = postArgument ? Number(postArgument.slice("--post=".length)) : undefined;
    if (selectedWpId !== undefined && (!Number.isSafeInteger(selectedWpId) || selectedWpId <= 0)) throw new Error("--post must be a positive WordPress post id");
    const report = await convertBlogSources(root, selectedWpId);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.status === "blocked-review" || report.status === "blocked-source-post-not-found" ? 1 : 0;
  } catch (error) {
    process.stderr.write(`blog offline conversion failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
