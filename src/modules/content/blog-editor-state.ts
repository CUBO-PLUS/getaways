export function mergeReconciledPublication<T extends { version: number; publication: unknown | null; firstPublishedAt: string | null; hasUnpublishedChanges: boolean }>(
  local: T,
  remote: T,
  expectedVersion: number,
): T | null {
  if (local.version !== expectedVersion || remote.version !== expectedVersion) return null;
  return { ...local, publication: remote.publication, firstPublishedAt: remote.firstPublishedAt, hasUnpublishedChanges: remote.hasUnpublishedChanges };
}

export function imageAttributesFromChoice(
  choice: "informative" | "decorative" | "",
  alt: string,
  caption: string,
): { alt: string; decorative: boolean; caption: string | null } | null {
  if (!choice || choice === "informative" && !alt.trim()) return null;
  return { alt: choice === "decorative" ? "" : alt, decorative: choice === "decorative", caption: caption.trim() || null };
}
