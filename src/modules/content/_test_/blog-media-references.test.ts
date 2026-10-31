import { describe, expect, it } from "vitest";
import { documentReferencesMedia } from "../blog-media-references";

describe("published document media references", () => {
  it("matches serialized numeric media IDs but rejects invalid references", () => {
    const document = { type: "doc", content: [{ type: "image", attrs: { mediaId: "42" } }] };
    expect(documentReferencesMedia(document, 42)).toBe(true);
    expect(documentReferencesMedia(document, 43)).toBe(false);
    expect(documentReferencesMedia({ type: "image", attrs: { mediaId: "42x" } }, 42)).toBe(false);
    expect(documentReferencesMedia({ type: "image", attrs: { mediaId: "042" } }, 42)).toBe(false);
  });
});
