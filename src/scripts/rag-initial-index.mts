import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { runInitialRagIndex } = await import("../modules/rag/initial-indexer.ts");
const { db } = await import("../infrastructure/prisma/db.ts");
try {
  const report = await runInitialRagIndex({ write: process.argv.includes("--enqueue") });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failed) process.exitCode = 1;
} finally {
  await db.close();
}
