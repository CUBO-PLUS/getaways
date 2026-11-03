import { loadEnvConfig } from "@next/env";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";
import { databaseUrl } from "./infrastructure/prisma/database-url.mjs";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./infrastructure/prisma/contract.prisma",
    db: {
      connection: databaseUrl(process.env.DATABASE_URL),
    },
    migrations: { dir: "./infrastructure/prisma/migrations" },
  }),
  skills: {
    agents: ["agents"],
  },
});
