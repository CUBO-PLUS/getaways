import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "@/infrastructure/prisma/db";
import { getBlogMediaBucket, getS3Client } from "@/infrastructure/storage/s3";
import { assertSameOrigin } from "@/modules/auth/server/auth";
import { requireBlogAccess, recheckBlogAccess, blogAccessResponse } from "@/modules/content/server/blog-auth";

export const runtime = "nodejs";
const LIMIT = 10 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp"]);
let activeUploads = 0;

export async function POST(request: Request) {
  try { if (!assertSameOrigin(request)) return new Response(null, { status: 403 }); }
  catch { return new Response(null, { status: 503 }); }
  let actor: Awaited<ReturnType<typeof requireBlogAccess>>;
  try { actor = await requireBlogAccess(request); }
  catch (error) { return blogAccessResponse(error) ?? new Response(null, { status: 503 }); }
  if (activeUploads >= 2) return new Response(null, { status: 503, headers: { "Retry-After": "5" } });
  activeUploads++;
  try { return await receiveUpload(request, actor); }
  catch (error) { return blogAccessResponse(error) ?? new Response(null, { status: 503 }); }
  finally { activeUploads--; }
}

async function receiveUpload(request: Request, actor: Awaited<ReturnType<typeof requireBlogAccess>>) {
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0 || length > LIMIT + 64 * 1024) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let requestSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    requestSize += value.byteLength;
    if (requestSize > LIMIT + 64 * 1024) { await reader.cancel(); return new Response(null, { status: 413 }); }
    chunks.push(value);
  }
  const formRequest = new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) });
  let form: FormData;
  try { form = await formRequest.formData(); }
  catch { return new Response(null, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !types.has(file.type) || file.size === 0 || file.size > LIMIT) return new Response(null, { status: 415 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > LIMIT) return new Response(null, { status: 413 });
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" }).metadata();
    await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" }).toBuffer();
  }
  catch { return new Response(null, { status: 415 }); }
  const mime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : null;
  if (!mime || mime !== file.type || !metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) return new Response(null, { status: 415 });
  const objectKey = `blog/${randomUUID()}`;
  const s3 = getS3Client();
  const bucket = getBlogMediaBucket();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: bytes, ContentType: mime }));
  try {
    const { width, height } = metadata;
    const asset = await db.transaction(async tx => {
      await recheckBlogAccess(tx, actor);
      return tx.orm.public.MediaAsset.create({ objectKey, originalName: file.name.slice(0, 255), mimeType: mime, sizeBytes: BigInt(bytes.length), width, height });
    });
    return Response.json({ id: asset.id, url: `/api/blog/media/${asset.id}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })); }
    catch (compensationError) { console.error("Blog media compensation failed", { objectKey, compensationError }); }
    throw error;
  }
}
