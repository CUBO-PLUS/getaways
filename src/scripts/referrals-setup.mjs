/**
 * Safe, repeatable setup for the local Referral Tracking demo.
 * Uses the repository's existing Prisma 8 migrations and schema unchanged.
 * It does not clear databases or start the blog's RustFS/S3 services.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const major = Number.parseInt(process.versions.node.split(".")[0], 10);
if (major < 24) throw new Error("Gateways requires Node.js 24 or newer.");
if (process.env.NODE_ENV === "production") throw new Error("Refusing setup in production.");

const envFile = join(root, ".env");
if (!existsSync(envFile)) {
  copyFileSync(join(root, ".env.example"), envFile);
  console.log("Created .env using the project's example (without overwriting existing config).");
}
const contents = readFileSync(envFile, "utf8");
if (!/^\s*NEXT_PUBLIC_SITE_URL\s*=/m.test(contents)) {
  appendFileSync(envFile, `${contents.endsWith("\n") ? "" : "\n"}NEXT_PUBLIC_SITE_URL=http://localhost:3000\n`);
  console.log("Enabled local checkout via NEXT_PUBLIC_SITE_URL.");
}
loadEnvConfig(root, true);
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL is missing in .env.");
const host = new URL(dbUrl).hostname;
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
  throw new Error("For safety, referral setup only runs against a loopback PostgreSQL address.");
}

// Docker Desktop installed per-user may not be on VS Code's PATH.
if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  const dir = join(process.env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin");
  if (existsSync(join(dir, "docker.exe"))) {
    process.env.PATH = `${process.env.PATH ?? ""}${delimiter}${dir}`;
  }
}

function run(command, args, extra = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extra },
  });
}

// Mauricio's new Compose config has mandatory RustFS/S3 substitutions even
// when only the db service is requested. Supply harmless values ONLY to this
// Docker Compose subprocess. No RustFS service is started and no secrets saved.
const composePlaceholders = {};
for (const name of [
  "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
  "RUSTFS_ROOT_ACCESS_KEY", "RUSTFS_ROOT_SECRET_KEY",
]) {
  if (!process.env[name]) composePlaceholders[name] = "unused-by-referral-db";
}

run("docker", ["compose", "-f", "compose.dev.yaml", "up", "-d", "--wait", "db"], composePlaceholders);
run("pnpm", ["db:generate"]);
console.log("\nPrisma 8 migration preview (read-only):");
run("pnpm", ["exec", "prisma", "db", "migrate", "--show"]);
run("pnpm", ["db:migrate"]);
run("pnpm", ["db:check"]);
run("node", ["scripts/referrals-cli.mjs", "seed"]);
run("node", ["scripts/referrals-cli.mjs", "list"]);
console.log("\nReferral demo ready. Next: pnpm dev");
console.log("Visit: http://localhost:3000/?ref=GETAWAYSDEMO");
console.log("Report: node scripts/referrals-cli.mjs report");
