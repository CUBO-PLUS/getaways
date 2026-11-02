import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

loadEnvConfig(process.cwd(), true);

it.skipIf(process.env.PRISMA_TEST_DATABASE !== "1")(
  "validates active and inactive codes using independent PostgreSQL fixtures",
  async () => {
    const { db } = await import("@/infrastructure/prisma/db");
    const { findActiveReferral } = await import("../referral-store");
    const code = `T${randomBytes(7).toString("hex").toUpperCase()}`;
    let created = false;

    try {
      await db.orm.public.ReferralCode.create({ code, active: true });
      created = true;
      expect(await findActiveReferral(code.toLowerCase())).toMatchObject({ code });
      await db.orm.public.ReferralCode.where({ code }).update({ active: false });
      expect(await findActiveReferral(code)).toBeNull();
    } finally {
      if (created) await db.orm.public.ReferralCode.where({ code }).delete();
      await db.close();
    }
  },
  30_000
);
