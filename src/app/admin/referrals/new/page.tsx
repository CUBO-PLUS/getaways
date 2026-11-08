import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { ReferralForm } from "@/modules/referrals/client/referral-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function NewReferralPage() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  return <ReferralForm />;
}
