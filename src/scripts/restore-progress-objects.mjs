import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

export async function restoreObjects(directory, execute = false) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "rustfs-manifest.json"), "utf8"));
  const keys = new Set();
  for (const object of manifest.objects) {
    assert.match(object.file, /^objects\/\d{5,}$/);
    assert.ok(typeof object.key === "string" && object.key && !keys.has(object.key), "Clave de objeto inválida o duplicada");
    keys.add(object.key);
    const bytes = await fs.readFile(path.join(directory, object.file));
    assert.equal(bytes.length, object.size, "Tamaño de objeto incorrecto");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), object.sha256, "SHA-256 incorrecto");
  }
  if (!execute) return { mode: "verified-only", objects: manifest.objects.length };
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  assert.ok(S3_ENDPOINT && S3_REGION && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY, "Falta configuración del destino aislado");
  const client = new S3Client({ endpoint: S3_ENDPOINT, region: S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
  const destination = await client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, MaxKeys: 1 }));
  assert.ok(!destination.Contents?.length && !destination.IsTruncated, "El bucket de destino debe estar vacío");
  for (const object of manifest.objects) {
    await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: object.key,
      Body: await fs.readFile(path.join(directory, object.file)), ContentType: object.contentType,
      Metadata: object.metadata, ContentEncoding: object.contentEncoding, ContentLanguage: object.contentLanguage,
      ContentDisposition: object.contentDisposition, CacheControl: object.cacheControl,
      Expires: object.expires ? new Date(object.expires) : undefined, IfNoneMatch: "*" }));
  }
  return { mode: "restored", objects: manifest.objects.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === "--execute", "Solo se admite --execute");
    console.log(JSON.stringify(await restoreObjects(import.meta.dirname, process.argv[2] === "--execute")));
  } catch (error) {
    console.error(`Verificación/restauración detenida (${error.name}). No se sobrescriben objetos; si hubo cargas parciales, revisar el destino sin borrarlas automáticamente.`);
    process.exitCode = 1;
  }
}
