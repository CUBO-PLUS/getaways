import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, errors } from "jose";
import { db } from "@/infrastructure/prisma/db";

const COOKIE = "guest_session";
const SESSION_SECONDS = 8 * 60 * 60;
const issuer = "gateways";
const audience = "gateways-guest";

export class GuestAccountsUnavailableError extends Error {
  constructor() {
    super("Guest accounts are unavailable.");
    this.name = "GuestAccountsUnavailableError";
  }
}

function config() {
  const secret = process.env.BLOG_SESSION_SECRET;
  const origin = process.env.BLOG_APP_ORIGIN;
  if (!secret || Buffer.byteLength(secret) < 32 || !origin) throw new GuestAccountsUnavailableError();
  let url: URL;
  try { url = new URL(origin); } catch { throw new GuestAccountsUnavailableError(); }
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) throw new GuestAccountsUnavailableError();
  return { secret: new TextEncoder().encode(secret), origin };
}

export function assertGuestAccountsAvailable(): void { config(); }
export function assertGuestSameOrigin(request: Request): boolean {
  try { return request.headers.get("origin") === config().origin; } catch { return false; }
}
export function guestSessionCookie(token: string, maxAge = SESSION_SECONDS): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config().origin.startsWith("https:") ? "; Secure" : ""}`;
}
export async function createGuestSession(id: number, authVersion: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sv: authVersion }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setIssuedAt(now).setExpirationTime(now + SESSION_SECONDS).setIssuer(issuer).setAudience(audience).sign(config().secret);
}
async function claims(request?: Request): Promise<{ id: number; authVersion: number } | null> {
  let secret: Uint8Array;
  try { secret = config().secret; } catch { return null; }
  const token = request
    ? request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    : (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer, audience, requiredClaims: ["sub", "sv", "iat", "exp"], maxTokenAge: SESSION_SECONDS });
    const id = Number(payload.sub), now = Math.floor(Date.now() / 1000);
    if (!/^[1-9]\d*$/.test(payload.sub ?? "") || !Number.isSafeInteger(id) || id > 2147483647 || !Number.isSafeInteger(payload.sv) || Number(payload.sv) < 1 || Number(payload.sv) > 2147483647 || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat! > now || payload.exp! - payload.iat! !== SESSION_SECONDS) return null;
    return { id, authVersion: Number(payload.sv) };
  } catch (error) { if (error instanceof errors.JOSEError) return null; throw error; }
}
export async function getGuestSession(request?: Request): Promise<{ id: number; name: string; email: string; authVersion: number } | null> {
  let identity: Awaited<ReturnType<typeof claims>>;
  try { identity = await claims(request); } catch { return null; }
  if (!identity) return null;
  const rows = await db.runtime().query(db.raw.sql`SELECT "id", "name", "email", "authVersion" FROM "GuestAccount" WHERE "id" = ${identity.id} AND "active" = true AND "authVersion" = ${identity.authVersion}`.returnsRow({ id: "pg/int4@1", name: "pg/text@1", email: "pg/text@1", authVersion: "pg/int4@1" }).build());
  return rows[0] ?? null;
}
export async function revokeGuestSession(request: Request): Promise<void> {
  const identity = await claims(request);
  if (identity) await db.runtime().execute(db.raw.sql`UPDATE "GuestAccount" SET "authVersion" = "authVersion" + 1 WHERE "id" = ${identity.id} AND "authVersion" = ${identity.authVersion}`.affectedCount().build());
}
