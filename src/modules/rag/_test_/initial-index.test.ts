import { describe, expect, it } from "vitest";
import { chunkRagSource, extractBlogPublication, extractPublicListing, isIndexableRagSource } from "@/modules/rag/initial-index";

describe("initial RAG extraction", () => {
  it("rejects empty extracted content and accepts a non-empty section", () => {
    const source = extractPublicListing({ id: 1, slug: "empty", title: " ", contentHtml: "", attributes: {} });
    expect(isIndexableRagSource(source)).toBe(false);
    expect(isIndexableRagSource({ ...source, title: "Título", sections: [{ title: "Descripción", text: "contenido" }] })).toBe(true);
  });
  it("uses published blog content, preserving links and image captions", () => {
    const source = extractBlogPublication({
      postId: 4,
      slug: "la-playa",
      title: "La playa",
      excerpt: "Arena & mar",
      publishedAt: "2026-10-11T12:00:00Z",
      document: { type: "doc", content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Cómo llegar" }] },
        { type: "paragraph", content: [{ type: "text", text: "Mapa", marks: [{ type: "link", attrs: { href: "https://example.test/map" } }] }] },
        { type: "image", attrs: { decorative: false, alt: "Bahía", caption: "Al atardecer" } },
        { type: "image", attrs: { decorative: true, alt: "Decorativa" } },
      ] },
    });

    expect(source.url).toBe("/2026/10/11/la-playa");
    expect(source.sections.map(({ text }) => text)).toEqual(["La playa", "Arena & mar", "Encabezado: Cómo llegar", "Mapa (https://example.test/map)", "Al atardecer"]);
    expect(source.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("excludes scripts, styles and non-public listing attributes; chunks without losing text", () => {
    const source = extractPublicListing({
      id: 7,
      slug: "casa-mar",
      title: "Casa Mar",
      contentHtml: "<!-- getaways:grapes Zm9v --> <style>.private{color:red}</style><h2>Vista &amp; mar</h2><p>Hola <script>secret()</script>mundo</p><ul><li>Primero</li><li>Segundo</li></ul>",
      attributes: { location: "Costa", bedrooms: 2, wifi: "1", pool: true, garden: "true", elevator: "yes", accountEmail: "private@example.test" },
      maxGuests: 4,
    });
    const text = source.sections.map(({ text }) => text).join(" ");
    expect(source.url).toBe("/listing/casa-mar");
    expect(text).toContain("Vista & mar");
    expect(text).toContain("Hola mundo");
    expect(source.sections.some(({ title }) => title === "Encabezado")).toBe(true);
    expect(text).toContain("Costa");
    expect(text).toContain("wifi");
    expect(text).toContain("Primero");
    expect(text).toContain("Segundo");
    expect(text).not.toMatch(/pool|garden|elevator/);
    expect(text).not.toMatch(/private|secret|base64|color:red/);

    const chunks = chunkRagSource({ ...source, sections: [{ title: "Long", text: "uno dos tres cuatro cinco" }] }, 8);
    expect(chunks.map(({ text }) => text).join(" ")).toBe("uno dos tres cuatro cinco");
    expect(chunks.every(({ text }) => text.length <= 8)).toBe(true);
  });

  it("extracts explicit public listing facts and pet policy terms without inferring from amenities", () => {
    const source = extractPublicListing({ id: 8, slug: "casa", title: "Casa", contentHtml: "", attributes: { cats: "1" },
      minStayNights: 3, checkInSeconds: 54_000, checkOutSeconds: 39_600, petsTerms: ["Pets allowed with fee"] });
    expect(source.sections.map(({ title, text }) => [title, text])).toContainEqual(["Estadía mínima (noches)", "3"]);
    expect(source.sections.map(({ title, text }) => [title, text])).toContainEqual(["Check-in", "15:00:00 (54000 segundos desde medianoche)"]);
    expect(source.sections.map(({ title, text }) => [title, text])).toContainEqual(["Check-out", "11:00:00 (39600 segundos desde medianoche)"]);
    expect(source.sections.map(({ title, text }) => [title, text])).toContainEqual(["Política de mascotas", "Pets allowed with fee"]);
    expect(source.sections.some(({ title }) => title === "Mascotas")).toBe(false);
    expect(extractPublicListing({ id: 8, slug: "casa", title: "Casa", contentHtml: "", attributes: {} }).contentHash).not.toBe(source.contentHash);
  });
});
