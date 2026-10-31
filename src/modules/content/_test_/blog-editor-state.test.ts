import { expect, it } from "vitest";
import { imageAttributesFromChoice, mergeReconciledPublication, withPublicationState } from "../blog-editor-state";

it("updates publication state without changing draft fields", () => {
  const draft = { title: "Artículo", version: 4, publication: null };
  const published = withPublicationState(draft, true);
  expect(published).toMatchObject({ title: draft.title, version: draft.version });
  expect(published.publication).not.toBeNull();
  expect(withPublicationState(published, false).publication).toBeNull();
});

it("requires an explicit image purpose and alternative text for informative images", () => {
  expect(imageAttributesFromChoice("", "", "" )).toBeNull();
  expect(imageAttributesFromChoice("informative", "  ", "caption")).toBeNull();
  expect(imageAttributesFromChoice("informative", "A beach at sunset", "Evening light")).toEqual({ alt: "A beach at sunset", decorative: false, caption: "Evening light" });
  expect(imageAttributesFromChoice("decorative", "ignored", "")).toEqual({ alt: "", decorative: true, caption: null });
});

it("reconciles publication without replacing local edits and rejects a stale remote version", () => {
  type Draft = { title: string; document: { type: string; content: { type: string }[] }; version: number; publication: { publishedAt: string } | null };
  const local: Draft = { title: "Unsaved local title", document: { type: "doc", content: [{ type: "paragraph" }] }, version: 7, publication: null };
  const remote: Draft = { title: "Older server title", document: { type: "doc", content: [] }, version: 7, publication: { publishedAt: "today" } };
  expect(mergeReconciledPublication(local, remote, 7)).toEqual({ ...local, publication: remote.publication });
  expect(mergeReconciledPublication(local, { ...remote, version: 8 }, 7)).toBeNull();
  expect(mergeReconciledPublication(local, remote, 8)).toBeNull();
});
