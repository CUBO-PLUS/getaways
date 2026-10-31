export function withPublicationState<T extends { publication: unknown | null }>(draft: T, published: boolean): T {
  return { ...draft, publication: published ? {} : null };
}

export function mergeReconciledPublication<T extends { version: number; publication: unknown | null }>(
  local: T,
  remote: T,
  expectedVersion: number,
): T | null {
  if (local.version !== expectedVersion || remote.version !== expectedVersion) return null;
  return { ...local, publication: remote.publication };
}

export function imageAttributesFromChoice(
  choice: "informative" | "decorative" | "",
  alt: string,
  caption: string,
): { alt: string; decorative: boolean; caption: string | null } | null {
  if (!choice || choice === "informative" && !alt.trim()) return null;
  return { alt: choice === "decorative" ? "" : alt, decorative: choice === "decorative", caption: caption.trim() || null };
}
