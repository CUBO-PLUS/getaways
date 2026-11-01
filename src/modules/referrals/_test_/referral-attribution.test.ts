import { randomBytes, randomInt } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, it, vi } from "vitest";

vi.mock("@/modules/bookings/server/bookings", () => ({
  getBookingById: vi.fn(async (id: number) => ({ id, status: "pending_payment" })),
}));

loadEnvConfig(process.cwd(), true);

it.skipIf(process.env.PRISMA_TEST_DATABASE !== "1")(
  "attributes valid codes once, and rejects invalid/replacement codes",
  async () => {
    const { db } = await import("@/infrastructure/prisma/db");
    const { recordReferralForBooking } = await import("../referral-store");
    const { syncReferralStatusForBooking } = await import("../referral-lifecycle");
    const bookingId = randomInt(1_000_000_000, 2_000_000_000);
    const code = `T${randomBytes(7).toString("hex").toUpperCase()}`;
    const unknownCode = `U${randomBytes(7).toString("hex").toUpperCase()}`;
    let created = false;

    try {
      await db.orm.public.ReferralCode.create({ code, active: true });
      created = true;

      expect(await recordReferralForBooking(bookingId, unknownCode))
        .toMatchObject({ ok: false, reason: "invalid_referral" });
      expect(await recordReferralForBooking(bookingId, code))
        .toMatchObject({ ok: true, alreadyRecorded: false, bookingId, code });
      expect(await recordReferralForBooking(bookingId, code))
        .toMatchObject({ ok: true, alreadyRecorded: true });
      expect(await recordReferralForBooking(bookingId, unknownCode))
        .toMatchObject({ ok: false, reason: "already_attributed" });

      const records = await db.orm.public.ReferralAttribution.where({ bookingId }).all();
      expect(records).toHaveLength(1);
      expect(records[0]?.referralCode).toBe(code);
      expect(records[0]?.status).toBe("pending");

      expect(await syncReferralStatusForBooking(bookingId, "confirmed")).toBe(true);
      expect(await syncReferralStatusForBooking(bookingId, "confirmed")).toBe(true);
      expect((await db.orm.public.ReferralAttribution.where({ bookingId }).first())?.status)
        .toBe("confirmed");
      expect(await syncReferralStatusForBooking(bookingId, "cancelled")).toBe(true);
      expect((await db.orm.public.ReferralAttribution.where({ bookingId }).first())?.status)
        .toBe("cancelled");
    } finally {
      await db.orm.public.ReferralAttribution.where({ bookingId }).delete();
      if (created) await db.orm.public.ReferralCode.where({ code }).delete();
      await db.close();
    }
  },
  30_000
);
