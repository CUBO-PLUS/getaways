import "server-only";
import "temporal-polyfill/full/global";
import postgres, { type PostgresClient } from "@prisma/orm-postgres/runtime";
import pgvectorRuntimeDescriptor from "@prisma/orm-extension-pgvector/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };
import { databaseUrl } from "./database-url.mjs";

const globalForPrisma = globalThis as unknown as { gatewaysDbCache?: { client: PostgresClient<Contract>; key: string } };
const url = databaseUrl(process.env.DATABASE_URL);
const key = JSON.stringify([contractJson.storage.storageHash, contractJson.execution.executionHash, url]);

// ponytail: old development pools live until restart; drain them if contracts change frequently.
export const db = globalForPrisma.gatewaysDbCache?.key === key ? globalForPrisma.gatewaysDbCache.client : postgres<Contract>({
  contractJson,
  url,
  extensions: [pgvectorRuntimeDescriptor],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.gatewaysDbCache = { client: db, key };
