import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/infrastructure/prisma/db";
import { getBlogMediaBucket, getS3Client } from "@/infrastructure/storage/s3";
import { requireBlogAccess, blogAccessResponse } from "@/modules/content/server/blog-auth";
import { documentReferencesMedia } from "@/modules/content/blog-media-references";
import { parseBlogId } from "@/modules/content/blog-ids";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = parseBlogId((await context.params).id);
    if (id === null) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const asset = await db.orm.public.MediaAsset.where({ id }).first();
    if (!asset) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    // ponytail: scans O(n) publications per image request; add a media-reference index/lookup when content volume makes this measurable.
    const publications = await db.orm.public.BlogPublication.all();
    let referencedPublicly = publications.some((publication) => publication.coverMediaId === id || documentReferencesMedia(publication.document, id));
    if (!referencedPublicly) {
      const cover = await db.orm.public.Listing.where({ active: true, archivedAt: null, coverMediaId: id }).first();
      const associations = cover ? [] : await db.orm.public.ListingMedia.where({ mediaId: id }).all();
      const listingIds = associations.map((association) => association.listingId);
      const gallery = listingIds.length === 0 ? null : await db.orm.public.Listing
        .where({ active: true, archivedAt: null })
        .where((listing) => listing.id.in(listingIds)).first();
      referencedPublicly = Boolean(cover || gallery);
    }
    if (!referencedPublicly) {
      try { await requireBlogAccess(request); }
      catch (error) { return blogAccessResponse(error) ?? new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
    }
    const response = await getS3Client().send(new GetObjectCommand({ Bucket: getBlogMediaBucket(), Key: asset.objectKey }));
    if (!response.Body) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return new Response(await response.Body.transformToWebStream(), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(asset.sizeBytes), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
