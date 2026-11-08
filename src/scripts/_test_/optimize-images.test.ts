import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Asset = { id: number; objectKey: string; mimeType: string; sizeBytes: bigint | number; width: number; height: number };
type CommandInput = { Key: string; Body: Uint8Array; ContentType: string; Metadata?: Record<string, string> };

const { assets, listed, objects, events, send, close, transaction, failSwap, corruptTarget, swapCompleted } = vi.hoisted(() => ({
  assets: [] as Asset[],
  listed: [] as Array<Record<string, unknown>>,
  objects: new Map<string, { bytes: Buffer; type: string; metadata?: Record<string, string>; etag: string }>(),
  events: [] as string[],
  send: vi.fn(), close: vi.fn(), transaction: vi.fn(), failSwap: { value: false }, corruptTarget: { value: false }, swapCompleted: { value: false },
}));
vi.mock("@/infrastructure/prisma/db", () => ({ db: {
  orm: { public: { MediaAsset: { all: () => Promise.resolve(assets.map(asset => ({ ...asset }))) } } },
  close,
  raw: { sql: () => ({ affectedCount: () => ({ build: () => ({}) }) }) },
  transaction,
} }));
vi.mock("@/infrastructure/storage/s3", () => ({ getBlogMediaBucket: () => "media", getS3Client: () => ({ send, destroy: vi.fn() }) }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: CommandInput) {} }
  return {
    DeleteObjectCommand: class extends Command {}, GetObjectCommand: class extends Command {},
    HeadObjectCommand: class extends Command {}, PutObjectCommand: class extends Command {},
    paginateListObjectsV2: async function* () { yield { Contents: listed }; },
  };
});

import { optimizeImages } from "../optimize-images.mts";

beforeEach(() => {
  vi.clearAllMocks(); assets.length = 0; listed.length = 0; objects.clear(); events.length = 0;
  failSwap.value = false; corruptTarget.value = false; swapCompleted.value = false;
  transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    const result = await callback({
    execute: async () => {
      if (failSwap.value) throw new Error("database unavailable");
      return { affectedRows: 1 };
    },
    orm: { public: { MediaAsset: { where: ({ id, objectKey }: { id?: number; objectKey?: string }) => ({
      forUpdate: () => ({ first: async () => assets.find(asset => asset.id === id) ?? null }),
      all: async () => assets.filter(asset => asset.objectKey === objectKey),
    }) } } },
    });
    if (!swapCompleted.value && !failSwap.value) {
      const target = [...objects.keys()].find(key => key.startsWith("images/optimized/"));
      if (target) assets[0].objectKey = target;
      swapCompleted.value = true;
      events.push("swap-commit");
    }
    return result;
  });
  send.mockImplementation(async (command: { constructor: { name: string }; input: CommandInput }) => {
    const name = command.constructor.name;
    const key = command.input.Key as string;
    const object = objects.get(key);
    if (name === "HeadObjectCommand") {
      if (!object) throw Object.assign(new Error("missing"), { name: "NotFound" });
      return { ETag: object.etag, ContentLength: object.bytes.length, ContentType: object.type, Metadata: object.metadata };
    }
    if (name === "GetObjectCommand") {
      if (!object) throw Object.assign(new Error("missing"), { name: "NotFound" });
      const bytes = corruptTarget.value && key.startsWith("images/optimized/") ? Buffer.from("not the uploaded target") : object.bytes;
      return { Body: { transformToByteArray: async () => bytes } };
    }
    if (name === "PutObjectCommand") {
      objects.set(key, { bytes: Buffer.from(command.input.Body), type: command.input.ContentType, metadata: command.input.Metadata, etag: '"target-etag"' });
      events.push("put-target");
      return {};
    }
    if (name === "DeleteObjectCommand") {
      objects.delete(key);
      events.push("delete-source");
      return {};
    }
    throw new Error(`unexpected S3 request: ${name}`);
  });
});
const originalExitCode = process.exitCode;
afterEach(() => { process.exitCode = originalExitCode; });

function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }

async function seedSource() {
  const sourceKey = "uploads/original.png";
  const source = await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } }).png().toBuffer();
  assets.push({ id: 1, objectKey: sourceKey, mimeType: "image/png", sizeBytes: BigInt(source.length), width: 12, height: 8 });
  objects.set(sourceKey, { bytes: source, type: "image/png", etag: '"source-etag"' });
  listed.push({ Key: sourceKey, Size: source.length, ETag: '"source-etag"' });
  return { sourceKey, source };
}

it("dry-run never deletes the original for a verified already-optimized asset", async () => {
  const { sourceKey, source } = await seedSource();
  const optimized = await sharp(source).webp({ quality: 82, effort: 4 }).toBuffer();
  const key = `images/optimized/${hash(Buffer.from(sourceKey))}/${hash(optimized)}.webp`;
  assets[0].objectKey = key; assets[0].mimeType = "image/webp"; assets[0].sizeBytes = BigInt(optimized.length);
  objects.set(key, { bytes: optimized, type: "image/webp", etag: '"target-etag"', metadata: { sha256: hash(optimized), "source-key": sourceKey, "source-sha256": hash(source) } });
  listed.push({ Key: key, Size: optimized.length, ETag: '"target-etag"' });
  const result = await optimizeImages(false);
  expect(result).toMatchObject({ mode: "dry-run", alreadyOptimized: 1, failures: [], missing: [] });
  expect(objects.has(sourceKey)).toBe(true);
  expect(send.mock.calls.some(([command]) => command.constructor.name === "DeleteObjectCommand")).toBe(false);
});

it("applies the verified target before swapping the row and deleting source; retry is idempotent", async () => {
  const { sourceKey } = await seedSource();
  const first = await optimizeImages(true);
  expect(first).toMatchObject({ mode: "applied", failures: [], missing: [] });
  expect(first.migrated).toHaveLength(1);
  const target = first.migrated[0].new.objectKey;
  expect(objects.has(target)).toBe(true);
  expect(await sharp(objects.get(target)!.bytes).metadata()).toMatchObject({ format: "webp" });
  expect(objects.has(sourceKey)).toBe(false);
  expect(send.mock.calls.filter(([command]) => command.constructor.name === "PutObjectCommand")).toHaveLength(1);
  expect(events).toEqual(["put-target", "swap-commit", "delete-source"]);

  assets[0] = { ...assets[0], ...first.migrated[0].new };
  listed.splice(0, listed.length, { Key: target, Size: objects.get(target)!.bytes.length, ETag: '"target-etag"' });
  send.mockClear();
  const retry = await optimizeImages(true);
  expect(retry).toMatchObject({ mode: "applied", alreadyOptimized: 1, failures: [], missing: [] });
  expect(send.mock.calls.some(([command]) => ["PutObjectCommand", "DeleteObjectCommand"].includes(command.constructor.name))).toBe(false);
});

it("does not swap or delete the source when the uploaded target bytes fail verification", async () => {
  const { sourceKey } = await seedSource();
  corruptTarget.value = true;
  const result = await optimizeImages(true);
  expect(result.failures).toHaveLength(1);
  expect(result.migrated).toHaveLength(0);
  expect(assets[0].objectKey).toBe(sourceKey);
  expect(objects.has(sourceKey)).toBe(true);
  expect(send.mock.calls.some(([command]) => command.constructor.name === "DeleteObjectCommand")).toBe(false);
});

it("does not delete the source when the database swap fails", async () => {
  const { sourceKey } = await seedSource();
  failSwap.value = true;
  const result = await optimizeImages(true);
  expect(result.failures).toHaveLength(1);
  expect(result.migrated).toHaveLength(0);
  expect(assets[0].objectKey).toBe(sourceKey);
  expect(objects.has(sourceKey)).toBe(true);
  expect(send.mock.calls.some(([command]) => command.constructor.name === "DeleteObjectCommand")).toBe(false);
});
