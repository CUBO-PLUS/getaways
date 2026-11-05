import { notFound } from "next/navigation";
import CheckoutTemplate from "@/components/templates/CheckoutTemplate";
import { getCheckoutData } from "@/modules/checkout/server/checkout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout - Getaways El Salvador", robots: { index: false, follow: false, noarchive: true } };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const data = await getCheckoutData(sessionId);
  if (!data) notFound();
  return <CheckoutTemplate data={data} />;
}
