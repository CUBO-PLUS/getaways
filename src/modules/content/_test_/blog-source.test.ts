import { describe, expect, it } from "vitest";
import { resolveBlogContentSource } from "@/modules/content/blog-source";

describe("blog content source", () => {
  it("keeps the existing static source until explicitly switched", () => {
    expect(resolveBlogContentSource(undefined)).toBe("static");
    expect(resolveBlogContentSource("static")).toBe("static");
    expect(resolveBlogContentSource("postgres")).toBe("postgres");
  });

  it("rejects unknown source values instead of silently falling back", () => {
    expect(() => resolveBlogContentSource("postgres-or-static")).toThrow("Invalid BLOG_CONTENT_SOURCE");
  });
});
