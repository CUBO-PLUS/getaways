import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in creates its own disposable database; DATABASE_URL and local .env are never used.
describe.skipIf(process.env.PRISMA_TEST_DATABASE !== "1")("Plan 1 on disposable PostgreSQL", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const container = `gateways-plan1-test-${randomUUID()}`;
  const children: ChildProcess[] = [];
  let temporary: string;
  let created = false;
  let env: NodeJS.ProcessEnv;
  let before: unknown;
  let after: unknown;

  function sql(statement: string) {
    return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "plan1_test"], { input: statement, encoding: "utf8", timeout: 30_000 }).trim();
  }

  function migrate(to?: string) {
    execFileSync(process.execPath, [path.join(root, "node_modules/prisma/dist/prisma.js"), "db", "migrate", "--config", path.join(temporary, "prisma.config.ts"), "--db", env.DATABASE_URL!, ...(to ? ["--to", to] : [])], { cwd: temporary, env, encoding: "utf8", timeout: 60_000, stdio: "pipe" });
  }

  function snapshot() {
    return JSON.parse(sql(`SELECT jsonb_object_agg(name, rows) FROM (
      ${["ReferralCode", "ReferralAttribution", "MediaAsset", "BlogPost", "BlogPublication", "BlogCategory", "BlogPostCategory", "BlogPublicationCategory", "BlogImportMapping"].map((table) => `SELECT '${table}' AS name, (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM "${table}" t) AS rows`).join(" UNION ALL ")}
    ) snapshots;`));
  }

  async function worker() {
    const child = fork(path.join(root, "infrastructure/prisma/_test_/support/plan1-worker.mts"), [], { cwd: temporary, env, execArgv: ["--experimental-strip-types"], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    children.push(child);
    let stderr = "";
    let comparing = false;
    child.on("message", (message: { comparing?: boolean }) => { if (message.comparing) comparing = true; });
    child.stderr!.on("data", (chunk) => { stderr += chunk; });
    const receive = () => new Promise<Record<string, unknown>>((resolve, reject) => {
      const onExit = (code: number | null) => { child.off("message", onMessage); reject(new Error(`Worker exited (${code}): ${stderr}`)); };
      const onMessage = (message: Record<string, unknown>) => {
        if (message.comparing) return;
        child.off("exit", onExit);
        child.off("message", onMessage);
        if (message.failure) reject(new Error(String(message.failure))); else resolve(message);
      };
      child.once("exit", onExit);
      child.on("message", onMessage);
      child.once("error", reject);
    });
    const { pid } = await receive();
    return { pid, get comparing() { return comparing; }, resume: () => child.send({ resume: true }), run: (message: object) => { const result = receive(); child.send(message); return result; } };
  }

  beforeAll(async () => {
    temporary = mkdtempSync("/tmp/opencode/plan1-postgres-");
    // A minimal allowlist prevents inherited app credentials and Compose host rewriting.
    env = { PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary, NODE_ENV: "development", BLOG_SESSION_SECRET: "synthetic-plan1-secret-".repeat(3), BLOG_APP_ORIGIN: "https://plan1.example.test", AUTH_TRUST_PROXY: "0" };
    symlinkSync(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
    writeFileSync(path.join(temporary, "prisma.config.ts"), `import { definePrismaConfig } from 'prisma/config';
      import { defineConfig } from '@prisma/orm-postgres/config';
      export default definePrismaConfig({ orm: defineConfig({
        contract: ${JSON.stringify(path.join(root, "infrastructure/prisma/contract.prisma"))},
        db: { connection: process.env.DATABASE_URL! },
        migrations: { dir: ${JSON.stringify(path.join(root, "infrastructure/prisma/migrations"))} }
      }) });`);
    created = true;
    execFileSync("docker", ["run", "--detach", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_DB=plan1_test", "--mount", "type=tmpfs,destination=/var/lib/postgresql/data", "postgres:17-bookworm"], { encoding: "utf8", timeout: 30_000 });
    execFileSync("docker", ["exec", container, "sh", "-c", "until pg_isready -U postgres -d plan1_test >/dev/null 2>&1; do sleep 0.1; done"], { timeout: 30_000 });
    const port = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim();
    if (!/^127\.0\.0\.1:\d+$/.test(port)) throw new Error("Unexpected PostgreSQL binding");
    env.DATABASE_URL = `postgresql://postgres@${port}/plan1_test?sslmode=disable`;
    migrate("6f61bccf5fb3a4ddac61b783b36527564f3cbd4a8bf439056252a731b20389c7");
    sql(`INSERT INTO "ReferralCode" (code, active, "createdAt") VALUES ('SYNTHETIC-A', true, '2026-01-02Z'), ('SYNTHETIC-B', false, '2026-01-03Z');
      INSERT INTO "ReferralAttribution" ("bookingId", "referralCode", status) VALUES (910001, 'SYNTHETIC-A', 'confirmed'), (910002, 'SYNTHETIC-B', 'pending');
      INSERT INTO "MediaAsset" ("objectKey", "originalName", "mimeType", "sizeBytes", width, height, "defaultAlt") VALUES ('synthetic/cover.png', 'cover.png', 'image/png', 123, 20, 10, 'Synthetic cover');
      INSERT INTO "BlogCategory" (name, slug) VALUES ('Synthetic category', 'synthetic-category');
      INSERT INTO "BlogPost" (slug, title, excerpt, document, "documentSchemaVersion", "coverMediaId", "coverAlt", "seoTitle", "seoDescription", "updatedAt", "firstPublishedAt")
        VALUES ('synthetic-post', 'Draft title', 'Draft excerpt', '{"type":"doc","content":[]}', 1, 1, 'Draft cover', 'SEO title', 'SEO description', '2026-01-04Z', '2026-01-03Z');
      INSERT INTO "BlogPublication" ("postId", title, excerpt, document, "documentSchemaVersion", "coverMediaId", "coverAlt", "updatedAt")
        VALUES (1, 'Public title', 'Public excerpt', '{"type":"doc","content":[]}', 1, 1, 'Public cover', '2026-01-03Z');
      INSERT INTO "BlogPostCategory" VALUES (1, 1);
      INSERT INTO "BlogPublicationCategory" VALUES (1, 1);
      INSERT INTO "BlogImportMapping" (source, "sourceId", "targetKind", "targetId", fingerprint) VALUES ('synthetic', 'post-a', 'post', 1, 'synthetic-fingerprint');`);
    before = snapshot();
    migrate();
    after = snapshot();
  }, 120_000);

  afterAll(async () => {
    await Promise.all(children.map((child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      return new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
      });
    }));
    try {
      if (created) execFileSync("docker", ["rm", "--force", container], { timeout: 30_000, stdio: "pipe" });
    } finally {
      if (temporary) rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("migrates existing synthetic blog and referrals without changing rows or relationships", () => {
    expect(Object.values(before as Record<string, unknown[]>).every((rows) => rows.length > 0)).toBe(true);
    expect(after).toEqual(before);
    expect(sql(`SELECT to_regclass('"AdminUser"') IS NOT NULL AND to_regclass('"AdminLoginThrottle"') IS NOT NULL;`)).toBe("t");
    migrate();
    expect(snapshot()).toEqual(before);
    expect(sql(`INSERT INTO "BlogPost" (slug, title, excerpt, document, "documentSchemaVersion", "updatedAt") VALUES ('synthetic-next', 'Next', '', '{}', 1, now()) RETURNING id;`)).toBe("2");
    expect(sql(`INSERT INTO "ReferralCode" (code) VALUES ('SYNTHETIC-NEXT') RETURNING id;`)).toBe("3");
  }, 60_000);

  it("keeps an active ADMIN when two independent processes revoke each other concurrently", async () => {
    const passwordHash = await hash("Synthetic-pass-1", 4);
    const ids = sql(`INSERT INTO "AdminUser" (email, name, "passwordHash", role, "updatedAt") VALUES ('admin-a@example.test', 'Admin A', '${passwordHash}', 'ADMIN', now()), ('admin-b@example.test', 'Admin B', '${passwordHash}', 'ADMIN', now()) RETURNING id;`).split("\n").map(Number);
    const [a, b] = await Promise.all([worker(), worker()]);
    expect(a.pid).not.toBe(b.pid);
    const first = a.run({ action: "access", actor: ids[0], target: ids[1] });
    const deadline = Date.now() + 10_000;
    while (!a.comparing && Date.now() < deadline) await setTimeout(20);
    expect(a.comparing).toBe(true);
    const second = b.run({ action: "access", actor: ids[1], target: ids[0] });
    // Hold A after its actor row is locked. B must either wait on the shared
    // advisory lock or also lock its actor and reach bcrypt (the broken case).
    let overlapped = false;
    while (Date.now() < deadline) {
      overlapped = b.comparing || sql(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = 'plan1_test' AND wait_event_type = 'Lock' AND wait_event = 'advisory');`) === "t";
      if (overlapped) break;
      await setTimeout(20);
    }
    expect(overlapped).toBe(true);
    a.resume();
    if (b.comparing) b.resume();
    const results = await Promise.all([first, second]);
    expect(results.filter(({ result }) => (result as { changed?: boolean }).changed)).toHaveLength(1);
    expect(results.filter(({ result }) => (result as { error?: string }).error)).toEqual([{ result: { error: "Unauthorized" } }]);
    expect(sql(`SELECT count(*) FROM "AdminUser" WHERE active AND role = 'ADMIN';`)).toBe("1");
  }, 30_000);

  it("shares the five-login budget across concurrent processes and a fresh process", async () => {
    const passwordHash = await hash("Synthetic-pass-1", 4);
    sql(`INSERT INTO "AdminUser" (email, name, "passwordHash", role, "updatedAt") VALUES ('throttle@example.test', 'Throttle', '${passwordHash}', 'EDITOR', now());`);
    const [a, b] = await Promise.all([worker(), worker()]);
    expect(a.pid).not.toBe(b.pid);
    const message = { action: "login", email: "throttle@example.test", attempts: 10 };
    const batches = await Promise.all([a.run(message), b.run(message)]);
    // Count calls that actually execute bcrypt, not just successful tokens:
    // moving the throttle check after password verification must fail here.
    expect(batches.reduce((sum, batch) => sum + Number(batch.comparisons), 0)).toBe(5);
    const results = batches.flatMap(({ result }) => result as { token?: string; retryAfter?: number }[]);
    expect(results.filter(({ token }) => token)).toHaveLength(5);
    expect(results.filter(({ retryAfter }) => retryAfter && retryAfter > 0 && retryAfter <= 900)).toHaveLength(15);
    const restarted = await worker();
    const { result, comparisons } = await restarted.run({ ...message, attempts: 1 });
    expect(comparisons).toBe(0);
    const [denied] = result as { token?: string; retryAfter: number }[];
    expect(denied.token).toBeUndefined();
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(denied.retryAfter).toBeLessThanOrEqual(900);
  }, 30_000);
});
