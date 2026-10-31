import { createHash } from "node:crypto";

type Article = {
  source: { wpId: number };
  status: string;
  document: unknown;
  losses: unknown[];
  warnings: unknown[];
  schemaValid: boolean;
  sourceBlockers?: unknown[];
  humanReviewed?: boolean;
};

type ReviewArticle = Pick<Article, "source" | "document" | "losses" | "warnings">;

export type Approval = {
  format: "blog-import-approval-v2";
  sourceSha256: string;
  conversionSha256: string;
  articles: Array<{
    wpId: number;
    documentSha256: string;
    lossesSha256: string;
    warningsSha256: string;
    acceptLosses: boolean;
    decision: "approve";
  }>;
};

export type ApprovalTemplate = Omit<Approval, "articles"> & {
  instructions: string;
  articles: Array<Omit<Approval["articles"][number], "decision"> & { decision: "review" }>;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]),
  );
  return value;
}

export function canonicalJson(value: unknown): string {
  const result = JSON.stringify(canonicalize(value));
  if (result === undefined) throw new Error("value is not JSON serializable");
  return result;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Canonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function makeApprovalTemplate(sourceSha256: string, conversionBytes: Uint8Array, articles: ReviewArticle[]): ApprovalTemplate {
  return {
    format: "blog-import-approval-v2",
    sourceSha256,
    conversionSha256: sha256(conversionBytes),
    instructions: "Review each article and set decision=approve. If any listed loss remains, explicitly set acceptLosses=true. Do not alter hashes; regenerate this template after changing the conversion.",
    articles: articles.map((article) => ({
      wpId: article.source.wpId,
      decision: "review",
      documentSha256: sha256Canonical(article.document),
      lossesSha256: sha256Canonical(article.losses),
      warningsSha256: sha256Canonical(article.warnings),
      acceptLosses: false,
    })),
  };
}

export function assertApproved(
  sourceBytes: Uint8Array | string,
  conversionBytes: Uint8Array,
  approval: Approval,
  articles: Article[],
): void {
  if (approval.format !== "blog-import-approval-v2" ||
      approval.sourceSha256 !== (typeof sourceBytes === "string" ? sourceBytes : sha256(sourceBytes)) ||
      approval.conversionSha256 !== sha256(conversionBytes)) {
    throw new Error("approval does not match these exact source and conversion bytes");
  }
  const rows = new Map(approval.articles.map((entry) => [entry.wpId, entry]));
  if (rows.size !== approval.articles.length || rows.size !== articles.length) {
    throw new Error("approval must contain exactly one decision for every converted article");
  }
  for (const article of articles) {
    const entry = rows.get(article.source.wpId);
    if (!entry || entry.decision !== "approve" || !article.schemaValid || article.sourceBlockers?.length) {
      throw new Error(`article ${article.source.wpId} is invalid or has no explicit approval`);
    }
    if (entry.documentSha256 !== sha256Canonical(article.document) ||
        entry.lossesSha256 !== sha256Canonical(article.losses) ||
        entry.warningsSha256 !== sha256Canonical(article.warnings)) {
      throw new Error(`article ${article.source.wpId} diagnostics changed after review`);
    }
    if (article.losses.length && entry.acceptLosses !== true) {
      throw new Error(`article ${article.source.wpId} has losses; explicit acceptLosses is required`);
    }
  }
}
