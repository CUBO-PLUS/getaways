import type { BlogDocument } from "./blog-schema";

export function validatePublishableBlogPost(post: {
  title: string;
  document: BlogDocument;
  coverMediaId: number | null;
  coverAlt: string | null;
}): string | null {
  if (!post.title.trim()) return "El artículo necesita un título para publicarse.";
  let hasContent = false;
  function inspect(node: BlogDocument | NonNullable<BlogDocument["content"]>[number]) {
    if (node.type === "image" || typeof node.text === "string" && node.text.trim()) hasContent = true;
    node.content?.forEach(inspect);
  }
  inspect(post.document);
  if (!hasContent) return "El artículo necesita texto o una imagen para publicarse.";
  if (post.coverMediaId !== null && !post.coverAlt?.trim()) return "La portada necesita texto alternativo antes de publicar.";
  return null;
}
