import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import PasswordForm from "@/modules/users/client/password-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PasswordPage() {
  if (!await getSession()) redirect("/admin/login");
  return <PasswordForm />;
}
