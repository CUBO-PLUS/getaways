import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isBlogAdmin } from "@/modules/content/server/blog-auth";
import BlogEditor from "@/modules/content/client/blog-editor";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const cookie=(await cookies()).toString();
 if(!(await isBlogAdmin(new Request("http://localhost",{headers:{cookie}}))))redirect("/admin/blog/login");
 return <BlogEditor id={(await params).id}/>;
}
