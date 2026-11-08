import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { runRagQueueBatch } = await import("../modules/rag/queue-worker.ts");
const { runInitialRagIndex } = await import("../modules/rag/initial-indexer.ts");
const { db } = await import("../infrastructure/prisma/db.ts");
let stopping = false;
let wakeSleep: (() => void) | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    wakeSleep?.();
  });
}

function interval(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

const maxBackoffMs = 300_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      wakeSleep = undefined;
      resolve();
    }
    wakeSleep = done;
    if (stopping) done();
  });
}

function errorKind(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

try {
  const pollMs = interval("RAG_WORKER_POLL_MS", 5_000, 1_000, 60_000);
  const reconcileMs = interval("RAG_RECONCILE_INTERVAL_MS", 900_000, 60_000, 86_400_000);
  let nextReconcile = 0;
  let reconcileBackoff = 1_000;
  let workerBackoff = 1_000;
  while (!stopping) {
    if (Date.now() >= nextReconcile) {
      try {
        const report = await runInitialRagIndex({ write: true });
        console.info("RAG reconciliation", {
          eligible: report.eligible, queued: report.queued, unchanged: report.unchanged,
          omitted: report.omitted, failed: report.failed,
        });
        nextReconcile = Date.now() + (report.failed ? reconcileBackoff : reconcileMs);
        reconcileBackoff = report.failed ? Math.min(reconcileBackoff * 2, maxBackoffMs) : 1_000;
      } catch (error) {
        console.error("RAG reconciliation failed", { error: errorKind(error) });
        nextReconcile = Date.now() + reconcileBackoff;
        reconcileBackoff = Math.min(reconcileBackoff * 2, maxBackoffMs);
      }
    }
    if (stopping) break;
    let delay = pollMs;
    try {
      const report = await runRagQueueBatch(10);
      if (report.claimed) console.info("RAG queue batch", report);
      workerBackoff = 1_000;
    } catch (error) {
      console.error("RAG queue worker batch failed", { error: errorKind(error) });
      delay = workerBackoff;
      workerBackoff = Math.min(workerBackoff * 2, maxBackoffMs);
    }
    if (!stopping) await sleep(Math.min(Math.max(pollMs, delay), Math.max(0, nextReconcile - Date.now())) || Math.max(pollMs, delay));
  }
} finally {
  await db.close();
}
