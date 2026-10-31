import { expect, it } from "vitest";
import { assertApproved, makeApprovalTemplate, sha256 } from "../../../scripts/blog-import-approval.mts";

const article = { source: { wpId: 7 }, status: "review-required", document: {}, losses: [], warnings: [], schemaValid: true };
const source = new TextEncoder().encode("source"), conversion = new TextEncoder().encode("conversion");
const approval = {
  format: "blog-import-approval-v2" as const,
  sourceSha256: sha256(source), conversionSha256: sha256(conversion),
  articles: [{ wpId: 7, decision: "approve" as const, documentSha256: sha256("{}"), lossesSha256: sha256("[]"), warningsSha256: sha256("[]"), acceptLosses: false }],
};

it("requires exact source, conversion and per-article diagnostic approvals", () => {
  expect(() => assertApproved(source, conversion, approval, [article])).not.toThrow();
  expect(() => assertApproved(source, new TextEncoder().encode("changed"), approval, [article])).toThrow(/exact source and conversion/);
  expect(() => assertApproved(source, conversion, { ...approval, articles: [] }, [article])).toThrow(/exactly one decision/);
  expect(() => assertApproved(source, conversion, approval, [{ ...article, status: "blocked-review" }])).not.toThrow();
  expect(() => assertApproved(source, conversion, approval, [{ ...article, losses: [{ code: "new-loss" }] }])).toThrow(/diagnostics changed/);
  const withLoss = { ...article, losses: [{ code: "visual-style" }] };
  const lossApproval = { ...approval, articles: [{ ...approval.articles[0], lossesSha256: sha256(JSON.stringify(withLoss.losses)) }] };
  expect(() => assertApproved(source, conversion, lossApproval, [withLoss])).toThrow(/explicit acceptLosses/);
  expect(() => assertApproved(source, conversion, { ...lossApproval, articles: [{ ...lossApproval.articles[0], acceptLosses: true }] }, [withLoss])).not.toThrow();
});

it("round-trips an actual generated template through approval and canonical validation", () => {
  const sourceManifest = new TextEncoder().encode("representative-source-manifest");
  const conversion = { articles: [{
    ...article,
    document: { type: "doc", attrs: { z: 1, a: { y: true, b: "x" } } },
    losses: [{ code: "known", detail: { z: 2, a: 1 } }],
    warnings: [{ code: "warning", detail: "reviewed" }],
  }] };
  const conversionBytes = new TextEncoder().encode(JSON.stringify(conversion));
  const parsedConversion = JSON.parse(new TextDecoder().decode(conversionBytes));
  const template = makeApprovalTemplate(sha256(sourceManifest), conversionBytes, parsedConversion.articles);
  const approval = JSON.parse(JSON.stringify({
    ...template,
    articles: template.articles.map((entry) => ({ ...entry, decision: "approve", acceptLosses: true })),
  }));

  expect(() => assertApproved(sha256(sourceManifest), conversionBytes, approval, parsedConversion.articles)).not.toThrow();
  expect(() => assertApproved(sha256(new TextEncoder().encode("changed")), conversionBytes, approval, parsedConversion.articles)).toThrow(/exact source and conversion/);
});
