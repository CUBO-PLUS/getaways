import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { CreateUserForm } from "@/modules/users/client/user-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function NewUserPage() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  return <CreateUserForm />;
}
