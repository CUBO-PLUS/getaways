import { beforeEach, expect, it, vi } from "vitest";

const { getSession, assertSameOrigin, db } = vi.hoisted(() => ({ getSession: vi.fn(), assertSameOrigin: vi.fn(), db: { transaction: vi.fn(), raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) } } }));
vi.mock("@/modules/auth/server/auth", () => ({ getSession, assertSameOrigin }));
vi.mock("@/infrastructure/prisma/db", () => ({ db }));

import { GET, POST } from "../[kind]/route";
import { DELETE, PATCH } from "../[kind]/[id]/route";

const kind = { params: Promise.resolve({ kind: "blog" }) };
const id = { params: Promise.resolve({ kind: "blog", id: "7" }) };

beforeEach(() => { vi.resetAllMocks(); assertSameOrigin.mockReturnValue(true); });

it("denies missing sessions on GET, POST, PATCH, and DELETE", async () => {
  getSession.mockResolvedValue(null);
  const responses = await Promise.all([
    GET(new Request("https://example.test/api/admin/categories/blog"), kind),
    POST(new Request("https://example.test/api/admin/categories/blog", { method: "POST", body: "{}" }), kind),
    PATCH(new Request("https://example.test/api/admin/categories/blog/7", { method: "PATCH", body: "{}" }), id),
    DELETE(new Request("https://example.test/api/admin/categories/blog/7", { method: "DELETE" }), id),
  ]);
  expect(responses.map(response => response.status)).toEqual([401, 401, 401, 401]);
});

it("denies BOOKING_MANAGER reads and cross-origin writes", async () => {
  getSession.mockResolvedValue({ id: 1, role: "BOOKING_MANAGER", authVersion: 1 });
  expect((await GET(new Request("https://example.test/api/admin/categories/blog"), kind)).status).toBe(403);
  getSession.mockResolvedValue({ id: 1, role: "ADMIN", authVersion: 1 });
  assertSameOrigin.mockReturnValue(false);
  const responses = await Promise.all([
    POST(new Request("https://example.test/api/admin/categories/blog", { method: "POST", body: "{}" }), kind),
    PATCH(new Request("https://example.test/api/admin/categories/blog/7", { method: "PATCH", body: "{}" }), id),
    DELETE(new Request("https://example.test/api/admin/categories/blog/7", { method: "DELETE" }), id),
  ]);
  expect(responses.map(response => response.status)).toEqual([403, 403, 403]);
});
