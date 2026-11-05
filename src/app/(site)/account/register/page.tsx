import { Suspense } from "react";
import type { Metadata } from "next";
import GuestAuthForm from "@/modules/guests/client/GuestAuthForm";

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };
export default function RegisterPage() {
  return <Suspense><GuestAuthForm mode="register" /></Suspense>;
}
