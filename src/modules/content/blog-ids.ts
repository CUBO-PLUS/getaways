export const BLOG_ID_MAX = 2_147_483_647;

export function parseBlogId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= BLOG_ID_MAX ? id : null;
}
