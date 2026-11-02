import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
import { assertMediaCovered, assertStableObjects } from "../backup-progress.mjs";
import { restoreObjects } from "../restore-progress-objects.mjs";

it("accepts reordered listings but aborts on removed or replaced objects", () => {
  const before = ["a", "b"].map((Key) => ({ Key, Size: 5, ETag: `"${Key}"`, LastModified: new Date("2026-01-01T00:00:00Z") }));
  expect(() => assertStableObjects(before, [...before].reverse())).not.toThrow();
  for (const after of [before.slice(1), [before[0], { ...before[1], ETag: '"replaced"' }]]) {
    expect(() => assertStableObjects(before, after)).toThrow(/bucket cambió/);
  }
});

it("requires every DB media reference to have a matching object size and MIME type", () => {
  const media = ["a", "b"].map((id) => ({ id, objectKey: `media/${id}`, sizeBytes: "5", mimeType: "image/png" }));
  const objects = media.map((asset) => ({ key: asset.objectKey, size: 5, contentType: "image/png" }));
  expect(() => assertMediaCovered(media, { objects })).not.toThrow();
  for (const [invalid, error] of [
    [objects.slice(0, 1), /Falta un objeto/],
    [[objects[0], { ...objects[1], size: 6 }], /Tamaño distinto/],
    [[objects[0], { ...objects[1], contentType: "image/jpeg" }], /Tipo distinto/],
  ] as const) {
    expect(() => assertMediaCovered(media, { objects: invalid })).toThrow(error);
  }
});

it("verifies all hashes before S3 access and uploads only with execute to an empty destination", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "progress-restore-"));
  const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async () => ({ Contents: [] }));
  try {
    for (const [key, value] of Object.entries({
      S3_ENDPOINT: "http://unused.invalid", S3_REGION: "test-region", S3_BUCKET: "isolated-test",
      S3_ACCESS_KEY_ID: "unused-test-value", S3_SECRET_ACCESS_KEY: "unused-test-value",
    })) vi.stubEnv(key, value);
    await mkdir(path.join(directory, "objects"));
    const contents = [Buffer.from("first"), Buffer.from("second")];
    const objects = contents.map((bytes, index) => ({
      key: `media/${index}`, file: `objects/${String(index).padStart(5, "0")}`,
      size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/png",
    }));
    for (const [index, object] of objects.entries()) await writeFile(path.join(directory, object.file), contents[index]);
    await writeFile(path.join(directory, "rustfs-manifest.json"), JSON.stringify({ objects }));

    expect(await restoreObjects(directory)).toEqual({ mode: "verified-only", objects: 2 });
    expect(send).not.toHaveBeenCalled();

    // A corrupt later object must prevent even the first upload or destination query.
    await writeFile(path.join(directory, objects[1].file), "SECOND");
    await expect(restoreObjects(directory, true)).rejects.toThrow(/SHA-256 incorrecto/);
    expect(send).not.toHaveBeenCalled();
    await writeFile(path.join(directory, objects[1].file), contents[1]);

    send.mockImplementation(async () => ({ Contents: [{ Key: "existing" }] }));
    await expect(restoreObjects(directory, true)).rejects.toThrow(/destino debe estar vacío/);
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(ListObjectsV2Command));

    send.mockClear().mockImplementation(async () => ({ Contents: [] }));
    expect(await restoreObjects(directory, true)).toEqual({ mode: "restored", objects: 2 });
    const uploads = send.mock.calls.map(([command]) => command).filter((command) => command instanceof PutObjectCommand);
    expect(uploads.map((command) => command.input)).toEqual(objects.map((object, index) => expect.objectContaining({
      Bucket: "isolated-test", Key: object.key, Body: contents[index], ContentType: "image/png", IfNoneMatch: "*",
    })));
  } finally {
    send.mockRestore();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
