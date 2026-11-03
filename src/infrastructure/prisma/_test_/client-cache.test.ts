import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../contract.json");
  vi.doUnmock("@prisma/orm-postgres/runtime");
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (globalThis as { gatewaysDbCache?: unknown }).gatewaysDbCache;
});

it("reuses the client only while the contract and connection stay unchanged", async () => {
  const create = vi.fn(() => ({}));
  vi.doMock("@prisma/orm-postgres/runtime", () => ({ default: create }));
  const contract = (hash: string) => ({ default: { storage: { storageHash: hash }, execution: { executionHash: hash } } });
  vi.doMock("../contract.json", () => contract("old"));
  const first = (await import("../db")).db;
  vi.resetModules();
  expect((await import("../db")).db).toBe(first);

  vi.doMock("../contract.json", () => contract("new"));
  vi.resetModules();
  const updated = (await import("../db")).db;
  expect(updated).not.toBe(first);
  expect(create).toHaveBeenCalledTimes(2);
  vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/other");
  vi.resetModules();
  expect((await import("../db")).db).not.toBe(updated);
  expect(create).toHaveBeenCalledTimes(3);
});
