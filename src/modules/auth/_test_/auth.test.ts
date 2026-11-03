import { afterEach, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const query = vi.fn();
vi.mock("@/infrastructure/prisma/db", () => ({ db: { raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) }, runtime: () => ({ query }) } }));
import { createSession, getSession, sessionCookie } from "../server/auth";
import { POST as login } from "@/app/api/admin/login/route";

const secret = process.env.BLOG_SESSION_SECRET;
const origin = process.env.BLOG_APP_ORIGIN;
afterEach(() => {
  if (secret === undefined) delete process.env.BLOG_SESSION_SECRET; else process.env.BLOG_SESSION_SECRET = secret;
  if (origin === undefined) delete process.env.BLOG_APP_ORIGIN; else process.env.BLOG_APP_ORIGIN = origin;
  query.mockReset();
});

it("accepts only current users with a correctly scoped, revocable token", async () => {
  process.env.BLOG_SESSION_SECRET = "s".repeat(32);
  process.env.BLOG_APP_ORIGIN = "https://example.test";
  const request = (token: string) => new Request("https://example.test/", { headers: { cookie: sessionCookie(token) } });
  const token = await createSession(5, 2);
  query.mockResolvedValueOnce([{ id: 5, role: "EDITOR", authVersion: 2 }]).mockResolvedValueOnce([]);
  expect(await getSession(request(token))).toEqual({ id: 5, role: "EDITOR", authVersion: 2 });
  expect(await getSession(request(token))).toBeNull();
  const old = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuer("blog").setAudience("blog-admin").setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode("s".repeat(32)));
  expect(await getSession(request(old))).toBeNull();
  expect(await getSession(request(token + "x"))).toBeNull();
  expect(query).toHaveBeenCalledTimes(2);
});

it("rejects hostile origins and oversized login bodies before authentication", async () => {
  process.env.BLOG_SESSION_SECRET = "s".repeat(32);
  process.env.BLOG_APP_ORIGIN = "https://example.test";
  const send = (origin: string, body: string) => login(new Request("https://example.test/api/admin/login", { method: "POST", headers: { origin }, body }));
  expect((await send("https://attacker.test", "{}" )).status).toBe(403);
  expect((await send("https://example.test", "x".repeat(2049))).status).toBe(413);
  expect(query).not.toHaveBeenCalled();
});

it("rejects expired sessions and signed sessions without required identity claims", async () => {
  process.env.BLOG_SESSION_SECRET = "s".repeat(32);
  process.env.BLOG_APP_ORIGIN = "https://example.test";
  const key = new TextEncoder().encode(process.env.BLOG_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const sign = (payload: Record<string, unknown>, subject?: string) => {
    const jwt = new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuer("gateways").setAudience("gateways-admin");
    return subject ? jwt.setSubject(subject) : jwt;
  };
  const expired = await sign({ sv: 1 }, "5").setIssuedAt(now - 28_801).setExpirationTime(now - 1).sign(key);
  const missingSubject = await sign({ sv: 1 }).setIssuedAt(now).setExpirationTime(now + 28_800).sign(key);
  const missingVersion = await sign({}, "5").setIssuedAt(now).setExpirationTime(now + 28_800).sign(key);
  for (const token of [expired, missingSubject, missingVersion]) {
    expect(await getSession(new Request("https://example.test/", { headers: { cookie: sessionCookie(token) } }))).toBeNull();
  }
  expect(query).not.toHaveBeenCalled();
});
