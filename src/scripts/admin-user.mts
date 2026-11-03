import { createInterface } from "node:readline/promises";
import nextEnv from "@next/env";

if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 3 || !["bootstrap", "recover"].includes(process.argv[2])) {
  console.error("Usage: pnpm admin:user bootstrap|recover (interactive terminal required)");
  process.exit(1);
}

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured. For the local Docker environment, run: docker exec -it gateways-dev-app-1 pnpm admin:user " + process.argv[2]);
  process.exit(1);
}
const { bootstrapAdmin, recoverAdmin } = await import("../modules/users/server/users.ts");
const { db } = await import("../infrastructure/prisma/db.ts");
const prompt = createInterface({ input: process.stdin, output: process.stdout });

async function secret(label: string): Promise<string> {
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  let value = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === "\u0003") { cleanup(); reject(new Error("Cancelled")); return; }
          if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
          if (char === "\u007f" || char === "\b") value = [...value].slice(0, -1).join("");
          else value += char;
        }
      };
      const onEnd = () => { cleanup(); reject(new Error("Input closed")); };
      const cleanup = () => { process.stdin.off("data", onData); process.stdin.off("end", onEnd); };
      process.stdin.on("data", onData);
      process.stdin.once("end", onEnd);
      process.stdin.resume();
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
  }
}

try {
  const email = await prompt.question("Account email: ");
  const name = process.argv[2] === "bootstrap" ? await prompt.question("Name: ") : "";
  const confirmation = await prompt.question(`Type ${process.argv[2].toUpperCase()} to confirm: `);
  if (confirmation !== process.argv[2].toUpperCase()) throw new Error("Cancelled");
  prompt.close();
  const password = await secret("New password: ");
  const repeated = await secret("Confirm password: ");
  if (password !== repeated) throw new Error("Password confirmation does not match");
  if (process.argv[2] === "bootstrap") await bootstrapAdmin({ email, name, password });
  else await recoverAdmin(email, password);
  console.log("Administrator account updated.");
} catch (error) {
  console.error(error instanceof Error && ["Cancelled", "Input closed", "Password confirmation does not match", "Invalid email", "Invalid name", "Invalid password length", "Bootstrap requires an empty user table", "User not found"].includes(error.message) ? error.message : "Operation failed; check database availability and schema.");
  process.exitCode = 1;
} finally {
  prompt.close();
  await db.close();
}
