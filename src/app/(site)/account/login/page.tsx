import { Suspense } from "react";
import type { Metadata } from "next";
import GuestAuthForm from "@/modules/guests/client/GuestAuthForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export default function LoginPage() {
  return <Suspense><GuestAuthForm mode="login" /></Suspense>;
}
