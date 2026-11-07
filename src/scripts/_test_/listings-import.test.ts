import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it("rejects a missing source root before loading the database", () => {
  const script = path.resolve(import.meta.dirname, "../listings-import.mts");
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-strip-types", script], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "invalid-test-database-url" },
    timeout: 10_000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("usage: pnpm listings:import <source-root>");
  expect(result.stdout).toBe("");
}, 15_000);
