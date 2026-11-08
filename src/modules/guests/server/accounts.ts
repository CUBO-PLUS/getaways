import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/infrastructure/prisma/db";
import { reserveLoginAttempt } from "@/modules/auth/server/login-throttle";
import { createGuestSession } from "./auth";

const dummyHash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxwQOnVQ4WXB9mIXbn/Y4hRgj9G";
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Optional: an empty value means the guest chose not to share a number.
const cleanPhone = (phone: string | undefined) => phone?.trim() || null;
const validPhone = (phone: string | null) => phone === null || (phone.length <= 32 && /^\+?[0-9 ()-]{6,}$/.test(phone));

export async function registerGuest(request: Request, name: string, email: string, password: string, phone?: string) {
  const normalized = email.trim().toLowerCase();
  const cleanName = name.trim();
  const guestPhone = cleanPhone(phone);
  if (!cleanName || cleanName.length > 120 || !validEmail(normalized) || !validPhone(guestPhone) || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) return { error: "validation" as const };
  const retryAfter = await reserveLoginAttempt(request, `guest:${normalized}`);
  if (retryAfter) return { error: "throttled" as const, retryAfter };
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await db.runtime().query(db.raw.sql`INSERT INTO "GuestAccount" ("name", "email", "phone", "passwordHash", "authVersion", "active", "createdAt", "updatedAt") VALUES (${cleanName}, ${normalized}, NULLIF(${guestPhone ?? ""}, ''), ${passwordHash}, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING RETURNING "id", "authVersion"`.returnsRow({ id: "pg/int4@1", authVersion: "pg/int4@1" }).build());
  return rows[0] ? { token: await createGuestSession(rows[0].id, rows[0].authVersion) } : { error: "duplicate" as const };
}

export async function loginGuest(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!validEmail(normalized) || !password || Buffer.byteLength(password, "utf8") > 72) return { error: "credentials" as const };
  const rows = await db.runtime().query(db.raw.sql`SELECT "id", "passwordHash", "authVersion" FROM "GuestAccount" WHERE "email" = ${normalized} AND "active" = true`.returnsRow({ id: "pg/int4@1", passwordHash: "pg/text@1", authVersion: "pg/int4@1" }).build());
  const account = rows[0];
  const match = await bcrypt.compare(password, account?.passwordHash ?? dummyHash);
  if (!account || !match) return { error: "credentials" as const };
  const current = await db.runtime().query(db.raw.sql`SELECT "id" FROM "GuestAccount" WHERE "id" = ${account.id} AND "active" = true AND "authVersion" = ${account.authVersion} AND "passwordHash" = ${account.passwordHash}`.returnsRow({ id: "pg/int4@1" }).build());
  return current[0] ? { token: await createGuestSession(account.id, account.authVersion) } : { error: "credentials" as const };
}
