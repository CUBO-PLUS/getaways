import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGuestSession } from "@/modules/guests/server/auth";
import RagAssistant from "@/modules/rag/client/RagAssistant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Travel assistant", robots: { index: false, follow: false } };

export default async function AssistantPage() {
  const guest = await getGuestSession();
  if (!guest) redirect("/account/login?returnTo=%2Fassistant");
  return <RagAssistant />;
}
