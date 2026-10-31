import { expect, it } from "vitest";
import { canonicalJson } from "../../../scripts/blog-import-approval.mts";
import { sha256Bytes, snapshotMediaFiles, snapshotSourceJson } from "../../../scripts/blog-import-source.mts";

it("hashes and retains the same one-time media read used by import", async () => {
  let reads = 0;
  const mutableSource = Buffer.from("reviewed bytes");
  const snapshot = await snapshotMediaFiles([{ id: 5, storage_path: "2025/photo.jpg" }], async () => {
    reads += 1;
    if (reads > 1) return Buffer.from("changed bytes");
    return mutableSource;
  });
  mutableSource.fill(0);

  const bytesForUpload = snapshot.bytesById.get(5);
  expect(reads).toBe(1);
  expect(bytesForUpload?.toString()).toBe("reviewed bytes");
  expect(snapshot.entries).toEqual([["public/media/2025/photo.jpg", sha256Bytes(bytesForUpload!)] ]);
});

it("parses and hashes each source JSON from one captured byte buffer", async () => {
  const originals = new Map([
    ["posts", Buffer.from('[{"id":1,"title":"approved"}]')],
    ["terms", Buffer.from("[]")],
    ["post_terms", Buffer.from("[]")],
    ["media", Buffer.from('[{"id":5,"wp_id":77,"storage_path":"photo.jpg"}]')],
  ]);
  const calls = new Map<string, number>();
  const snapshot = await snapshotSourceJson(async (name) => {
    const count = (calls.get(name) ?? 0) + 1;
    calls.set(name, count);
    return count === 1 ? originals.get(name)! : Buffer.from("[]");
  });

  expect([...calls.values()]).toEqual([1, 1, 1, 1]);
  expect(snapshot.data.posts).toEqual([{ id: 1, title: "approved" }]);
  expect(snapshot.data.media).toEqual([{ id: 5, wp_id: 77, storage_path: "photo.jpg" }]);
  expect(snapshot.entries[0]).toEqual(["data/posts.json", sha256Bytes(originals.get("posts")!)]);
  expect(snapshot.sourceJsonSha256).toBe(sha256Bytes(Buffer.from(canonicalJson(snapshot.entries))));
});
