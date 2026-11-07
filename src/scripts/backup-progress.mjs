import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createReadStream, openSync, closeSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, paginateListObjectsV2, S3Client } from "@aws-sdk/client-s3";
import nextEnv from "@next/env";
import { restoreObjects } from "./restore-progress-objects.mjs";

const src = path.resolve(import.meta.dirname, "..");
const backups = path.join(src, "backups");
const database = "gateways-dev-db-1";
const rustfs = "gateways-dev-rustfs-1";
const dbShell = ["exec", "-i", database, "sh", "-c"];
const docker = (args, options = {}) => execFileSync("docker", args, { encoding: "utf8", ...options });
const write = (file, bytes) => fs.writeFile(file, bytes, { mode: 0o600, flag: "wx" });

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function assertStableObjects(before, after) {
  const signature = (rows) => rows.map(({ Key, Size, ETag, LastModified }) =>
    [Key, Size, ETag, LastModified?.toISOString()]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(signature(after), signature(before), "El bucket cambió durante la copia; respaldo incompleto");
}

export function assertMediaCovered(media, manifest) {
  const objects = new Map(manifest.objects.map((object) => [object.key, object]));
  for (const asset of media) {
    const object = objects.get(asset.objectKey);
    assert.ok(object, `Falta un objeto referenciado por MediaAsset ${asset.id}`);
    assert.equal(object.size, Number(asset.sizeBytes), `Tamaño distinto en MediaAsset ${asset.id}`);
    assert.equal(object.contentType, asset.mimeType, `Tipo distinto en MediaAsset ${asset.id}`);
  }
}

async function backupObjects(directory) {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET: bucket, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  assert.ok(S3_ENDPOINT && S3_REGION && bucket && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY, "Falta configuración S3 de la aplicación");
  const endpoint = new URL(S3_ENDPOINT);
  assert.ok(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
    && !endpoint.username && !endpoint.password, "S3_ENDPOINT debe apuntar al RustFS local");
  const ports = JSON.parse(docker(["inspect", "--format", '{{json (index .NetworkSettings.Ports "9000/tcp")}}', rustfs]));
  assert.ok(ports?.some(({ HostPort }) => HostPort === (endpoint.port || "80")), "S3_ENDPOINT no coincide con el puerto de RustFS");
  const client = new S3Client({ endpoint: S3_ENDPOINT, region: S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
  try {
    const list = async () => {
      const objects = [];
      for await (const page of paginateListObjectsV2({ client }, { Bucket: bucket })) objects.push(...page.Contents ?? []);
      return objects.sort((a, b) => a.Key.localeCompare(b.Key));
    };
    const before = await list();
    const manifest = { bucket, capturedAt: new Date().toISOString(), objects: [] };
    await fs.mkdir(path.join(directory, "objects"), { mode: 0o700 });
    for (const item of before) {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.Key, IfMatch: item.ETag }));
      assert.ok(object.Body, "Respuesta de objeto sin contenido");
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      assert.equal(bytes.length, item.Size, "El tamaño del objeto cambió");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (object.Metadata?.sha256) assert.equal(sha256, object.Metadata.sha256, "Hash remoto incorrecto");
      const file = `objects/${String(manifest.objects.length).padStart(5, "0")}`;
      await write(path.join(directory, file), bytes);
      manifest.objects.push({ key: item.Key, file, sha256, size: bytes.length,
        contentType: object.ContentType, metadata: object.Metadata,
        contentEncoding: object.ContentEncoding, contentLanguage: object.ContentLanguage,
        contentDisposition: object.ContentDisposition, cacheControl: object.CacheControl,
        expires: object.Expires?.toISOString() });
    }
    // ponytail: objects are immutable in this app; quiesce writers before supporting mutable objects or bucket version history.
    assertStableObjects(before, await list());
    await write(path.join(directory, "rustfs-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    client.destroy();
  }
}

function toFile(command, args, file) {
  const descriptor = openSync(file, "wx", 0o600);
  try { execFileSync(command, args, { stdio: ["ignore", descriptor, "pipe"] }); }
  finally { closeSync(descriptor); }
}

export async function backupProgress(note) {
  assert.ok(note?.trim(), 'Uso: node scripts/backup-progress.mjs "Avance y pendientes"');
  nextEnv.loadEnvConfig(src, true);
  assert.notEqual(process.env.NODE_ENV, "production", "Solo se admite el entorno local");
  for (const container of [database, rustfs]) {
    assert.equal(docker(["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', container]).trim(), "gateways-dev", "Solo se admite el Compose local gateways-dev");
    assert.equal(docker(["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}', container]).trim(), src, "El servicio no corresponde a este árbol");
    assert.equal(docker(["inspect", "--format", "{{.State.Running}}", container]).trim(), "true", "Servicio detenido");
  }
  const directory = await fs.mkdtemp(path.join(backups, `progreso-${new Date().toISOString().replace(/[-:.]/g, "")}-`));
  await fs.chmod(directory, 0o700);
  const name = path.basename(directory);
  const session = spawn("docker", [...dbShell, 'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise((resolve) => session.once("close", resolve));
  session.stdin.on("error", () => {}); // A failed psql session is detected by EOF or pg_dump before accepting the checkpoint.
  session.stderr.resume();
  const lines = createInterface({ input: session.stdout })[Symbol.asyncIterator]();
  try {
    session.stdin.write(`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
  'snapshot', pg_export_snapshot(), 'database', current_database(), 'capturedAt', now(),
  'postgresVersion', current_setting('server_version'),
  'media', (SELECT coalesce(json_agg(m ORDER BY id), '[]') FROM "MediaAsset" m),
  'posts', (SELECT coalesce(json_agg(p ORDER BY id), '[]') FROM (SELECT id, slug, version FROM "BlogPost") p),
  'publications', (SELECT count(*) FROM "BlogPublication")
)::jsonb;
`);
    const line = await lines.next();
    assert.ok(!line.done, "No se pudo abrir el snapshot PostgreSQL");
    const state = JSON.parse(line.value);
    assert.match(state.snapshot, /^[0-9A-Fa-f-]+$/);
    toFile("docker", [...dbShell, 'exec pg_dump --format=custom --snapshot="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB"', "pg_dump", state.snapshot], path.join(directory, "postgres.dump"));
    const dumpInput = openSync(path.join(directory, "postgres.dump"), "r");
    let listing;
    try { listing = execFileSync("docker", ["exec", "-i", database, "pg_restore", "--list"], { stdio: [dumpInput, "pipe", "pipe"], encoding: "utf8" }); }
    finally { closeSync(dumpInput); }
    assert.ok(listing.includes("BlogPublication"), "El dump no contiene el blog");
    await write(path.join(directory, "postgres.list"), listing);
    const manifest = await backupObjects(directory);
    assertMediaCovered(state.media, manifest);
    await restoreObjects(directory);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: src, encoding: "utf8" }).trim();
    const gitStatus = execFileSync("git", ["status", "--short"], { cwd: src, encoding: "utf8" });
    const checkpoint = { format: "gateways-progress-v1", startedAt: state.capturedAt, completedAt: new Date().toISOString(),
      gitHead: head, dirty: Boolean(gitStatus.trim()), database: state.database, postgresVersion: state.postgresVersion,
      posts: state.posts, publications: state.publications, mediaAssets: state.media.length,
      bucket: manifest.bucket, objects: manifest.objects.length, objectBytes: manifest.objects.reduce((sum, object) => sum + object.size, 0),
      note, verification: { exportedDatabaseSnapshot: true, mediaReferencesCovered: true, stableBucketListing: true, objectHashes: true, restorationRehearsed: false },
      excludes: ["credentials", "PostgreSQL global roles", "bucket policies and version history", "working-tree source files"] };
    await write(path.join(directory, "checkpoint.json"), `${JSON.stringify(checkpoint, null, 2)}\n`);
    await write(path.join(directory, "git-status.txt"), gitStatus);
    await fs.copyFile(path.join(src, "scripts/restore-progress-objects.mjs"), path.join(directory, "restore-objects.mjs"));
    await fs.chmod(path.join(directory, "restore-objects.mjs"), 0o600);
    await write(path.join(directory, "PROGRESO.md"), `# Progreso — ${checkpoint.completedAt}\n\n${note}\n\nGit: ${head}; cambios sin commit: ${checkpoint.dirty ? "sí" : "no"}.\n${state.posts.length} borradores, ${state.publications} publicaciones, ${state.media.length} activos y ${manifest.objects.length} objetos.\n\nRespaldo lógico de TODA la BD y de los objetos actuales del bucket, no una copia del código ni de credenciales/configuración.\nEl dump usa un snapshot exportado y los objetos inmutables se verifican por SHA-256 y listado estable. No es un snapshot distribuido ni una restauración ensayada.\n\n## Recuperación\n\nCompartir solo por canal privado; el dump puede contener datos sensibles. Crear una BD vacía compatible y un bucket nuevo privado en destinos aislados.\n\n1. Verificar SHA256SUMS y el .sha256 del archivo tar.gz.\n2. Restaurar postgres.dump mediante pg_restore --exit-on-error --no-owner --no-privileges en la BD aislada.\n3. Extraer este paquete bajo src/backups/ para resolver las dependencias instaladas. Ejecutar node RUTA/restore-objects.mjs para verificar los archivos sin subir nada.\n4. Configurar S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY para el destino aislado. Ejecutar node RUTA/restore-objects.mjs --execute solo con autorización: exige bucket vacío y no sobrescribe objetos.\n5. Comprobar contrato, filas, objetos, permisos y URLs antes de cualquier corte. Nunca restaurar encima del entorno activo ni borrar datos automáticamente.\n`);
    const files = ["postgres.dump", "postgres.list", "rustfs-manifest.json", "checkpoint.json", "git-status.txt", "restore-objects.mjs", "PROGRESO.md", ...manifest.objects.map((object) => object.file)];
    const checksums = [];
    for (const file of files) checksums.push(`${await hashFile(path.join(directory, file))}  ${file}`);
    await write(path.join(directory, "SHA256SUMS"), `${checksums.join("\n")}\n`);
    const archive = `${directory}.tar.gz`;
    toFile("tar", ["-czf", "-", "-C", backups, name], archive);
    execFileSync("tar", ["--compare", "--gzip", "--file", archive, "--directory", backups], { stdio: "pipe" });
    const sha256 = await hashFile(archive);
    await write(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`);
    // Only discard this run's staging files after verifying the complete archive.
    await fs.rm(directory, { recursive: true });
    return { archive, sha256, ...checkpoint };
  } catch (error) {
    console.error(`Respaldo incompleto retenido en ${directory}; no se debe usar como checkpoint válido.`);
    throw error;
  } finally {
    if (!session.stdin.destroyed) session.stdin.end("ROLLBACK;\n\\q\n");
    await closed;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.umask(0o077);
    assert.equal(process.argv.length, 3, 'Uso: node scripts/backup-progress.mjs "Avance y pendientes"');
    const result = await backupProgress(process.argv[2]);
    console.log(`Respaldo: ${path.relative(src, result.archive)}\nBD completa y ${result.objects} objetos; hashes verificados. Restauración no ensayada.`);
  } catch (error) {
    console.error(`No se completó el respaldo (${error.name}); no se modificaron ni restauraron los servicios.`);
    process.exitCode = 1;
  }
}
