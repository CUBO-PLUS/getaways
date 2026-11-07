import { Suspense } from "react";
import Header from "@/components/organisms/Header";
import Footer from "@/components/organisms/Footer";
import ReferralTracker from "@/modules/referrals/ReferralTracker";
import Umami from "@/components/organisms/UmamiAnalytics";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Umami />
      <Suspense fallback={null}>
        <ReferralTracker />
      </Suspense>

      <Header />

      <main className="flex-1 w-full max-w-301 mx-auto my-0 px-6 py-10">
        {children}
      </main>

      <Footer />
    </>
  );
}
