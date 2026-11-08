import { notFound, redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import { listCategories } from "@/modules/categories/server/category-admin";
import CategoryManager from "@/modules/categories/client/category-manager";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function BlogCategoriesPage() {
  const actor = await getSession();
  if (!actor) redirect("/admin/login");
  if (actor.role !== "ADMIN" && actor.role !== "EDITOR") notFound();
  const categories = await listCategories(actor, "blog");
  return <CategoryManager kind="blog" categories={categories} />;
}
