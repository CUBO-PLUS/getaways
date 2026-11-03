import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, errors } from "jose";
import { db } from "@/infrastructure/prisma/db";

const COOKIE = "blog_admin_session";
export const SESSION_SECONDS = 8 * 60 * 60;
const issuer = "gateways";
const audience = "gateways-admin";
export const roles = ["ADMIN", "EDITOR", "BOOKING_MANAGER"] as const;
export type Role = typeof roles[number];
export type Session = { id: number; role: Role; authVersion: number };

function config() {
  const secret = process.env.BLOG_SESSION_SECRET;
  const origin = process.env.BLOG_APP_ORIGIN;
  if (!secret || Buffer.byteLength(secret) < 32 || !origin) throw new Error("Authentication is not configured");
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("Invalid authentication origin"); }
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error("Invalid authentication origin");
  return { secret: new TextEncoder().encode(secret), origin };
}

export function assertSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === config().origin;
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function createSession(id: number, authVersion: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sv: authVersion }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setIssuedAt(now).setExpirationTime(now + SESSION_SECONDS).setIssuer(issuer).setAudience(audience).sign(config().secret);
}

async function claims(request?: Request): Promise<{ id: number; authVersion: number } | null> {
  const token = request
    ? request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    : (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const secret = config().secret;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer, audience, requiredClaims: ["sub", "sv", "iat", "exp"], maxTokenAge: SESSION_SECONDS });
    const id = Number(payload.sub);
    const now = Math.floor(Date.now() / 1000);
    if (!/^[1-9]\d*$/.test(payload.sub ?? "") || !Number.isSafeInteger(id) || id > 2147483647 || !Number.isSafeInteger(payload.sv) || Number(payload.sv) < 1 || Number(payload.sv) > 2147483647 || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat! > now || payload.exp! - payload.iat! !== SESSION_SECONDS) return null;
    return { id, authVersion: Number(payload.sv) };
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }
}

export async function getSession(request?: Request): Promise<Session | null> {
  const identity = await claims(request);
  if (!identity) return null;
  const rows = await db.runtime().query(db.raw.sql`SELECT "id", "role", "authVersion" FROM "AdminUser" WHERE "id" = ${identity.id} AND "active" = true AND "authVersion" = ${identity.authVersion}`.returnsRow({ id: "pg/int4@1", role: "pg/text@1", authVersion: "pg/int4@1" }).build());
  const user = rows[0];
  if (!user || !roles.includes(user.role as Role)) return null;
  return { id: user.id, role: user.role as Role, authVersion: user.authVersion };
}

export async function revokeSession(request: Request): Promise<void> {
  const identity = await claims(request);
  if (!identity) return;
  await db.runtime().execute(db.raw.sql`UPDATE "AdminUser" SET "authVersion" = "authVersion" + 1 WHERE "id" = ${identity.id} AND "authVersion" = ${identity.authVersion}`.affectedCount().build());
}
