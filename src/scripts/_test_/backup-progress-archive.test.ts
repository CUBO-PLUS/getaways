import type { ExecFileSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ root: "", corruptArchive: false }));
const repository = path.resolve(import.meta.dirname, "../..");
const bytes = Buffer.from("image");
const { execFileSync } = await vi.importActual<typeof import("node:child_process")>("node:child_process");

vi.mock("@next/env", () => ({ default: { loadEnvConfig() {} } }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class {
    async send() { return { Body: { transformToByteArray: async () => Buffer.from("image") }, ContentType: "image/png" }; }
    destroy() {}
  },
  paginateListObjectsV2: async function* () { yield { Contents: [{ Key: "media/image", Size: 5, ETag: '"image"' }] }; },
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { writeSync, writeFileSync } = await import("node:fs");
  return {
    ...actual,
    execFileSync: (command: string, args: string[], options: ExecFileSyncOptions) => {
      if (command === "docker") {
        if (args.includes("gateways-dev-app-1")) throw new Error("App container is absent");
        if (args[0] === "inspect") {
          if (args[2].includes("working_dir")) return fixture.root;
          if (args[2].includes("compose.project")) return "gateways-dev";
          if (args[2].includes("State.Running")) return "true";
          if (args[2].includes("9000/tcp")) return '[{"HostPort":"19000"}]';
        }
        if (args.includes("pg_dump")) { writeSync(Number(options.stdio?.[1]), "PGDMP fixture"); return ""; }
        if (args.includes("pg_restore")) return "TABLE public BlogPublication\n";
        throw new Error(`Unexpected Docker request: ${args.join(" ")}`);
      }
      if (command === "tar" && args.includes("--compare") && fixture.corruptArchive) {
        writeFileSync(args[args.indexOf("--file") + 1], "damaged archive");
      }
      if (command !== "tar" && command !== "git") throw new Error(`Unexpected command: ${command}`);
      return actual.execFileSync(command, args, command === "git" ? { ...options, cwd: repository } : options);
    },
    spawn: (command: string, args: string[]) => {
      if (command !== "docker" || args[2] !== "gateways-dev-db-1") throw new Error("Unexpected snapshot process");
      const state = { snapshot: "00000001-1", database: "fixture", capturedAt: "2026-11-06T00:00:00Z", postgresVersion: "17",
        media: [{ id: "image", objectKey: "media/image", sizeBytes: "5", mimeType: "image/png" }], posts: [], publications: 0 };
      return actual.spawn(process.execPath, ["-e", `process.stdin.once('data', () => console.log(${JSON.stringify(JSON.stringify(state))})); process.stdin.resume();`]);
    },
  };
});

beforeEach(async () => {
  fixture.root = await fs.mkdtemp(path.join(tmpdir(), "progress-archive-"));
  fixture.corruptArchive = false;
  await fs.mkdir(path.join(fixture.root, "scripts"));
  await fs.mkdir(path.join(fixture.root, "backups"));
  await fs.symlink(path.join(repository, "node_modules"), path.join(fixture.root, "node_modules"), "dir");
  for (const file of ["backup-progress.mjs", "restore-progress-objects.mjs"]) {
    await fs.copyFile(path.join(repository, "scripts", file), path.join(fixture.root, "scripts", file));
  }
  await fs.writeFile(path.join(fixture.root, "backups", "previous.tar.gz"), "previous backup");
  for (const [key, value] of Object.entries({ NODE_ENV: "test", S3_ENDPOINT: "http://localhost:19000", S3_REGION: "test",
    S3_BUCKET: "fixture", S3_ACCESS_KEY_ID: "unused-test-value", S3_SECRET_ACCESS_KEY: "unused-test-value" })) vi.stubEnv(key, value);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(fixture.root, { recursive: true, force: true });
});

it("backs up without an app container and removes staging only after producing a verified archive and checksum", async () => {
  const { backupProgress } = await import(path.join(fixture.root, "scripts/backup-progress.mjs"));
  const result = await backupProgress("Host checkpoint");
  const sha256 = createHash("sha256").update(await fs.readFile(result.archive)).digest("hex");
  expect(result.sha256).toBe(sha256);
  expect(await fs.readFile(`${result.archive}.sha256`, "utf8")).toBe(`${sha256}  ${path.basename(result.archive)}\n`);
  expect((await fs.readdir(path.join(fixture.root, "backups"))).sort()).toEqual([
    "previous.tar.gz", path.basename(result.archive), `${path.basename(result.archive)}.sha256`,
  ].sort());

  const extracted = path.join(fixture.root, "extracted");
  await fs.mkdir(extracted);
  execFileSync("tar", ["-xzf", result.archive, "-C", extracted]);
  const directory = path.join(extracted, path.basename(result.archive, ".tar.gz"));
  execFileSync("sha256sum", ["--check", "SHA256SUMS"], { cwd: directory });
  expect(await fs.readFile(path.join(directory, "postgres.dump"), "utf8")).toBe("PGDMP fixture");
  expect(await fs.readFile(path.join(directory, "objects/00000"))).toEqual(bytes);
  expect(JSON.parse(await fs.readFile(path.join(directory, "checkpoint.json"), "utf8"))).toMatchObject({
    note: "Host checkpoint", objects: 1, mediaAssets: 1,
  });
  expect(await fs.readFile(path.join(fixture.root, "backups/previous.tar.gz"), "utf8")).toBe("previous backup");
});

it("retains staging and previous backups when real tar verification rejects a damaged archive", async () => {
  fixture.corruptArchive = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { backupProgress } = await import(path.join(fixture.root, "scripts/backup-progress.mjs"));
  await expect(backupProgress("Interrupted checkpoint")).rejects.toThrow(/tar/);
  const backups = path.join(fixture.root, "backups");
  const entries = await fs.readdir(backups, { withFileTypes: true });
  const staging = entries.filter((entry) => entry.isDirectory());
  expect(staging).toHaveLength(1);
  const directory = path.join(backups, staging[0].name);
  execFileSync("sha256sum", ["--check", "SHA256SUMS"], { cwd: directory });
  expect(await fs.readFile(path.join(directory, "objects/00000"))).toEqual(bytes);
  expect(entries.some((entry) => entry.name.endsWith(".sha256"))).toBe(false);
  expect(await fs.readFile(path.join(backups, "previous.tar.gz"), "utf8")).toBe("previous backup");
});
