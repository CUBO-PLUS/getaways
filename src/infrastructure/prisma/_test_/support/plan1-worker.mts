import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { comparisons, pauseComparisons } from "./plan1-bcrypt.mts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "bcryptjs") return nextResolve(new URL("./plan1-bcrypt.mts", import.meta.url).href, context);
    if (specifier === "server-only") return nextResolve(pathToFileURL(`${root}_test_/support/server-only-stub.ts`).href, context);
    if (specifier === "next/headers") return nextResolve("next/headers.js", context);
    if (specifier.startsWith("@/")) specifier = pathToFileURL(root + specifier.slice(2)).href;
    if (specifier.startsWith(".") || specifier.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      if (existsSync(fileURLToPath(url) + ".ts")) return nextResolve(url.href + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});

const { db } = await import("../../db.ts");
const { setUserAccess } = await import("../../../../modules/users/server/users.ts");
const { login } = await import("../../../../modules/auth/server/login.ts");
const [{ pid }] = await db.runtime().query(db.raw.sql`SELECT pg_backend_pid()::int AS pid`.returnsRow({ pid: "pg/int4@1" }).build());
process.send!({ pid });
process.once("message", async (message: { action: string; actor: number; target: number; email: string; attempts: number }) => {
  try {
    const request = new Request("https://plan1.example.test/api/admin/login");
    let result;
    if (message.action === "access") {
      pauseComparisons(() => new Promise<void>((resolve) => {
        process.once("message", () => resolve());
        process.send!({ comparing: true });
      }));
      try {
        await setUserAccess({ id: message.actor, authVersion: 1 }, message.target, { name: "Synthetic admin", role: "EDITOR", active: true, currentPassword: "Synthetic-pass-1" }, request);
        result = { changed: true };
      } catch (error) {
        result = { error: (error as Error).message };
      }
    } else {
      result = await Promise.all(Array.from({ length: message.attempts }, () => login(message.email, "Synthetic-pass-1")));
    }
    process.send!({ result, ...(message.action === "login" ? { comparisons } : {}) });
  } catch (error) {
    process.send!({ failure: (error as Error).stack });
    process.exitCode = 1;
  } finally {
    await db.close();
    process.disconnect();
  }
});
