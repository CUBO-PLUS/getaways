import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, paginateListObjectsV2, PutObjectCommand } from "@aws-sdk/client-s3";

const root = path.resolve(import.meta.dirname, "..");
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_INPUT_PIXELS = 100_000_000;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const isMissing = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode === 404
  || (error as { name?: string }).name === "NotFound";
const isPrecondition = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode === 412
  || (error as { name?: string }).name === "PreconditionFailed";

type Asset = { id: number; objectKey: string; mimeType: string; sizeBytes: bigint | number; width: number; height: number };

export async function optimizeImages(apply = false) {
  nextEnv.loadEnvConfig(root, process.env.NODE_ENV !== "production");
  // These modules read configuration at import time; load Next env first.
  const [{ db }, storage, imageOptimizer] = await Promise.all([
    import("../infrastructure/prisma/db.ts"),
    import("../infrastructure/storage/s3.ts"),
    import("../infrastructure/images/optimize.ts"),
  ]);
  const s3 = storage.getS3Client();
  try {
    const bucket = storage.getBlogMediaBucket();
    const assets = await db.orm.public.MediaAsset.all() as Asset[];
    const inventory = new Map<string, { size: number; etag?: string }>();
    const assetsByKey = new Map<string, Asset>();
    const duplicateKeys: string[] = [];
    for (const asset of assets) {
      if (assetsByKey.has(asset.objectKey)) duplicateKeys.push(asset.objectKey);
      assetsByKey.set(asset.objectKey, asset);
    }
    const failures: Array<{ id?: number; key: string; reason: string }> = [];
    const missing: Array<{ id: number; key: string }> = [];
    const nonImages: Array<{ id: number; key: string }> = [];
    const migrated: Array<{ id: number; old: { objectKey: string; mimeType: string; sizeBytes: string; width: number; height: number }; new: { objectKey: string; mimeType: string; sizeBytes: number; width: number; height: number } }> = [];
    const unmanagedKeys: string[] = [];
    let totalBytes = 0;

    async function deleteOriginal(sourceKey: string, expectedSha256: string, expectedEtag?: string): Promise<"deleted" | "missing" | "referenced"> {
      if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("invalid source-sha256 metadata; refusing source deletion");
      let head: { ETag?: string; ContentLength?: number };
      try { head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey })); }
      catch (error) { if (isMissing(error)) return "missing"; throw error; }
      if (!head.ETag || (expectedEtag && head.ETag !== expectedEtag)) throw new Error("source ETag changed; refusing deletion");
      if (Number(head.ContentLength) > MAX_SOURCE_BYTES) throw new Error("source exceeds safe cleanup size; refusing deletion");
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: sourceKey, IfMatch: head.ETag }));
      if (!result.Body || hash(await result.Body.transformToByteArray()) !== expectedSha256) throw new Error("source bytes changed; refusing deletion");
      return db.transaction(async (tx) => {
        await tx.execute(db.raw.sql`LOCK TABLE "MediaAsset" IN SHARE ROW EXCLUSIVE MODE`.affectedCount().build());
        const refs = await tx.orm.public.MediaAsset.where({ objectKey: sourceKey }).all();
        if (refs.length) return "referenced" as const;
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey, IfMatch: head.ETag }));
        } catch (error) {
          if (isMissing(error)) return "missing" as const;
          throw error;
        }
        return "deleted" as const;
      });
    }

    for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: bucket })) {
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        inventory.set(object.Key, { size: Number(object.Size ?? 0), etag: object.ETag });
        totalBytes += Number(object.Size ?? 0);
      }
    }
    for (const key of inventory.keys()) if (!assetsByKey.has(key)) unmanagedKeys.push(key);
    if (duplicateKeys.length) throw new Error(`Duplicate MediaAsset object keys: ${duplicateKeys.join(", ")}`);

    let candidates = 0;
    let alreadyOptimized = 0;
    let uploadNeeded = 0;
    for (const asset of assets) {
      const key = asset.objectKey;
      if (!inventory.has(key)) { missing.push({ id: asset.id, key }); continue; }
      const listed = inventory.get(key)!;
      let source: Buffer;
      let sourceEtag: string | undefined;
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (Number(head.ContentLength) > MAX_SOURCE_BYTES) throw new Error("source exceeds safe size limit");
        if (asset.mimeType === "image/webp" && head.Metadata?.["source-key"] && head.Metadata?.["source-sha256"] && head.Metadata?.sha256) {
          const body = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: listed.etag }));
          if (!body.Body) throw new Error("optimized object has no body");
          const bytes = Buffer.from(await body.Body.transformToByteArray());
          const actualHash = hash(bytes);
          const sourceKey = head.Metadata["source-key"];
          if (actualHash !== head.Metadata.sha256 || sourceKey === key
            || key !== imageOptimizer.optimizedImageKey(sourceKey, head.Metadata.sha256)
            || head.ContentType !== "image/webp" || bytes.length !== Number(head.ContentLength)
            || bytes.length !== Number(asset.sizeBytes)) {
            throw new Error("previously optimized object failed metadata/content verification");
          }
          const verified = await imageOptimizer.optimizeImage(bytes, { declaredMime: "image/webp", maxInputBytes: MAX_SOURCE_BYTES, limitInputPixels: MAX_INPUT_PIXELS });
          if (verified.sha256 !== actualHash || verified.width !== asset.width || verified.height !== asset.height) {
            throw new Error("previously optimized object differs from database dimensions or optimization policy");
          }
          alreadyOptimized++;
          if (apply && sourceKey !== key && inventory.has(sourceKey)) {
            try {
              const cleanup = await deleteOriginal(sourceKey, head.Metadata["source-sha256"]);
              if (cleanup === "referenced") failures.push({ id: asset.id, key: sourceKey, reason: "original still referenced by MediaAsset; skipped deletion" });
            } catch (error) { failures.push({ id: asset.id, key: sourceKey, reason: `original deletion failed: ${error instanceof Error ? error.message : String(error)}` }); }
          }
          continue;
        }
        if (Number(head.ContentLength) !== listed.size || Number(head.ContentLength) !== Number(asset.sizeBytes)) {
          throw new Error(`source size mismatch (bucket ${head.ContentLength}, DB ${asset.sizeBytes})`);
        }
        if (head.ContentType && head.ContentType !== asset.mimeType) throw new Error(`source ContentType mismatch (bucket ${head.ContentType}, DB ${asset.mimeType})`);
        if (!head.ETag) throw new Error("source has no ETag; refusing conversion");
        sourceEtag = head.ETag;
        const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: head.ETag }));
        if (!get.Body) throw new Error("source object has no body");
        source = Buffer.from(await get.Body.transformToByteArray());
        if (source.length !== listed.size || source.length > MAX_SOURCE_BYTES) throw new Error(`source size outside safe range (${source.length} bytes)`);
        if (head.Metadata?.sha256 && hash(source) !== head.Metadata.sha256) throw new Error("source SHA-256 metadata does not match its bytes");
      } catch (error) {
        if (isMissing(error)) missing.push({ id: asset.id, key });
        else failures.push({ id: asset.id, key, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      let optimized: Awaited<ReturnType<typeof imageOptimizer.optimizeImage>>;
      try {
        optimized = await imageOptimizer.optimizeImage(source, { declaredMime: asset.mimeType.startsWith("image/") ? asset.mimeType : undefined, maxInputBytes: MAX_SOURCE_BYTES, limitInputPixels: MAX_INPUT_PIXELS });
      } catch (error) {
        if ((error as { name?: string })?.name === "InvalidImageError") nonImages.push({ id: asset.id, key });
        else failures.push({ id: asset.id, key, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      candidates++;
      const targetKey = imageOptimizer.optimizedImageKey(key, optimized.sha256);
      const existingRef = assets.some((other) => other.id !== asset.id && other.objectKey === targetKey);
      if (existingRef) { failures.push({ id: asset.id, key, reason: `target key already referenced by another MediaAsset: ${targetKey}` }); continue; }
      let targetExists = false;
      try {
        const target = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: targetKey }));
        if (Number(target.ContentLength) !== optimized.bytes.length || target.ContentType !== "image/webp" || target.Metadata?.sha256 !== optimized.sha256
          || target.Metadata?.["source-sha256"] !== hash(source) || target.Metadata?.["source-key"] !== key) {
          throw new Error(`existing target fails metadata verification: ${targetKey}`);
        }
        const body = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: targetKey }));
        if (!body.Body || hash(await body.Body.transformToByteArray()) !== optimized.sha256) throw new Error(`existing target hash verification failed: ${targetKey}`);
        targetExists = true;
      } catch (error) {
        if (!isMissing(error)) { failures.push({ id: asset.id, key, reason: error instanceof Error ? error.message : String(error) }); continue; }
      }
      if (!targetExists) uploadNeeded++;
      if (!apply) continue;
      if (!targetExists) {
        try {
          await s3.send(new PutObjectCommand({ Bucket: bucket, Key: targetKey, Body: optimized.bytes, ContentLength: optimized.bytes.length,
            ContentType: "image/webp", IfNoneMatch: "*", Metadata: { sha256: optimized.sha256, "source-sha256": hash(source), "source-key": key } }));
        } catch (error) {
          if (!isPrecondition(error)) { failures.push({ id: asset.id, key, reason: `upload failed: ${String(error)}` }); continue; }
        }
        // Verify bytes, not just user metadata, even after a conditional-write race.
        try {
          const target = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: targetKey }));
          const body = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: targetKey }));
          if (Number(target.ContentLength) !== optimized.bytes.length || target.ContentType !== "image/webp"
            || target.Metadata?.sha256 !== optimized.sha256 || target.Metadata?.["source-sha256"] !== hash(source)
            || target.Metadata?.["source-key"] !== key || !body.Body
            || hash(await body.Body.transformToByteArray()) !== optimized.sha256) throw new Error(`uploaded target verification failed: ${targetKey}`);
        } catch (error) { failures.push({ id: asset.id, key, reason: error instanceof Error ? error.message : String(error) }); continue; }
      }
      try {
        await db.transaction(async (tx) => {
          const row = await tx.orm.public.MediaAsset.where({ id: asset.id }).forUpdate().first() as Asset | null;
          if (!row || row.objectKey !== asset.objectKey || row.mimeType !== asset.mimeType
            || Number(row.sizeBytes) !== Number(asset.sizeBytes) || row.width !== asset.width || row.height !== asset.height) {
            throw new Error("stale MediaAsset source; database row changed since inventory");
          }
          const changed = await tx.execute(db.raw.sql`UPDATE "MediaAsset" SET "objectKey" = ${targetKey}, "mimeType" = 'image/webp', "sizeBytes" = ${BigInt(optimized.bytes.length)}, "width" = ${optimized.width}, "height" = ${optimized.height} WHERE id = ${asset.id} AND "objectKey" = ${asset.objectKey} AND "mimeType" = ${asset.mimeType} AND "sizeBytes" = ${BigInt(Number(asset.sizeBytes))} AND width = ${asset.width} AND height = ${asset.height}`.affectedCount().build());
          if (changed.affectedRows !== 1) throw new Error("stale MediaAsset source; conditional row update affected no row");
        });
        migrated.push({ id: asset.id,
          old: { objectKey: asset.objectKey, mimeType: asset.mimeType, sizeBytes: String(asset.sizeBytes), width: asset.width, height: asset.height },
          new: { objectKey: targetKey, mimeType: "image/webp", sizeBytes: optimized.bytes.length, width: optimized.width, height: optimized.height } });
        try {
          const cleanup = await deleteOriginal(key, hash(source), sourceEtag);
          if (cleanup === "referenced") failures.push({ id: asset.id, key, reason: "original still referenced by MediaAsset after swap; skipped deletion" });
        } catch (error) { failures.push({ id: asset.id, key, reason: `original deletion failed: ${error instanceof Error ? error.message : String(error)}` }); }
      } catch (error) { failures.push({ id: asset.id, key, reason: error instanceof Error ? error.message : String(error) }); }
    }

    const result = { mode: apply ? "applied" : "dry-run", bucket, inventoryObjects: inventory.size, inventoryBytes: totalBytes,
      activeMediaAssets: assets.length,
      converted: candidates, alreadyOptimized, uploadsNeeded: uploadNeeded, migrated, missing, nonImages, failures,
      unmanagedObjectCount: unmanagedKeys.length, unmanagedKeys };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (missing.length || nonImages.length || failures.length) process.exitCode = 1;
    return result;
  } finally {
    s3.destroy();
    await db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--apply") || args.filter((arg) => arg === "--apply").length > 1) throw new Error("Usage: node --conditions=react-server --experimental-strip-types scripts/optimize-images.mts [--apply]");
    await optimizeImages(args.includes("--apply"));
  } catch (error) {
    process.stderr.write(`Image optimization stopped: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
