import { beforeEach, describe, expect, it, vi } from "vitest";

const { session, origin, create, update, reset, change } = vi.hoisted(() => ({ session: vi.fn(), origin: vi.fn(), create: vi.fn(), update: vi.fn(), reset: vi.fn(), change: vi.fn() }));
vi.mock("@/modules/auth/server/auth", () => ({ getSession: session, assertSameOrigin: origin }));
vi.mock("@/modules/users/server/users", () => ({ createUser: create, listUsers: vi.fn(), setUserAccess: update, resetUserPassword: reset, changeOwnPassword: change }));
import { POST as createUser } from "@/app/api/admin/users/route";
import { POST as resetPassword } from "@/app/api/admin/users/[id]/reset-password/route";
import { POST as ownPassword } from "@/app/api/admin/account/password/route";
import { PATCH as updateUser } from "@/app/api/admin/users/[id]/route";

const actor = { id: 1, role: "ADMIN", authVersion: 1 };
function request(body: unknown) { return new Request("https://example.test/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
const credentials = { currentPassword: "password1", newPassword: "password2", confirmation: "password2" };

beforeEach(() => { vi.clearAllMocks(); origin.mockReturnValue(true); session.mockResolvedValue(actor); });

describe("user mutations", () => {
  it("rejects hostile origins and non-admins without invoking mutations", async () => {
    origin.mockReturnValue(false);
    expect((await createUser(request({}))).status).toBe(403);
    expect(session).not.toHaveBeenCalled();
    origin.mockReturnValue(true); session.mockResolvedValueOnce(null);
    expect((await ownPassword(request(credentials))).status).toBe(401);
    session.mockResolvedValue({ ...actor, role: "EDITOR" });
    expect((await resetPassword(request(credentials), { params: Promise.resolve({ id: "2" }) })).status).toBe(403);
    expect(create).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies before invoking operations", async () => {
    const response = await ownPassword(request({ ...credentials, padding: "x".repeat(4096) }));
    expect(response.status).toBe(413);
    expect(change).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("forwards own password changes and returns throttle retry time", async () => {
    change.mockRejectedValueOnce(new Error("Reauthentication rate limited: 30"));
    const req = request(credentials);
    const response = await ownPassword(req);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(change).toHaveBeenCalledWith(actor, "password1", "password2", "password2", req);
  });
  it("returns the last-admin conflict without exposing internal details", async () => {
    update.mockRejectedValueOnce(new Error("Cannot remove the last active administrator"));
    const response = await updateUser(request({ name: "Admin", role: "EDITOR", active: true, currentPassword: "password1" }), { params: Promise.resolve({ id: "2" }) });
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("Cannot remove");
    expect(update).toHaveBeenCalledOnce();
  });
});
