import { loadEnvConfig } from "@next/env";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { pgvectorExtensionDescriptor } from "@prisma/orm-extension-pgvector/control";
import { definePrismaConfig } from "prisma/config";
import { databaseUrl } from "./infrastructure/prisma/database-url.mjs";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./infrastructure/prisma/contract.prisma",
    extensions: [pgvectorExtensionDescriptor],
    db: {
      connection: databaseUrl(process.env.DATABASE_URL),
    },
    migrations: { dir: "./infrastructure/prisma/migrations" },
  }),
  skills: {
    agents: ["agents"],
  },
});
