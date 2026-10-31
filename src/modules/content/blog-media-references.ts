export function documentReferencesMedia(value: unknown, id: number): boolean {
  if (Array.isArray(value)) return value.some((item) => documentReferencesMedia(item, id));
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  const mediaId = node.type === "image" && node.attrs && typeof node.attrs === "object"
    ? (node.attrs as Record<string, unknown>).mediaId
    : undefined;
  if (mediaId === id || (typeof mediaId === "string" && /^[1-9]\d*$/.test(mediaId) && Number(mediaId) === id)) return true;
  return Object.values(node).some((child) => documentReferencesMedia(child, id));
}
