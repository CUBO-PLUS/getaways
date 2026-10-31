import { realpath } from "node:fs/promises";
import path from "node:path";

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveMediaFile(root: string, relativeFile: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const canonicalMedia = await realpath(path.join(canonicalRoot, "public/media"));
  if (!isInside(canonicalRoot, canonicalMedia)) throw new Error("public/media resolves outside the source root");

  const candidate = path.resolve(canonicalMedia, relativeFile);
  if (!isInside(canonicalMedia, candidate)) throw new Error(`media path escapes source directory: ${relativeFile}`);
  const canonicalFile = await realpath(candidate);
  if (!isInside(canonicalMedia, canonicalFile)) throw new Error(`media symlink escapes source directory: ${relativeFile}`);
  return canonicalFile;
}

export async function resolveSourceFile(root: string, relativeFile: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const candidate = path.resolve(canonicalRoot, relativeFile);
  if (!isInside(canonicalRoot, candidate)) throw new Error(`source path escapes root: ${relativeFile}`);
  const canonicalFile = await realpath(candidate);
  if (!isInside(canonicalRoot, canonicalFile)) throw new Error(`source symlink escapes root: ${relativeFile}`);
  return canonicalFile;
}

export async function assertSourceTree(root: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  const mediaRoot = await realpath(path.join(canonicalRoot, "public/media"));
  if (!isInside(canonicalRoot, mediaRoot)) throw new Error("public/media resolves outside the source root");
  for (const file of ["data/posts.json", "data/terms.json", "data/post_terms.json", "data/media.json"]) {
    await resolveSourceFile(canonicalRoot, file);
  }
}
