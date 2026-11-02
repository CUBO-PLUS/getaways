import { expect, it } from "vitest";
import { imageAttributesFromChoice, mergeReconciledPublication } from "../blog-editor-state";

it("requires an explicit image purpose and alternative text for informative images", () => {
  expect(imageAttributesFromChoice("", "", "" )).toBeNull();
  expect(imageAttributesFromChoice("informative", "  ", "caption")).toBeNull();
  expect(imageAttributesFromChoice("informative", "A beach at sunset", "Evening light")).toEqual({ alt: "A beach at sunset", decorative: false, caption: "Evening light" });
  expect(imageAttributesFromChoice("decorative", "ignored", "")).toEqual({ alt: "", decorative: true, caption: null });
});

it("reconciles publication without replacing local edits and rejects a stale remote version", () => {
  type Draft = { title: string; document: { type: string; content: { type: string }[] }; version: number; publication: { publishedAt: string } | null; firstPublishedAt: string | null; hasUnpublishedChanges: boolean };
  const local: Draft = { title: "Unsaved local title", document: { type: "doc", content: [{ type: "paragraph" }] }, version: 7, publication: null, firstPublishedAt: null, hasUnpublishedChanges: false };
  const remote: Draft = { title: "Older server title", document: { type: "doc", content: [] }, version: 7, publication: { publishedAt: "today" }, firstPublishedAt: "yesterday", hasUnpublishedChanges: true };
  expect(mergeReconciledPublication(local, remote, 7)).toEqual({ ...local, publication: remote.publication, firstPublishedAt: remote.firstPublishedAt, hasUnpublishedChanges: true });
  expect(mergeReconciledPublication(local, { ...remote, version: 8 }, 7)).toBeNull();
  expect(mergeReconciledPublication(local, remote, 8)).toBeNull();
});
