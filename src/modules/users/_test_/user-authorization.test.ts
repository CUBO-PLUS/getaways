import { afterEach, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/infrastructure/prisma/db", () => ({ db: { raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) }, runtime: () => ({ query }) } }));
vi.mock("../server/users", () => ({ listUsers: vi.fn(), createUser: vi.fn(), setUserAccess: vi.fn(), resetUserPassword: vi.fn() }));

import { createSession, sessionCookie } from "@/modules/auth/server/auth";
import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[id]/route";
import { POST as resetPassword } from "@/app/api/admin/users/[id]/reset-password/route";

const secret = process.env.BLOG_SESSION_SECRET;
const origin = process.env.BLOG_APP_ORIGIN;
afterEach(() => {
  if (secret === undefined) delete process.env.BLOG_SESSION_SECRET; else process.env.BLOG_SESSION_SECRET = secret;
  if (origin === undefined) delete process.env.BLOG_APP_ORIGIN; else process.env.BLOG_APP_ORIGIN = origin;
  query.mockReset();
});

it("denies user administration to both non-admin roles and anonymous clients", async () => {
  process.env.BLOG_SESSION_SECRET = "s".repeat(32);
  process.env.BLOG_APP_ORIGIN = "https://example.test";
  const token = await createSession(5, 2);
  const params = { params: Promise.resolve({ id: "7" }) };
  const endpoints = [
    (request: Request) => GET(request),
    (request: Request) => POST(request),
    (request: Request) => PATCH(request, params),
    (request: Request) => resetPassword(request, params),
  ];
  for (const role of ["EDITOR", "BOOKING_MANAGER", null]) {
    for (const endpoint of endpoints) {
      if (role) query.mockResolvedValueOnce([{ id: 5, role, authVersion: 2 }]);
      const request = new Request("https://example.test/api/admin/users", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json", ...(role ? { cookie: sessionCookie(token) } : {}) },
        body: JSON.stringify({ name: "User", email: "user@example.test", role: "ADMIN", active: true, password: "password1", currentPassword: "password1", newPassword: "password2", confirmation: "password2" }),
      });
      expect((await endpoint(request)).status).toBe(role ? 403 : 401);
    }
  }
});
