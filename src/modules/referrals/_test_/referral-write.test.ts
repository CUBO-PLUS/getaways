import { beforeEach, expect, it, vi } from "vitest";

const { getSession, assertSameOrigin, find, create, update } = vi.hoisted(() => ({
  getSession: vi.fn(),
  assertSameOrigin: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/modules/auth/server/auth", () => ({ getSession, assertSameOrigin }));
vi.mock("@/infrastructure/prisma/db", () => ({
  db: { orm: { public: { ReferralCode: { where: () => ({ first: find, update }), create } } } },
}));

import { POST } from "@/app/api/admin/referrals/route";
import { PATCH } from "@/app/api/admin/referrals/[code]/route";

const post = (body: unknown) => new Request("https://example.test/api/admin/referrals", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const patch = (code: string, body: unknown) => new Request(`https://example.test/api/admin/referrals/${code}`, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const params = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.resetAllMocks();
  assertSameOrigin.mockReturnValue(true);
  getSession.mockResolvedValue({ id: 1, role: "ADMIN", authVersion: 1 });
});

it("creates normalized codes and reports duplicates without changing the existing code", async () => {
  find.mockResolvedValueOnce(null).mockResolvedValueOnce({ code: "EXISTING", active: false });
  create.mockResolvedValue({ code: "FRIEND-1", active: true });

  const created = await POST(post({ code: " friend-1 " }));
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({ code: "FRIEND-1", active: true });
  expect(create).toHaveBeenCalledWith({ code: "FRIEND-1", active: true });

  const duplicate = await POST(post({ code: "existing" }));
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: expect.any(String) });
  expect(create).toHaveBeenCalledTimes(1);
});

it("PATCH changes only boolean active state and returns 404 for unknown codes", async () => {
  update.mockResolvedValueOnce({ code: "FRIEND", active: false }).mockResolvedValueOnce({ code: "FRIEND", active: true }).mockResolvedValueOnce(null);

  expect((await PATCH(patch("friend", { active: false }), params("friend"))).status).toBe(200);
  expect(await (await PATCH(patch("friend", { active: true }), params("friend"))).json()).toEqual({ code: "FRIEND", active: true });
  expect(update).toHaveBeenNthCalledWith(1, { active: false });
  expect(update).toHaveBeenNthCalledWith(2, { active: true });

  expect((await PATCH(patch("friend", { active: true, code: "OTHER" }), params("friend"))).status).toBe(400);
  expect((await PATCH(patch("friend", { active: "false" }), params("friend"))).status).toBe(400);
  expect((await PATCH(patch("missing", { active: true }), params("missing"))).status).toBe(404);
  expect(update).toHaveBeenCalledTimes(3);
});

it("rejects unauthenticated, non-admin, and cross-origin writes before mutation", async () => {
  getSession.mockResolvedValue(null);
  expect((await POST(post({ code: "FRIEND" }))).status).toBe(401);
  expect((await PATCH(patch("FRIEND", { active: false }), params("FRIEND"))).status).toBe(401);

  getSession.mockResolvedValue({ id: 2, role: "EDITOR", authVersion: 1 });
  expect((await POST(post({ code: "FRIEND" }))).status).toBe(403);
  expect((await PATCH(patch("FRIEND", { active: false }), params("FRIEND"))).status).toBe(403);

  getSession.mockResolvedValue({ id: 1, role: "ADMIN", authVersion: 1 });
  assertSameOrigin.mockReturnValue(false);
  expect((await POST(post({ code: "FRIEND" }))).status).toBe(403);
  expect((await PATCH(patch("FRIEND", { active: false }), params("FRIEND"))).status).toBe(403);
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
