import { expect, it } from "vitest";
import { databaseUrl } from "../database-url.mjs";

it("uses the Compose database only for loopback URLs, preserving credentials and options", () => {
  const local = "postgresql://user:p%40ss@127.0.0.1:6543/gateways?sslmode=disable";
  expect(databaseUrl(local, "db")).toBe("postgresql://user:p%40ss@db:5432/gateways?sslmode=disable");
  expect(databaseUrl(local, "")).toBe(local);
  const remote = "postgresql://user:pass@database.example:6543/gateways";
  expect(databaseUrl(remote, "db")).toBe(remote);
});
