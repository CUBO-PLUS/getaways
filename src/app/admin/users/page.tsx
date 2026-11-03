import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import UsersPanel from "@/modules/users/client/users-panel";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function UsersPage() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  return <UsersPanel currentUserId={actor.id} />;
}
