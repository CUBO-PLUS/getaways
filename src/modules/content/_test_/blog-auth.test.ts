import { afterEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { POST as uploadMedia } from "@/app/api/blog/media/route";
import { assertSameOrigin, isBlogAdmin, login, sessionCookie } from "../server/blog-auth";

const saved = { hash: process.env.BLOG_ADMIN_PASSWORD_HASH, secret: process.env.BLOG_SESSION_SECRET, origin: process.env.BLOG_APP_ORIGIN };
afterEach(() => {
  for (const [key, value] of Object.entries({ BLOG_ADMIN_PASSWORD_HASH: saved.hash, BLOG_SESSION_SECRET: saved.secret, BLOG_APP_ORIGIN: saved.origin })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("blog admin session", () => {
  it("only issues a server-verifiable session for the configured password and trusted origin", async () => {
    process.env.BLOG_ADMIN_PASSWORD_HASH = await bcrypt.hash("correct-password", 4);
    process.env.BLOG_SESSION_SECRET = "x".repeat(40);
    process.env.BLOG_APP_ORIGIN = "https://blog.example";
    expect(assertSameOrigin(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example/path" } }))).toBe(false);
    expect(assertSameOrigin(new Request("https://blog.example/api/login", { headers: { origin: "not an origin" } }))).toBe(false);
    expect(await login(new Request("https://blog.example/api/login", { headers: { origin: "https://attacker.example" } }), "correct-password")).toBeNull();
    const token = await login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example" } }), "correct-password");
    expect(token).toBeTruthy();
    const request = new Request("https://blog.example/api/blog/media/1", { headers: { cookie: sessionCookie(token!) } });
    expect(await isBlogAdmin(request)).toBe(true);
    expect(await isBlogAdmin(new Request("https://blog.example/api/blog/media/1"))).toBe(false);
    const malformedMultipart = await uploadMedia(new Request("https://blog.example/api/blog/media", {
      method: "POST",
      headers: { origin: "https://blog.example", cookie: sessionCookie(token!), "content-type": "multipart/form-data", "content-length": "100" },
      body: "not a multipart body",
    }));
    expect(malformedMultipart.status).toBe(400);
    let release!: () => void;
    const bcryptGate = new Promise<void>((resolve) => { release = resolve; });
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(async () => { await bcryptGate; return false; });
    const attempts = Array.from({ length: 7 }, () => login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example" } }), "wrong-password"));
    expect(compare).toHaveBeenCalledTimes(5);
    const realNow = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(realNow + 16 * 60_000);
    const afterExpiry = Array.from({ length: 3 }, () => login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example" } }), "wrong-password"));
    expect(compare).toHaveBeenCalledTimes(5);
    expect((await Promise.all(afterExpiry)).every((result) => result === null)).toBe(true);
    release();
    expect((await Promise.all(attempts)).every((result) => result === null)).toBe(true);
    compare.mockRestore();
    const afterSlowFailures = await login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example" } }), "correct-password");
    expect(afterSlowFailures).toBeTruthy();
    clock.mockRestore();
    for (let i = 0; i < 5; i++) await login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example" } }), "wrong-password");
    expect(await login(new Request("https://blog.example/api/login", { headers: { origin: "https://blog.example", "x-forwarded-for": "new-address" } }), "correct-password")).toBeNull();
  });
});
