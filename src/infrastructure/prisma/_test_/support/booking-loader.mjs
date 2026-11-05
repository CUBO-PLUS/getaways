import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return nextResolve(pathToFileURL(`${root}_test_/support/server-only-stub.ts`).href, context);
  if (["next/server", "next/headers"].includes(specifier)) return nextResolve(`${specifier}.js`, context);
  if (specifier.startsWith("@/")) specifier = pathToFileURL(root + specifier.slice(2)).href;
  if (specifier.startsWith(".") || specifier.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL);
    if (existsSync(fileURLToPath(url) + ".ts")) return nextResolve(url.href + ".ts", context);
    if (existsSync(fileURLToPath(url) + "/index.ts")) return nextResolve(url.href + "/index.ts", context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
}
