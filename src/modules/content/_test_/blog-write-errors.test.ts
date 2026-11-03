import { expect, it, vi } from "vitest";
vi.mock("@/modules/auth/server/auth", () => ({ getSession: async () => ({ id: 1, role: "ADMIN", authVersion: 1 }), assertSameOrigin: () => true }));
import { POST as unpublish } from "@/app/api/blog/admin/posts/[id]/unpublish/route";
import { parseBlogId } from "../blog-ids";

it("rejects malformed JSON and IDs outside PostgreSQL int4 before database access", async () => {
  const headers = { origin: "https://blog.example" };
  const malformed = await unpublish(new Request("https://blog.example/api/blog/admin/posts/1/unpublish", { method: "POST", headers, body: "{" }), { params: Promise.resolve({ id: "1" }) });
  expect(malformed.status).toBe(400);
  const unsafeId = await unpublish(new Request("https://blog.example/api/blog/admin/posts/2147483648/unpublish", { method: "POST", headers, body: '{"version":1}' }), { params: Promise.resolve({ id: "2147483648" }) });
  expect(unsafeId.status).toBe(404);
  expect(parseBlogId("2147483647")).toBe(2147483647);
  expect(parseBlogId("2147483648")).toBeNull();
});
