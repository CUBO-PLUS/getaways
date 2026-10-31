import { canonicalJson, sha256 } from "./blog-import-approval.mts";
import { exactInstant } from "../modules/content/publication-instant.mjs";

type Row = Record<string, unknown>;
const EDITORIAL_FIELDS = ["title", "excerpt", "document", "documentSchemaVersion", "coverMediaId", "coverAlt", "seoTitle", "seoDescription"];

function snapshotHash(row: Row, includeSlug: boolean): string {
  const fields = includeSlug ? ["slug", ...EDITORIAL_FIELDS] : EDITORIAL_FIELDS;
  return sha256(canonicalJson(Object.fromEntries(fields.map((field) => [field, row[field]]))));
}

function sortedIds(ids: number[]): number[] {
  return [...ids].sort((a, b) => a - b);
}

function sameIds(actual: number[], expected: number[]): boolean {
  return actual.length === expected.length && sortedIds(actual).every((id, index) => id === sortedIds(expected)[index]);
}

export function assertImportedSnapshot(
  expectedDraft: Row,
  currentDraft: Row | null,
  currentPublication: Row | null,
  currentDraftCategoryIds: number[],
  currentPublicationCategoryIds: number[],
  expectedCategoryIds: number[],
  expectedPublishedAt: string,
): void {
  if (!currentDraft) throw new Error("mapped destination draft disappeared");
  if (!currentPublication) throw new Error("mapped publication is missing or was retired");
  if (snapshotHash(currentDraft, true) !== snapshotHash(expectedDraft, true)) throw new Error("draft editorial changes detected");
  if (snapshotHash(currentPublication, false) !== snapshotHash(expectedDraft, false)) throw new Error("published editorial changes detected");

  const expectedInstant = exactInstant(expectedPublishedAt);
  if (expectedInstant === null || exactInstant(currentDraft.firstPublishedAt)?.epochNanoseconds !== expectedInstant.epochNanoseconds || exactInstant(currentPublication.publishedAt)?.epochNanoseconds !== expectedInstant.epochNanoseconds) {
    throw new Error("publication date changed");
  }
  if (!sameIds(currentDraftCategoryIds, expectedCategoryIds)) throw new Error("draft categories changed");
  if (!sameIds(currentPublicationCategoryIds, expectedCategoryIds)) throw new Error("published categories changed");
}
