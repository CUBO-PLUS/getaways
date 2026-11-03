import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { db } from "@/infrastructure/prisma/db";

// Only enable behind a proxy that overwrites X-Real-IP and cannot be bypassed.
export async function reserveLoginAttempt(request: Request, email: string): Promise<number> {
  const secret = process.env.BLOG_SESSION_SECRET;
  const forwardedIp = request.headers.get("x-real-ip");
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Login throttle is not configured");
  if (process.env.AUTH_TRUST_PROXY === "1" && (!forwardedIp || !isIP(forwardedIp))) throw new Error("Trusted login proxy is not configured");
  // ponytail: one shared budget without a trusted proxy; use a verified proxy for per-IP limits.
  const ip = process.env.AUTH_TRUST_PROXY === "1" ? forwardedIp! : "shared";
  const key = (kind: string, value: string) => `${kind}:${createHmac("sha256", secret).update(value).digest("hex")}`;
  let retryAfter = 0;
  for (const [bucket, limit] of [[key("email", email), 5], [key("ip", ip), 50]] as const) {
    const rows = await db.runtime().query(db.raw.sql`
      INSERT INTO "AdminLoginThrottle" ("key", "attempts", "windowEndsAt")
      VALUES (${bucket}, 1, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "AdminLoginThrottle"."windowEndsAt" <= CURRENT_TIMESTAMP THEN 1 WHEN "AdminLoginThrottle"."attempts" >= 2147483647 THEN 2147483647 ELSE "AdminLoginThrottle"."attempts" + 1 END,
        "windowEndsAt" = CASE WHEN "AdminLoginThrottle"."windowEndsAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes' ELSE "AdminLoginThrottle"."windowEndsAt" END
      RETURNING "attempts", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("windowEndsAt" - CURRENT_TIMESTAMP))))::int AS "retryAfter"
    `.returnsRow({ attempts: "pg/int4@1", retryAfter: "pg/int4@1" }).build());
    if (!rows[0]) throw new Error("Throttle reservation failed");
    if (rows[0].attempts > limit) retryAfter = Math.max(retryAfter, rows[0].retryAfter);
  }
  // Limit cleanup work per request, including under high-cardinality attacks.
  if (Math.random() < 0.01) await db.runtime().execute(db.raw.sql`DELETE FROM "AdminLoginThrottle" WHERE "windowEndsAt" <= CURRENT_TIMESTAMP AND "key" IN (SELECT "key" FROM "AdminLoginThrottle" WHERE "windowEndsAt" <= CURRENT_TIMESTAMP LIMIT 100)`.affectedCount().build());
  return retryAfter;
}
