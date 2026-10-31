import { createElement } from "react";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { BLOG_CONTENT_EXTENSIONS, type BlogDocument } from "./blog-schema";

function appMediaPath(mediaId: string, mediaUrl: (mediaId: string) => string): string {
  const path = mediaUrl(mediaId);
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") ||
      /[\\\u0000-\u0020?#]/.test(path) || /%(?:2f|5c)/i.test(path)) {
    throw new Error("Blog media URL must be a stable, relative application path");
  }
  const origin = "https://blog-app.invalid";
  const normalized = new URL(path, origin);
  if (normalized.origin !== origin || normalized.pathname !== path ||
      path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Blog media URL must not contain traversal segments");
  }
  return path;
}

/** Server-render a validated document; media URLs are resolved by the caller. */
export function renderBlogDocument(
  document: BlogDocument,
  mediaUrl: (mediaId: string) => string,
) {
  return renderToReactElement({
    content: document,
    extensions: BLOG_CONTENT_EXTENSIONS,
    options: {
      nodeMapping: {
        image: ({ node }) => {
          const { mediaId, alt, decorative, caption } = node.attrs;
          return createElement("figure", { key: mediaId },
            createElement("img", { src: appMediaPath(mediaId, mediaUrl), alt: decorative ? "" : alt }),
            caption ? createElement("figcaption", null, caption) : null,
          );
        },
      },
      unhandledNode: ({ node }) => { throw new Error(`Unsupported blog node: ${node.type.name}`); },
      unhandledMark: ({ mark }) => { throw new Error(`Unsupported blog mark: ${mark.type.name}`); },
    },
  });
}
