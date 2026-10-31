import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canonicalJson } from "./blog-import-approval.mts";
import { resolveSourceFile } from "./blog-import-paths.mts";

export type SourceMediaFile = { id: number; storage_path: string };
export type MediaSnapshot = { bytesById: Map<number, Buffer>; entries: Array<[string, string]> };
export type SourceData = { posts: unknown[]; terms: unknown[]; post_terms: unknown[]; media: SourceMediaFile[] };
export type SourceJsonSnapshot = { data: SourceData; entries: Array<[string, string]>; sourceJsonSha256: string };
const JSON_NAMES = ["posts", "terms", "post_terms", "media"] as const;

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function snapshotSourceJson(
  read: (name: typeof JSON_NAMES[number]) => Promise<Uint8Array>,
): Promise<SourceJsonSnapshot> {
  const entries: Array<[string, string]> = [];
  const data: Record<string, unknown[]> = {};
  for (const name of JSON_NAMES) {
    const bytes = Buffer.from(await read(name));
    entries.push([`data/${name}.json`, sha256Bytes(bytes)]);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(parsed)) throw new Error(`data/${name}.json must contain an array`);
    data[name] = parsed;
  }
  return {
    data: data as unknown as SourceData,
    entries,
    sourceJsonSha256: sha256Bytes(Buffer.from(canonicalJson(entries))),
  };
}

export function sourceManifestSha256(source: SourceJsonSnapshot, media: MediaSnapshot): string {
  return sha256Bytes(Buffer.from(canonicalJson([...source.entries, ...media.entries])));
}

export async function readSourceJsonSnapshot(root: string): Promise<SourceJsonSnapshot> {
  return snapshotSourceJson(async (name) => readFile(await resolveSourceFile(root, `data/${name}.json`)));
}

export async function snapshotMediaFiles<T extends SourceMediaFile>(
  files: T[],
  read: (file: T) => Promise<Uint8Array>,
): Promise<MediaSnapshot> {
  const bytesById = new Map<number, Buffer>();
  const entries: Array<[string, string]> = [];
  for (const file of [...files].sort((a, b) => a.id - b.id)) {
    if (bytesById.has(file.id)) throw new Error(`duplicate source media id: ${file.id}`);
    const bytes = Buffer.from(await read(file));
    bytesById.set(file.id, bytes);
    entries.push([`public/media/${file.storage_path}`, sha256Bytes(bytes)]);
  }
  return { bytesById, entries };
}
