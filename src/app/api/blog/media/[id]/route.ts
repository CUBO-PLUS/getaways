import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/infrastructure/prisma/db";
import { getBlogMediaBucket, getS3Client } from "@/infrastructure/storage/s3";
import { isBlogAdmin } from "@/modules/content/server/blog-auth";
import { documentReferencesMedia } from "@/modules/content/blog-media-references";
import { parseBlogId } from "@/modules/content/blog-ids";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = parseBlogId((await context.params).id);
  if (id === null) return new Response(null, { status: 404 });
  const asset = await db.orm.public.MediaAsset.where({ id }).first();
  if (!asset) return new Response(null, { status: 404 });
  // ponytail: scans O(n) publications per image request; add a media-reference index/lookup when content volume makes this measurable.
  const publications = await db.orm.public.BlogPublication.all();
  const referencedPublicly = publications.some((publication) => publication.coverMediaId === id || documentReferencesMedia(publication.document, id));
  if (!referencedPublicly && !(await isBlogAdmin(request))) return new Response(null, { status: 404 });
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: getBlogMediaBucket(), Key: asset.objectKey }));
  if (!response.Body) return new Response(null, { status: 404 });
  return new Response(await response.Body.transformToWebStream(), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(asset.sizeBytes), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
