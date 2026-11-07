import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { EditUserForm } from "@/modules/users/client/user-form";
import { listUsers } from "@/modules/users/server/users";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  const { id: rawId } = await params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) notFound();
  const user = (await listUsers(actor)).find(candidate => candidate.id === Number(rawId));
  if (!user) notFound();
  const displayUser = { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
  return <EditUserForm user={displayUser} currentUserId={actor.id} />;
}
