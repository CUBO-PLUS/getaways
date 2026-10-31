import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

const COOKIE = "blog_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;
let loginFailures = { count: 0, until: 0 };
let loginInFlight = 0;
let loginWindow = 0;
let loginWindowInFlight = 0;

function config() {
  const { BLOG_ADMIN_PASSWORD_HASH, BLOG_SESSION_SECRET, BLOG_APP_ORIGIN } = process.env;
  if (!BLOG_ADMIN_PASSWORD_HASH || !/^\$2[aby]\$\d\d\$/.test(BLOG_ADMIN_PASSWORD_HASH) || !BLOG_SESSION_SECRET || Buffer.byteLength(BLOG_SESSION_SECRET) < 32 || !BLOG_APP_ORIGIN) {
    throw new Error("Blog administrator authentication is not configured safely");
  }
  let origin: URL;
  try { origin = new URL(BLOG_APP_ORIGIN); }
  catch { throw new Error("BLOG_APP_ORIGIN must be a valid origin"); }
  if (origin.origin !== BLOG_APP_ORIGIN || !["http:", "https:"].includes(origin.protocol)) throw new Error("BLOG_APP_ORIGIN must contain only the exact origin");
  return { hash: BLOG_ADMIN_PASSWORD_HASH, secret: new TextEncoder().encode(BLOG_SESSION_SECRET), origin: BLOG_APP_ORIGIN };
}

export async function login(request: Request, password: unknown): Promise<string | null> {
  const c = config();
  if (!assertSameOrigin(request, c.origin)) return null;
  const now = Date.now();
  if (loginInFlight >= 5) return null;
  if (loginFailures.until <= now) {
    loginFailures = { count: 0, until: now + 15 * 60_000 };
    loginWindow++;
    loginWindowInFlight = 0;
  }
  if (loginFailures.count + loginWindowInFlight >= 5) return null;
  const attemptWindow = loginWindow;
  loginInFlight++;
  loginWindowInFlight++;
  let ok = false;
  try { ok = typeof password === "string" && Buffer.byteLength(password) <= 72 && await bcrypt.compare(password, c.hash); }
  finally {
    loginInFlight--;
    if (attemptWindow === loginWindow) loginWindowInFlight--;
  }
  if (!ok) {
    if (attemptWindow === loginWindow) loginFailures.count++;
    return null;
  }
  return new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setIssuer("blog").setAudience("blog-admin").setExpirationTime(`${SESSION_SECONDS}s`).sign(c.secret);
}

export function assertSameOrigin(request: Request, expected = config().origin): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === expected;
}

export async function isBlogAdmin(request: Request): Promise<boolean> {
  try {
    const { secret } = config();
    const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token) return false;
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: "blog", audience: "blog-admin" });
    return payload.role === "admin";
  } catch { return false; }
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
