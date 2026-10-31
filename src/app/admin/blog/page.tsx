import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isBlogAdmin } from "@/modules/content/server/blog-auth";
import BlogAdmin from "@/modules/content/client/blog-admin";

export const dynamic = "force-dynamic";
export default async function Page() {
  const cookie = (await cookies()).toString();
  if (!(await isBlogAdmin(new Request("http://localhost", { headers: { cookie } })))) redirect("/admin/blog/login");
  return <BlogAdmin />;
}
