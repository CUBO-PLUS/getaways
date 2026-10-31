import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertSourceTree, resolveMediaFile, resolveSourceFile } from "../../../scripts/blog-import-paths.mts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

it("allows media rooted inside the canonical source and rejects traversal and escaping symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blog-media-root-"));
  roots.push(root);
  await mkdir(path.join(root, "public/media/2025"), { recursive: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  for (const name of ["posts", "terms", "post_terms", "media"]) await writeFile(path.join(root, `data/${name}.json`), "[]");
  await writeFile(path.join(root, "public/media/2025/photo.jpg"), "inside");
  const outside = await mkdtemp(path.join(tmpdir(), "blog-media-outside-"));
  roots.push(outside);
  await writeFile(path.join(outside, "secret.jpg"), "outside");
  await symlink(path.join(outside, "secret.jpg"), path.join(root, "public/media/escape.jpg"));

  expect(await resolveMediaFile(root, "2025/photo.jpg")).toBe(await realpath(path.join(root, "public/media/2025/photo.jpg")));
  expect(await resolveSourceFile(root, "data/posts.json")).toBe(await realpath(path.join(root, "data/posts.json")));
  await expect(resolveMediaFile(root, "../secret.jpg")).rejects.toThrow(/escapes source directory/);
  await expect(resolveMediaFile(root, "escape.jpg")).rejects.toThrow(/symlink escapes source directory/);

  const linkedRoot = await mkdtemp(path.join(tmpdir(), "blog-media-linked-root-"));
  roots.push(linkedRoot);
  await mkdir(path.join(linkedRoot, "public"), { recursive: true });
  await symlink(outside, path.join(linkedRoot, "public/media"));
  await expect(resolveMediaFile(linkedRoot, "secret.jpg")).rejects.toThrow(/public\/media resolves outside/);

  const linkedDataRoot = await mkdtemp(path.join(tmpdir(), "blog-data-linked-root-"));
  roots.push(linkedDataRoot);
  await mkdir(path.join(linkedDataRoot, "data"), { recursive: true });
  await mkdir(path.join(linkedDataRoot, "public/media"), { recursive: true });
  await symlink(path.join(outside, "secret.jpg"), path.join(linkedDataRoot, "data/posts.json"));
  await expect(assertSourceTree(linkedDataRoot)).rejects.toThrow(/source symlink escapes root/);
});
