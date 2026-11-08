import { db } from "./db.ts";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function enqueueRagSource(tx: Transaction, sourceType: "blog" | "listing", sourceId: number | string) {
  await tx.query(db.raw.sql`INSERT INTO "RagSourceQueue" ("sourceType", "sourceId", "generation", "status", "attempts", "availableAt", "lockedAt", "lastError", "updatedAt")
    VALUES (${sourceType}, ${String(sourceId)}, 1, 'pending', 0, CURRENT_TIMESTAMP, NULL, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT ("sourceType", "sourceId") DO UPDATE SET
      "generation" = "RagSourceQueue"."generation" + 1,
      "status" = 'pending', "attempts" = 0, "availableAt" = CURRENT_TIMESTAMP,
      "lockedAt" = NULL, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP`.affectedCount().build());
}
