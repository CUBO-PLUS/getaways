import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import UsersPanel from "@/modules/users/client/users-panel";
import { listUsers } from "@/modules/users/server/users";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN") notFound();
  const [allUsers, query] = await Promise.all([listUsers(actor), searchParams]);
  const users = allUsers.map(({ id, email, name, role, active }) => ({ id, email, name, role, active }));
  return <UsersPanel users={users} currentUserId={actor.id} created={query.created === "1"} />;
}
