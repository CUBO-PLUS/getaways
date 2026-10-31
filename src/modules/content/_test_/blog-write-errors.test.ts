import { afterEach, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { POST as unpublish } from "@/app/api/blog/admin/posts/[id]/unpublish/route";
import { login, sessionCookie } from "../server/blog-auth";
import { parseBlogId } from "../blog-ids";

const saved = { hash: process.env.BLOG_ADMIN_PASSWORD_HASH, secret: process.env.BLOG_SESSION_SECRET, origin: process.env.BLOG_APP_ORIGIN };
afterEach(() => {
  for (const [key, value] of Object.entries({ BLOG_ADMIN_PASSWORD_HASH: saved.hash, BLOG_SESSION_SECRET: saved.secret, BLOG_APP_ORIGIN: saved.origin })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it("rejects malformed JSON and IDs outside PostgreSQL int4 before database access", async () => {
  process.env.BLOG_ADMIN_PASSWORD_HASH = await bcrypt.hash("correct-password", 4);
  process.env.BLOG_SESSION_SECRET = "x".repeat(40);
  process.env.BLOG_APP_ORIGIN = "https://blog.example";
  const token = await login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example" } }), "correct-password");
  const headers = { origin: "https://blog.example", cookie: sessionCookie(token!) };
  const malformed = await unpublish(new Request("https://blog.example/api/blog/admin/posts/1/unpublish", { method: "POST", headers, body: "{" }), { params: Promise.resolve({ id: "1" }) });
  expect(malformed.status).toBe(400);
  const unsafeId = await unpublish(new Request("https://blog.example/api/blog/admin/posts/2147483648/unpublish", { method: "POST", headers, body: '{"version":1}' }), { params: Promise.resolve({ id: "2147483648" }) });
  expect(unsafeId.status).toBe(404);
  expect(parseBlogId("2147483647")).toBe(2147483647);
  expect(parseBlogId("2147483648")).toBeNull();
});
