import { beforeEach, expect, it, vi } from "vitest";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/modules/auth/server/auth", () => ({ getSession, assertSameOrigin: () => true }));
import { requireBlogAccess, recheckBlogAccess } from "../server/blog-auth";
import { POST as uploadMedia } from "@/app/api/blog/media/route";
import { POST as publish } from "@/app/api/blog/admin/posts/[id]/publish/route";
import { publishBlogDraft } from "../server/blog-operations";

beforeEach(() => vi.resetAllMocks());
it("allows editorial roles but only ADMIN to publish, rejecting missing or booking sessions", async () => {
  getSession.mockResolvedValue(null);
  await expect(requireBlogAccess()).rejects.toMatchObject({ status: 401 });
  getSession.mockResolvedValue({ id: 1, role: "BOOKING_MANAGER", authVersion: 1 });
  await expect(requireBlogAccess()).rejects.toMatchObject({ status: 403 });
  getSession.mockResolvedValue({ id: 1, role: "EDITOR", authVersion: 1 });
  await expect(requireBlogAccess()).resolves.toMatchObject({ role: "EDITOR" });
  await expect(requireBlogAccess(undefined, true)).rejects.toMatchObject({ status: 403 });
  getSession.mockResolvedValue({ id: 1, role: "ADMIN", authVersion: 1 });
  await expect(requireBlogAccess(undefined, true)).resolves.toMatchObject({ role: "ADMIN" });
});
it("rechecks a revoked identity under the transaction lock", async () => {
  const actor = { id: 1, role: "ADMIN" as const, authVersion: 1 };
  const tx = { orm: { public: { AdminUser: { where: () => ({ forUpdate: () => ({ first: async () => ({ ...actor, active: true, authVersion: 2 }) }) }) } } } };
  await expect(recheckBlogAccess(tx as never, actor)).rejects.toMatchObject({ status: 401 });
});
it("rejects editor publication through both route and shared operation", async () => {
  getSession.mockResolvedValue({ id: 1, role: "EDITOR", authVersion: 1 });
  const request = new Request("https://example.test/api/blog/admin/posts/1/publish", { method: "POST", body: '{"version":1}' });
  expect((await publish(request, { params: Promise.resolve({ id: "1" }) })).status).toBe(403);
  await expect(publishBlogDraft(1, 1, request)).rejects.toMatchObject({ status: 403 });
});
it("rejects malformed multipart after authenticating an editor", async () => {
  getSession.mockResolvedValue({ id: 1, role: "EDITOR", authVersion: 1 });
  const response = await uploadMedia(new Request("https://example.test/api/blog/media", { method: "POST", headers: { "content-type": "multipart/form-data", "content-length": "100" }, body: "not a multipart body" }));
  expect(response.status).toBe(400);
});
