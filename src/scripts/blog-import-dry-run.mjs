import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { publicationInstant } from "../modules/content/publication-instant.mjs";

function readJson(root, name) {
  return JSON.parse(readFileSync(path.join(root, "data", `${name}.json`), "utf8"));
}

function safeMediaPath(root, storagePath) {
  if (typeof storagePath !== "string" || !storagePath || path.isAbsolute(storagePath)) return null;
  const normalized = storagePath.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  const fullPath = path.resolve(root, "public/media", normalized);
  return fullPath.startsWith(`${path.resolve(root, "public/media")}${path.sep}`) ? fullPath : null;
}

function dateAndPath(post) {
  let instant;
  try { instant = publicationInstant(post.published_at); } catch { return null; }
  const iso = instant.toString();
  const [year, month, day] = iso.slice(0, 10).split("-");
  return { publishedAtUtc: iso, url: `/${year}/${month}/${day}/${post.slug}` };
}

function inspectHtml(html, mediaByWpId, mediaByPath, blockers, postWpId) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const internalImages = [];
  const captions = [];
  const attributes = [];
  for (const element of document.body.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    const attrs = [...element.attributes]
      .filter(({ name }) => !["src", "alt", "href"].includes(name))
      .map(({ name, value }) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    if (attrs.length) attributes.push({ tag, attributes: attrs });
    if (tag === "figcaption") captions.push(element.textContent.trim());
    if (tag !== "img") continue;

    const src = element.getAttribute("src") ?? "";
    const wpClass = [...element.classList].map((name) => /^wp-image-(\d+)$/.exec(name)?.[1]).find(Boolean);
    const wpId = wpClass ? Number(wpClass) : null;
    const pathKey = src.startsWith("/media/") ? src.slice("/media/".length) : null;
    const byWpId = wpId === null ? null : mediaByWpId.get(wpId);
    const byPath = pathKey === null ? null : mediaByPath.get(pathKey);
    const matched = byWpId && byPath && byWpId.id === byPath.id ? byWpId : null;
    const status = matched ? "resolved" : "missing";
    if (status === "missing") blockers.push({
      type: "internal-image-reference",
      postWpId,
      src,
      wpId,
      reason: !wpId ? "missing-wp-image-id" : !pathKey ? "non-local-media-src" : !byWpId ? "unknown-wp-id" : !byPath ? "unknown-storage-path" : "id-path-mismatch",
    });
    internalImages.push({
      src,
      wpId,
      mediaLocalId: matched?.id ?? null,
      storagePath: matched?.storage_path ?? null,
      alt: element.getAttribute("alt"),
      status,
    });
  }

  const gutenbergBlocks = [];
  for (const match of html.matchAll(/<!--\s*wp:([\w/-]+)(?:\s+(\{.*?\}))?\s*-->/gs)) {
    let attributesValue = null;
    if (match[2]) {
      try { attributesValue = JSON.parse(match[2]); }
      catch { blockers.push({ type: "invalid-gutenberg-attributes", postWpId, block: match[1], raw: match[2] }); }
    }
    gutenbergBlocks.push({ name: match[1], attributes: attributesValue });
  }
  const blockCounts = new Map();
  for (const block of gutenbergBlocks) blockCounts.set(block.name, (blockCounts.get(block.name) ?? 0) + 1);
  const blocks = [...blockCounts].map(([name, count]) => ({
    name,
    count,
    reviewRequired: !["paragraph", "heading", "separator", "image", "list", "list-item", "quote"].includes(name),
  })).sort((a, b) => a.name.localeCompare(b.name, "en"));
  const blockAttributes = gutenbergBlocks
    .filter((block) => block.attributes && Object.keys(block.attributes).length)
    .map((block) => ({ name: block.name, attributes: block.attributes }))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || JSON.stringify(a.attributes).localeCompare(JSON.stringify(b.attributes), "en"));
  dom.window.close();
  return { internalImages, captions, attributes, blocks, blockAttributes };
}

export function analyzeBlogSources(root, sourceData) {
  const posts = (sourceData?.posts ?? readJson(root, "posts")).filter((post) => post.status === "published");
  const terms = sourceData?.terms ?? readJson(root, "terms");
  const relations = sourceData?.post_terms ?? readJson(root, "post_terms");
  const media = sourceData?.media ?? readJson(root, "media");
  const blockers = [];
  const warnings = [];
  const postIds = new Set(posts.map((post) => post.id));
  const termById = new Map(terms.map((term) => [term.id, term]));
  const mediaByLocalId = new Map(media.map((item) => [item.id, item]));
  const mediaByWpId = new Map(media.map((item) => [item.wp_id, item]));
  const mediaByPath = new Map(media.map((item) => [item.storage_path, item]));
  const categoriesByPost = new Map(posts.map((post) => [post.id, []]));
  const referencedMediaIds = new Set();

  for (const [kind, rows, key] of [["post-wp-id", posts, "wp_id"], ["category-wp-id", terms, "wp_id"], ["media-wp-id", media, "wp_id"], ["media-storage-path", media, "storage_path"]]) {
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row[key])) blockers.push({ type: "duplicate-source-key", kind, value: row[key] });
      seen.add(row[key]);
    }
  }

  for (const relation of relations) {
    if (!postIds.has(relation.post_id)) continue;
    const term = termById.get(relation.term_id);
    if (!term) blockers.push({ type: "missing-category", postWpId: posts.find((post) => post.id === relation.post_id)?.wp_id ?? null, termId: relation.term_id });
    else if (term.taxonomy === "category") categoriesByPost.get(relation.post_id).push({ id: term.id, wpId: term.wp_id, name: term.name, slug: term.slug });
  }

  const articleReports = posts.map((post) => {
    const date = dateAndPath(post);
    if (!date) blockers.push({ type: "invalid-published-date", postWpId: post.wp_id, value: post.published_at });
    const cover = mediaByLocalId.get(post.featured_media_id);
    if (!cover) blockers.push({ type: "missing-cover-media", postWpId: post.wp_id, featuredMediaLocalId: post.featured_media_id });
    else referencedMediaIds.add(cover.id);
    const body = inspectHtml(post.content_html, mediaByWpId, mediaByPath, blockers, post.wp_id);
    for (const image of body.internalImages) if (image.mediaLocalId !== null) referencedMediaIds.add(image.mediaLocalId);
    const articleWarnings = [];
    if (body.captions.length) articleWarnings.push({ type: "captions-require-review", count: body.captions.length, captions: body.captions });
    const reviewBlocks = body.blocks.filter((block) => block.reviewRequired);
    if (reviewBlocks.length) articleWarnings.push({ type: "unsupported-blocks-require-review", blocks: reviewBlocks });
    if (body.blockAttributes.length) articleWarnings.push({ type: "gutenberg-attributes-require-review", attributes: body.blockAttributes });
    if (body.attributes.length) articleWarnings.push({ type: "html-attributes-require-review", elements: body.attributes });
    warnings.push(...articleWarnings.map((warning) => ({ postWpId: post.wp_id, ...warning })));
    return {
      id: post.id,
      wpId: post.wp_id,
      title: post.title,
      slug: post.slug,
      publishedAt: post.published_at,
      ...(date ?? { publishedAtUtc: null, url: null }),
      categories: categoriesByPost.get(post.id).sort((a, b) => a.slug.localeCompare(b.slug, "en")),
      cover: cover ? { localId: cover.id, wpId: cover.wp_id, storagePath: cover.storage_path, fileExists: Boolean(safeMediaPath(root, cover.storage_path) && existsSync(safeMediaPath(root, cover.storage_path))) } : null,
      images: body.internalImages.sort((a, b) => (a.src + a.wpId).localeCompare(b.src + b.wpId, "en")),
      blocks: body.blocks,
      blockAttributes: body.blockAttributes,
      captions: body.captions,
      htmlAttributes: body.attributes,
    };
  }).sort((a, b) => a.wpId - b.wpId);

  const mediaFiles = [...referencedMediaIds].map((id) => {
    const item = mediaByLocalId.get(id);
    const file = safeMediaPath(root, item.storage_path);
    const fileExists = Boolean(file && existsSync(file));
    if (!fileExists) blockers.push({ type: "missing-media-file", mediaLocalId: id, wpId: item.wp_id, storagePath: item.storage_path });
    return { localId: id, wpId: item.wp_id, storagePath: item.storage_path, fileExists };
  }).sort((a, b) => a.wpId - b.wpId);

  blockers.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
  warnings.sort((a, b) => a.postWpId - b.postWpId || a.type.localeCompare(b.type, "en"));
  return {
    schemaVersion: 1,
    mode: "read-only-dry-run",
    sourceCounts: { publishedPosts: posts.length, categories: terms.filter((term) => term.taxonomy === "category").length, relationsForPosts: relations.filter((relation) => postIds.has(relation.post_id)).length },
    articles: articleReports,
    mediaFiles,
    summary: { blockers: blockers.length, warnings: warnings.length, missingMediaFiles: blockers.filter((item) => item.type === "missing-media-file").length, unresolvedImages: blockers.filter((item) => item.type === "internal-image-reference").length },
    blockers,
    warnings,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [sourceRoot, ...extra] = process.argv.slice(2);
    if (!sourceRoot || sourceRoot.startsWith("--") || extra.length) throw new Error("usage: pnpm blog:dry-run <source-root>");
    const report = analyzeBlogSources(path.resolve(sourceRoot));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.summary.blockers ? 1 : 0;
  } catch (error) {
    process.stderr.write(`blog dry-run failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
