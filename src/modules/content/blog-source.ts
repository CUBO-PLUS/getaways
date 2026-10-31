export type BlogContentSource = "static" | "postgres";

export function resolveBlogContentSource(value: string | undefined): BlogContentSource {
  const source = value ?? "static";
  if (source !== "static" && source !== "postgres") {
    throw new Error(`Invalid BLOG_CONTENT_SOURCE: ${source}`);
  }
  return source;
}
