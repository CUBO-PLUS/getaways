import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeApprovalTemplate } from "./blog-import.mts";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , root, conversionFile, outputFile] = process.argv;
    if (!root || !conversionFile || !outputFile) throw new Error("usage: blog:approval-template <source-root> <final-conversion.json> <approval.json>");
    const conversionBytes = await readFile(conversionFile);
    const template = await makeApprovalTemplate(path.resolve(root), conversionBytes);
    await writeFile(outputFile, `${JSON.stringify(template, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    process.stderr.write(`approval template failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
