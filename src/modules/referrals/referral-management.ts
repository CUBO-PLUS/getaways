import "server-only";

import { db } from "@/infrastructure/prisma/db";
import { normalizeReferralCode } from "./referral-rules";

/** Server-only helpers. Do not expose them through unauthenticated HTTP routes. */
export async function createReferralCode(input: string) {
  const code = normalizeReferralCode(input);
  if (!code) throw new Error("Invalid referral code. Use 4–24 letters, digits or hyphens.");

  const existing = await db.orm.public.ReferralCode.where({ code }).first();
  if (existing) return { created: false, code: existing.code, active: existing.active };

  try {
    const record = await db.orm.public.ReferralCode.create({ code, active: true });
    return { created: true, code: record.code, active: record.active };
  } catch (error) {
    // A concurrent request could have created the code; don't conceal other errors.
    const concurrent = await db.orm.public.ReferralCode.where({ code }).first();
    if (!concurrent) throw error;
    return { created: false, code: concurrent.code, active: concurrent.active };
  }
}

export async function setReferralCodeActive(input: string, active: boolean) {
  const code = normalizeReferralCode(input);
  if (!code) throw new Error("Invalid referral code.");
  const updated = await db.orm.public.ReferralCode
    .where({ code })
    .update({ active });
  return updated ? { code: updated.code, active: updated.active } : null;
}

export async function listReferralCodes() {
  const codes = await db.orm.public.ReferralCode.all();
  return codes
    .map((entry) => ({ code: entry.code, active: entry.active }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Read-only counts. Never includes guest email, booking details, or payment data. */
export async function getReferralReport() {
  const [codes, attributions] = await Promise.all([
    db.orm.public.ReferralCode.all(),
    db.orm.public.ReferralAttribution.all(),
  ]);

  return codes
    .map(({ code, active }) => {
      const mine = attributions.filter((item) => item.referralCode === code);
      return {
        code,
        active,
        total: mine.length,
        pending: mine.filter((item) => item.status === "pending").length,
        confirmed: mine.filter((item) => item.status === "confirmed").length,
        cancelled: mine.filter((item) => item.status === "cancelled").length,
      };
    })
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}
