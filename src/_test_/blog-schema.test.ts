import { describe, expect, it } from "vitest";
import { validateBlogDocument } from "../modules/content/blog-schema";
import { renderToStaticMarkup } from "react-dom/server";
import { renderBlogDocument } from "../modules/content/blog-renderer";

const validate = (document: unknown) => validateBlogDocument(document, {
  schemaVersion: 1,
  hasMedia: (id) => id === "media-1",
});

describe("validateBlogDocument", () => {
  it("accepts supported content and decorative images, but rejects unknown content without dropping it", async () => {
    const valid = await validate({ type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Story" }] },
      { type: "image", attrs: { mediaId: "media-1", alt: "", decorative: true, caption: "Caption" } },
    ] });
    expect(valid.content).toHaveLength(2);
    await expect(validate({ type: "doc", content: [{ type: "futureWidget" }] })).rejects.toThrow("unsupported node");
  });

  it("rejects unsafe links and unresolved or inaccessible images", async () => {
    await expect(validate({ type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "bad", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
    ] }] })).rejects.toThrow("unsafe link");
    await expect(validate({ type: "doc", content: [{ type: "image", attrs: {
      mediaId: "missing", alt: "Photo", decorative: false,
    } }] })).rejects.toThrow("unknown media reference");
  });

  it("requires complete image and heading attributes and restricts marks to text with declared attrs", async () => {
    await expect(validate({ type: "doc", content: [{ type: "image" }] })).rejects.toThrow();
    await expect(validate({ type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Title" }] }] })).rejects.toThrow("heading level is required");
    await expect(validate({ type: "doc", content: [{ type: "paragraph", marks: [{ type: "bold", attrs: { arbitrary: true } }] }] })).rejects.toThrow("marks are only allowed on text nodes");
    await expect(validate({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold", attrs: { arbitrary: "x" } }] }] }] })).rejects.toThrow("unsupported mark attribute");
    await expect(validate({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold", attrs: "bad" }] }] }] })).rejects.toThrow("invalid mark attributes");
  });

  it("bounds deep input before serialization and only renders stable app-relative media paths", async () => {
    let deep: Record<string, unknown> = { type: "paragraph" };
    for (let i = 0; i < 30_000; i++) deep = { type: "blockquote", content: [deep] };
    await expect(validate({ type: "doc", content: [deep] })).rejects.toThrow("structural limits");

    const image = await validate({ type: "doc", content: [{ type: "image", attrs: {
      mediaId: "media-1", alt: "Photo", decorative: false,
    } }] });
    expect(() => renderToStaticMarkup(renderBlogDocument(image, () => "https://outside.example/photo.jpg"))).toThrow("relative application path");
    expect(() => renderToStaticMarkup(renderBlogDocument(image, () => "/api/blog/media/../admin"))).toThrow("traversal segments");
    expect(() => renderToStaticMarkup(renderBlogDocument(image, () => "/api/blog/media/%2e%2e/admin"))).toThrow("traversal segments");
    expect(renderToStaticMarkup(renderBlogDocument(image, () => "/api/blog/media/media-1"))).toContain('src="/api/blog/media/media-1"');
  });

  it("counts the complete serialized JSON byte size, including syntax and escaping", async () => {
    const withSyntaxOverhead = "x".repeat(999_980);
    await expect(validate({ type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: withSyntaxOverhead },
    ] }] })).rejects.toThrow("document is too large");
    await expect(validate({ type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "\0".repeat(180_000) },
    ] }] })).rejects.toThrow("document is too large");
  });
});
