import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

loadEnvConfig(process.cwd(), true);

it.skipIf(process.env.PRISMA_TEST_DATABASE !== "1")(
  "creates, lists, disables and reports a referral using server-only functions",
  async () => {
    const { db } = await import("@/infrastructure/prisma/db");
    const {
      createReferralCode,
      listReferralCodes,
      setReferralCodeActive,
      getReferralReport,
    } = await import("../referral-management");
    const code = `T${randomBytes(7).toString("hex").toUpperCase()}`;
    let created = false;

    try {
      expect(await createReferralCode(code.toLowerCase()))
        .toMatchObject({ created: true, code, active: true });
      created = true;
      expect(await createReferralCode(code))
        .toMatchObject({ created: false, code });
      expect((await listReferralCodes()).some((entry) => entry.code === code)).toBe(true);
      expect(await setReferralCodeActive(code, false))
        .toMatchObject({ code, active: false });
      expect(await setReferralCodeActive(code, true))
        .toMatchObject({ code, active: true });
      expect(await getReferralReport()).toEqual(
        expect.arrayContaining([expect.objectContaining({ code, total: 0 })])
      );
    } finally {
      if (created) await db.orm.public.ReferralCode.where({ code }).delete();
      await db.close();
    }
  },
  30_000
);
