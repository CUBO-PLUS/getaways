/** Local development only. Never connect this command to an authenticated/production DB. */
import "temporal-polyfill/full/global";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../infrastructure/prisma/contract.json" with { type: "json" };

loadEnvConfig(process.cwd(), true);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing. Configure .env first.");
const parsed = new URL(url);
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
  throw new Error("Refusing to operate on a non-local or production database.");
}

const codeOrNull = (input) => {
  const code = String(input ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{4,24}$/.test(code) ? code : null;
};
const [action = "help", rawCode] = process.argv.slice(2);
const db = postgres({ contractJson, url });

try {
  if (action === "seed" || action === "create") {
    const code = action === "seed" ? "GETAWAYSDEMO" : codeOrNull(rawCode);
    if (!code) throw new Error("Usage: node scripts/referrals-cli.mjs create <CODE>");
    const existing = await db.orm.public.ReferralCode.where({ code }).first();
    if (existing) {
      if (action === "create") throw new Error(`Code already exists: ${code}`);
      if (!existing.active) {
        await db.orm.public.ReferralCode.where({ code }).update({ active: true });
        console.log(`Reactivated local demo referral: ${code}`);
      } else {
        console.log(`Demo code ready: ${code}`);
      }
    } else {
      const created = await db.orm.public.ReferralCode.create({ code, active: true });
      console.log(`Created referral: ${created.code}`);
    }
  } else if (action === "enable" || action === "disable") {
    const code = codeOrNull(rawCode);
    if (!code) throw new Error(`Usage: node scripts/referrals-cli.mjs ${action} <CODE>`);
    const updated = await db.orm.public.ReferralCode
      .where({ code }).update({ active: action === "enable" });
    if (!updated) throw new Error(`Code not found: ${code}`);
    console.log(`${updated.code}: active=${updated.active}`);
  } else if (action === "list") {
    const rows = await db.orm.public.ReferralCode.all();
    console.table(rows.map((row) => ({ code: row.code, active: row.active })));
  } else if (action === "report") {
    const [codes, attributions] = await Promise.all([
      db.orm.public.ReferralCode.all(),
      db.orm.public.ReferralAttribution.all(),
    ]);
    console.table(codes.map((row) => {
      const a = attributions.filter((item) => item.referralCode === row.code);
      return {
        code: row.code,
        active: row.active,
        total: a.length,
        pending: a.filter((x) => x.status === "pending").length,
        confirmed: a.filter((x) => x.status === "confirmed").length,
        cancelled: a.filter((x) => x.status === "cancelled").length,
      };
    }));
  } else {
    console.log("Usage: node scripts/referrals-cli.mjs seed | create CODE | enable CODE | disable CODE | list | report");
  }
} finally {
  await db.close();
}
