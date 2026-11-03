import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import BlogAdmin from "@/modules/content/client/blog-admin";

export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN" && actor.role !== "EDITOR") redirect("/admin");
  return <BlogAdmin />;
}
