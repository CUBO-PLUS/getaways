import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { analyzeBlogSources } from "../../../scripts/blog-import-dry-run.mjs";
import { convertBlogSources } from "../../../scripts/blog-import-convert.mts";

const roots: string[] = [];

function fixture({ withMedia = true, publishedAt = "2024-02-01T00:30:00+02:00", contentHtml = '<!-- wp:image {"id":77,"width":"600px"} --><figure class="wp-block-image"><img src="/media/2024/02/photo.jpg" alt="Alt" class="wp-image-77"/><figcaption>Caption</figcaption></figure><!-- /wp:image --><p style="color:red">Text</p>' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "blog-dry-run-"));
  roots.push(root);
  mkdirSync(path.join(root, "data"), { recursive: true });
  mkdirSync(path.join(root, "public/media", "2024/02"), { recursive: true });
  const data = {
    posts: [{ id: 10, wp_id: 901, slug: "sample", title: "Sample", content_html: contentHtml, excerpt: "", published_at: publishedAt, author_wp_id: 1, seo_title: null, seo_description: null, featured_media_id: 5, status: "published" }],
    terms: [{ id: 3, wp_id: 33, taxonomy: "category", name: "Tips", slug: "tips", parent_id: null }],
    post_terms: [{ post_id: 10, term_id: 3 }],
    media: [{ id: 5, wp_id: 77, storage_path: "2024/02/photo.jpg", original_filename: "photo.jpg", alt_text: "metadata alt" }],
  };
  for (const [name, rows] of Object.entries(data)) writeFileSync(path.join(root, "data", `${name}.json`), JSON.stringify(rows));
  if (withMedia) writeFileSync(path.join(root, "public/media/2024/02/photo.jpg"), "original");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each(["2024-02-30T00:30:00Z", "2024-02-01T00:30:00", "2024-02-01T00:30:00.1234567Z"])(
  "blocks invalid or over-precision source publication dates (%s)", (publishedAt) => {
    const report = analyzeBlogSources(fixture({ publishedAt }));
    expect(report.blockers).toContainEqual(expect.objectContaining({ type: "invalid-published-date" }));
    expect(report.articles[0].url).toBeNull();
  },
);

it("resolves UTC URL and both media ID domains without losing review findings", () => {
  const report = analyzeBlogSources(fixture());
  const [article] = report.articles;
  expect(article.url).toBe("/2024/01/31/sample");
  expect(article.publishedAtUtc).toBe("2024-01-31T22:30:00Z");
  expect(article.categories.map(({ slug }) => slug)).toEqual(["tips"]);
  expect(article.cover).toMatchObject({ localId: 5, wpId: 77, fileExists: true });
  expect(article.images[0]).toMatchObject({ wpId: 77, mediaLocalId: 5, status: "resolved" });
  expect(article.captions).toEqual(["Caption"]);
  expect(article.blockAttributes).toEqual([{ name: "image", attributes: { id: 77, width: "600px" } }]);
  expect(article.htmlAttributes).toEqual(expect.arrayContaining([
    { tag: "p", attributes: [{ name: "style", value: "color:red" }] },
  ]));
  expect(report.summary.blockers).toBe(0);
  expect(report.summary.warnings).toBeGreaterThan(0);
});

it("reports missing referenced files as blockers", () => {
  const report = analyzeBlogSources(fixture({ withMedia: false }));
  expect(report.blockers).toContainEqual(expect.objectContaining({ type: "missing-media-file", mediaLocalId: 5 }));
  expect(report.summary.blockers).toBeGreaterThan(0);
});

it("returns a failing CLI exit code when references are missing", () => {
  const root = fixture({ withMedia: false });
  const script = path.resolve(import.meta.dirname, "../../../scripts/blog-import-dry-run.mjs");
  const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).blockers).toContainEqual(expect.objectContaining({ type: "missing-media-file" }));
}, 15_000);

it.each([
  ["dry-run", "blog-import-dry-run.mjs"],
  ["convert", "blog-import-convert.mts"],
])("requires an explicit source root for blog %s", (command, filename) => {
  const script = path.resolve(import.meta.dirname, "../../../scripts", filename);
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-strip-types", script], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "invalid-test-database-url" },
    timeout: 10_000,
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain(`usage: pnpm blog:${command} <source-root>`);
  expect(result.stdout).toBe("");
}, 15_000);

it("converts supported content to the shared schema with a source-only media ID and remains non-importable", async () => {
  const root = fixture();
  const report = await convertBlogSources(root, 901);
  const [article] = report.articles;
  expect(article.documentSchemaVersion).toBe(1);
  expect(article.document.content?.[0]).toMatchObject({ type: "image", attrs: { mediaId: "wp-media:77", caption: "Caption" } });
  expect(article.source.coverMedia?.ref).toBe("wp-media:77");
  expect(article.schemaValid).toBe(true);
  expect(article.status).toBe("blocked-review");
  expect(article.importAllowed).toBe(false);
  expect(article.losses).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "gutenberg-block-attributes-not-represented" }),
    expect.objectContaining({ code: "html-attribute-not-represented" }),
  ]));
});

it("preserves button-link CTA text and destination while reporting style and unrelated attributes", async () => {
  const contentHtml = '<!-- wp:buttons --><!-- wp:button --><div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/contact-us" id="/contact-us" type="link">CONTACT US</a></div></div><!-- /wp:button --><!-- /wp:buttons -->';
  const report = await convertBlogSources(fixture({ contentHtml }), 901);
  const [article] = report.articles;
  type ContentNode = { text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: ContentNode[] };
  const matches: ContentNode[] = [];
  const visit = (node: ContentNode) => {
    if (node.text?.includes("CONTACT")) matches.push(node);
    node.content?.forEach(visit);
  };
  visit(article.document);

  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({ text: "CONTACT US", marks: [{ type: "link", attrs: { href: "/contact-us" } }] });
  expect(article.losses).not.toContainEqual(expect.objectContaining({ code: "interactive-button-not-represented" }));
  expect(article.losses).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "html-attribute-not-represented", detail: { element: "a", name: "id", value: "/contact-us" } }),
    expect.objectContaining({ code: "html-attribute-not-represented", detail: { element: "a", name: "type", value: "link" } }),
  ]));
  expect(article.warnings).toContainEqual(expect.objectContaining({ code: "button-style-not-represented", detail: expect.objectContaining({ destination: expect.stringContaining("button visual styling is not represented") }) }));
});

it("retains text from unsupported structures but explicitly blocks the partial conversion", async () => {
  const root = fixture({ contentHtml: "<table><tbody><tr><td>Preserve this text</td></tr></tbody></table>" });
  const report = await convertBlogSources(root, 901);
  const [article] = report.articles;
  expect(JSON.stringify(article.document)).toContain("Preserve this text");
  expect(article.losses).toContainEqual(expect.objectContaining({ code: "unsupported-block-element" }));
  expect(article.schemaValid).toBe(true);
  expect(article.status).toBe("blocked-review");
  expect(article.importAllowed).toBe(false);
  const script = path.resolve(import.meta.dirname, "../../../scripts/blog-import-convert.mts");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", script, root, "--post=901"], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).status).toBe("blocked-review");
}, 15_000);
