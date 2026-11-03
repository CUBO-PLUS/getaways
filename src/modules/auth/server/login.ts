import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/infrastructure/prisma/db";
import { createSession } from "./auth";
import { reserveLoginAttempt } from "./login-throttle";

const dummyHash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxwQOnVQ4WXB9mIXbn/Y4hRgj9G";

export async function login(request: Request, email: string, password: string): Promise<{ token?: string; retryAfter?: number }> {
  const normalized = email.trim().toLowerCase();
  const retryAfter = await reserveLoginAttempt(request, normalized);
  if (retryAfter) return { retryAfter };
  const query = db.raw.sql`SELECT "id", "passwordHash", "authVersion" FROM "AdminUser" WHERE "email" = ${normalized} AND "active" = true`.returnsRow({ id: "pg/int4@1", passwordHash: "pg/text@1", authVersion: "pg/int4@1" }).build();
  const user = (await db.runtime().query(query))[0];
  const match = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !match) return {};
  const current = await db.runtime().query(db.raw.sql`SELECT "id" FROM "AdminUser" WHERE "id" = ${user.id} AND "active" = true AND "authVersion" = ${user.authVersion} AND "passwordHash" = ${user.passwordHash}`.returnsRow({ id: "pg/int4@1" }).build());
  if (!current[0]) return {};
  return { token: await createSession(user.id, user.authVersion) };
}
