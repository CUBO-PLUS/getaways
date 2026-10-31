import { expect, it } from "vitest";
import type { BlogDocument } from "../blog-schema";
import { validatePublishableBlogPost } from "../blog-publication-validation";

const empty: BlogDocument = { type: "doc", content: [{ type: "paragraph" }] };
const post = { title: "Artículo", document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Contenido" }] }] } as BlogDocument, coverMediaId: null, coverAlt: null };

it("allows empty drafts but refuses empty or untitled publication", () => {
  expect(validatePublishableBlogPost({ ...post, title: "", document: empty })).toContain("título");
  expect(validatePublishableBlogPost({ ...post, document: empty })).toContain("texto");
  expect(validatePublishableBlogPost(post)).toBeNull();
});

it("requires alternative text only when a cover is set", () => {
  expect(validatePublishableBlogPost({ ...post, coverMediaId: 12, coverAlt: " " })).toContain("alternativo");
  expect(validatePublishableBlogPost({ ...post, coverMediaId: 12, coverAlt: "Vista del jardín" })).toBeNull();
});
