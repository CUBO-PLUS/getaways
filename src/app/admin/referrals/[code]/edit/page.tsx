import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { getAdminReferralCode } from "@/modules/referrals/referral-admin";
import { ReferralForm } from "@/modules/referrals/client/referral-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function EditReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  const { code } = await params;
  const referral = await getAdminReferralCode(actor, code);
  if (!referral) notFound();
  return <ReferralForm referral={referral} />;
}
