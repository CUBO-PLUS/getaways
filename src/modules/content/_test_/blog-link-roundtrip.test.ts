// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BLOG_CONTENT_EXTENSIONS, validateBlogDocument } from "../blog-schema";
import { renderBlogDocument } from "../blog-renderer";

const options = { schemaVersion: 1, hasMedia: () => false };

it("round-trips imported and editor-created links through validation and rendering", async () => {
  const editor = new Editor({
    extensions: BLOG_CONTENT_EXTENSIONS,
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "sitio", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] }] },
  });

  try {
    const imported = await validateBlogDocument(editor.getJSON(), options);
    expect(imported.content?.[0].content?.[0].marks?.[0].attrs).toMatchObject({ href: "https://example.com", rel: "noopener noreferrer" });

    editor.commands.setTextSelection({ from: 1, to: 1 });
    editor.commands.insertContent(" nuevo");
    editor.commands.setTextSelection({ from: 6, to: 11 });
    editor.commands.setLink({ href: "https://created.example" });
    const saved = await validateBlogDocument(editor.getJSON(), options);
    expect(JSON.stringify(saved)).toContain('"href":"https://created.example"');
    expect(renderToStaticMarkup(renderBlogDocument(saved, () => ""))).toContain('href="https://created.example"');
  } finally {
    editor.destroy();
  }
});
