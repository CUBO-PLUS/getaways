import { expect, it } from "vitest";
import { assertImportedSnapshot } from "../../../scripts/blog-import-snapshot.mts";
import { Temporal } from "temporal-polyfill/full";

const publishedAt = "2025-03-01T12:00:00.000Z";
const draft = {
  slug: "post", title: "Title", excerpt: "Excerpt", document: { type: "doc", content: [] },
  documentSchemaVersion: 1, coverMediaId: 12, coverAlt: "Alt", seoTitle: null, seoDescription: null,
  firstPublishedAt: Temporal.Instant.from(publishedAt),
};
const publication = { ...draft, publishedAt: Temporal.Instant.from(publishedAt) };
const verify = (currentDraft = draft, currentPublication: typeof publication | null = publication, draftCategories = [2, 4], liveCategories = [4, 2]) =>
  assertImportedSnapshot(draft, currentDraft, currentPublication, draftCategories, liveCategories, [2, 4], publishedAt);

it("accepts only an exact draft, live snapshot, publication date and category set on reimport", () => {
  expect(() => verify()).not.toThrow();
  expect(() => verify({ ...draft, title: "Edited draft" })).toThrow(/draft editorial changes/);
  expect(() => verify(draft, { ...publication, title: "Edited publication" })).toThrow(/published editorial changes/);
  expect(() => verify(draft, null)).toThrow(/missing or was retired/);
  expect(() => verify(draft, publication, [2], [2, 4])).toThrow(/draft categories changed/);
  expect(() => verify(draft, publication, [2, 4], [2])).toThrow(/published categories changed/);
  expect(() => verify({ ...draft, firstPublishedAt: Temporal.Instant.from("2025-03-02T12:00:00Z") })).toThrow(/publication date changed/);
  expect(() => verify({ ...draft, firstPublishedAt: Temporal.Instant.from("2025-03-01T12:00:00.000001Z") })).toThrow(/publication date changed/);
});

it("compares offset timestamps as exact instants", () => {
  expect(() => assertImportedSnapshot(draft, draft, publication, [2, 4], [4, 2], [2, 4], "2025-03-01T13:00:00+01:00")).not.toThrow();
});
